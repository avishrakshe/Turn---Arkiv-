# Turn on Arkiv: entity schema (as built)

> SDK `@arkiv-network/sdk@0.8.1`, `arkiv-encryption@0.1.0`, network **Tiramisu** (chain `7738577`).
> Source of truth in code: [`src/arkiv/writer.ts`](../src/arkiv/writer.ts) (what is written),
> [`src/arkiv/records.ts`](../src/arkiv/records.ts) (what a reader accepts),
> [`src/core/lease.ts`](../src/core/lease.ts) (expirations).

Turn keeps money on UPI or cash and uses Arkiv as the shared, tamper-evident ledger of a savings
committee (BC, kitty, chit). Each record is created by the member it speaks for. Every record except
the invite is `readonly`, and its payload is encrypted with the circle key.

## Trust model in one paragraph

**`$creator` decides who said something; `$owner` is never trusted.** A reader takes the organiser's
address from the invite link and fetches only the organiser's records. After the roster exists, it
fetches only records created by the roster's addresses (`$creator = a OR …`), so records from
anyone else are never fetched or decrypted. They are only counted ("1 unverified record ignored").
A payment counts as **confirmed** only when two records exist: a `pay_claim` created by the payer,
and a `pay_ack` referencing that claim, created by **that round's collector**. Every decrypted
payload repeats `t, c, by, r` (type, circle, creator, round), and the reader rejects any mismatch
with the entity's public metadata. So a valid ciphertext can't be replayed into another circle,
round or member's entity.

## Conventions (every entity)

| Item | Value | Why |
|---|---|---|
| `project` | `str("turn_arkiv_v1")` | Namespace. Not authentication. |
| `entity_type` | `str`, one of the types below | Query by record kind. |
| `circle_id` | `str`, 32 lowercase hex chars (128 random bits) | Groups one committee's records. Random, so it reveals nothing and can't be guessed. |
| `created_at` | `u64(Date.now())`, ms | Display only. Ordering uses the chain's `createdAt` block. |
| `op_id` | `str`, 32 hex chars, random per write | Idempotency: after an ambiguous write we look for this op_id before anything else, and readers keep one record per `(creator, op_id)`. |
| Content type | `application/vnd.arkiv.encrypted.v1` (`arkiv-encryption`) | AES-256-GCM, key = circle key. `bid_commit` alone has an empty payload (`application/octet-stream`). |
| Payload framing | `u32 length ‖ UTF-8 JSON ‖ zero padding` to 256 / 512 / 1024 / 2048 / 4096 bytes, then encrypted | Ciphertext length shows only the bucket, never whether an amount is ₹1,000 or ₹10,000. |
| Payload binding | decrypted JSON carries `v, t, c, by, r` | `arkiv-encryption` has no associated data, so we bind in the plaintext (see friction #3). |
| Attribute names | `[a-z][a-z0-9_]*` | Tiramisu rejects uppercase. |

**Never in attributes:** names, phone numbers, UPI IDs, amounts, notes, reasons. Attributes hold
random ids, round numbers, due dates, entity keys, booleans and (roster only) member addresses, which
are already public as the creators of the circle's records.
**Never on Arkiv at all:** private keys, the circle key, real identities, UPI IDs, money.

## Flags, owner and creator

| Group | Types | `readonly` | `permissionlessExtension` | Why |
|---|---|---|---|---|
| Lease records | `circle`, `roster`, `member`, `pay_claim`, `pay_ack`, `dispute`, `round_result`, `bid_close`, `bid_reveal` | ✓ | ✓ | No one, not even the creator, can edit a record after the fact; corrections are new records. **Any member can renew the lease**, so an organiser who vanishes can't let the evidence expire. |
| Invite | `invite` | ✗ | ✗ | The organiser may update `seats_left`. It is meant to die. |
| Sealed bid | `bid_commit` | ✓ | ✗ | Short-lived by design; nobody needs to keep it alive. |

A reader **rejects** a record whose flags differ from this table (`reason: "flags"`). This stops a
member from publishing a lease record that only they could keep alive.

Owner = creator at creation for every type. Turn never trusts `$owner`. An ownership change (organiser
handover, `changeOwnership`) changes only who *manages* the circle entity, shown as "Created by X ·
Managed by Y". Trust stays with the immutable `$creator`.

## Entity Expiration (per type, product logic)

Let `P` = round period (monthly 30 d, weekly 7 d, demo 10 min), `N` = members = rounds.

| Type | Expiration | Product reason |
|---|---|---|
| `invite` | `ExpirationTime.fromHours(48)` | An old WhatsApp link stops working by itself. The join screen refuses an expired invite. |
| `bid_commit` | reveal window end + 1 day, at least 2 days (`fromBlocks`) | Only needed until bids are opened. |
| `circle` | **scheduled end of the last round + 30 days**: `fromBlocks((start + N·P − now + 30 d) / 2 s)` | The record must outlive the committee, with a month for late disputes. |
| every other lease record | `ExpirationTime.atBlock(circle.expiresAt, { atLeast: fromDays(1) })` ("as circle") | Dies with the circle, never before. |

The circle screen shows "Record kept until <date>". That is the earliest deadline among the circle's
records, converted at 2 s/block.

### Lifetime Extension (a lease renewed by activity, and by anyone)

| Trigger | Who | Target (absolute block, same for every record) | Code |
|---|---|---|---|
| Closing a round | organiser | `head + (max(scheduled end, now + remaining rounds · P) − now + 30 d)`: committees that run late keep their record longer | `leaseTargetBlock`, `closeRound` |
| "Keep our record alive" | **any member** (permissionless extension) | `max(latest deadline, head) + 90 days` | `keepAliveTargetBlock`, `keepAlive` |

Both run as **one atomic `executeBatch`**. The batch extends only records whose deadline is earlier
than the target, because the engine rejects an extension that doesn't move the deadline later, and one
rejection fails the whole batch. Closing a round puts the `round_result` create and the extensions in
the same batch, so the result and the renewal land together or not at all.

## Entity types

### `circle`: the rules
| | |
|---|---|
| Creator | organiser |
| Attributes | common only |
| Payload | `{ name, template, amount_inr, members, frequency, mode, start_ms, due_days, max_discount_bps, reveal_window_ms, organiser_first }` |
| Why | The rules everyone agreed to. Readonly, so the organiser can't quietly change the amount or order. The earliest `circle` entity for a `circle_id` wins; a later copy by anyone is ignored. |

### `invite`: join window
| | |
|---|---|
| Creator | organiser |
| Payload | `{ seats_left }` |
| Link | `https://<app>/join#c=<circle_id>&o=<organiser>&k=<circle key>`. Everything after `#` stays in the browser and is never sent to Vercel or Arkiv. |

### `member`: "I joined"
| | |
|---|---|
| Creator | the joining member (their own key) |
| Payload | `{ display_name, lang }`. Synthetic names only in this project. |
| Why | Members publish their own membership, so the organiser can't invent members. |

### `roster`: who is in, in turn order
| | |
|---|---|
| Creator | organiser |
| Attributes | common + `member_count: u64`, `m1 … mN: addr` (public turn order; `m_r` collects round `r`) |
| Payload | `{ members: [address…], member_keys: [member entity key…] }`. It must equal `m1…mN` or the roster is rejected. |
| Valid when | organiser's earliest roster after the circle; contains the organiser; size ≤ `members`; every listed address has its own `member` record whose key matches and that predates the roster |
| Why | From here on, only these wallets' records count. Turn order is public so **anyone can verify payments without the circle key** (`/verify`); names and amounts stay encrypted. |

### `pay_claim`: "I've paid"
| | |
|---|---|
| Creator | payer |
| Attributes | common + `round: u64`, `due_at: u64` (ms; must equal the round's due time from the rules or the record is rejected) |
| Payload | `{ amount_inr, method: "UPI"\|"cash", note }` |
| Why | The payer's own signed statement. Alone it shows "Says paid · waiting for <collector>". |

### `pay_ack`: "Received"
| | |
|---|---|
| Creator | the round's collector (`m_r`): members pay the round's recipient directly |
| Attributes | common + `round: u64`, `due_at: u64`, `ref_key: key` (the claim), `on_time: bool` |
| Payload | `{ ref, status: "received" }` (`ref` must equal `ref_key`) |
| Why | Two-party confirmation. An ack from anyone except that round's collector is ignored. |

### `dispute`: "Something's wrong"
| | |
|---|---|
| Creator | any roster member (owned by them, so the organiser can't delete it) |
| Attributes | common + `round: u64`, `ref_key: key` (the disputed claim, ack or result) |
| Payload | `{ reason: "not_received"\|"wrong_amount"\|"wrong_result"\|"other", note }` |
| Why | A permanent, visible objection. Payment state precedence: disputed > confirmed > claimed. |

### `round_result`: who took the pot
| | |
|---|---|
| Creator | organiser |
| Attributes | common + `round: u64`, `is_final: bool` |
| Payload | `{ winner, discount_bps, payout_inr, share_inr, close_key, reveal_keys }` |
| Why | Every client recomputes the winner from the roster (fixed order: `m_r`) and flags "⚠ The result doesn't match the turn order". |

### `bid_commit` / `bid_close` / `bid_reveal` (sealed bids)
Schema and reader validation exist. **The bidding UI is not built** (feature 11 was cut first). See
[docs/decisions.md](../docs/decisions.md).

## Every query the app runs

All reads are pinned with `.atBlock(head)` and walked page by page (`limit(200)`, `page.next()` cursor),
restarting once on an expired cursor ([`src/arkiv/reader.ts`](../src/arkiv/reader.ts)). Arkiv has
no server-side ordering, so results are sorted on the client by `(createdAt block, key)`.

Raw strings are exactly what the SDK sends as `arkiv_query` params (from a logged request).

**Q1. Organiser's records** (circle screen, join screen; [`circle.ts`](../src/arkiv/circle.ts))
```ts
client.select({ key, owner, creator, createdAt, expiresAt, creationFlags, contentType, payload, attributes })
  .where([eq("project", str("turn_arkiv_v1")), eq("circle_id", str(CIRCLE)), or([eq("$creator", addr(ORGANISER))])])
  .atBlock(head).limit(200).fetch()
```
`project = str('turn_arkiv_v1') AND circle_id = str('<CIRCLE>') AND $creator = addr(<ORGANISER>)`

**Q2. Roster members' records** (only the wallets the roster names)
`project = str('turn_arkiv_v1') AND circle_id = str('<CIRCLE>') AND ($creator = addr(<m2>) OR … OR $creator = addr(<mN>))`

**Q3. What the scope left out** (count only: `select({ key, creator, attributes })`, no payload)
`project = str('turn_arkiv_v1') AND circle_id = str('<CIRCLE>')`

**Q4. Joins before the roster exists** (any creator; validated by decryption + binding)
`project = str('turn_arkiv_v1') AND circle_id = str('<CIRCLE>') AND entity_type = str('member')`

**Q5. Who hasn't paid** (organiser; [`queries.ts`](../src/arkiv/queries.ts)). A compound query with
`u64` ranges on typed attributes, attributes only, and cursor pages of 100:
```ts
client.select({ key: true, creator: true, attributes: { round: true, due_at: true } })
  .where([eq("project", str("turn_arkiv_v1")), eq("entity_type", str("pay_claim")), eq("circle_id", str(CIRCLE)),
          lte("due_at", u64(NOW_MS)), gte("round", u64(FIRST_DUE)), lte("round", u64(LAST_DUE)),
          or(ROSTER.map((m) => eq("$creator", addr(m))))])
  .atBlock(head).limit(100).fetch()
```
`project = str('turn_arkiv_v1') AND entity_type = str('pay_claim') AND circle_id = str('<CIRCLE>') AND due_at <= u64(<NOW_MS>) AND round >= u64(<FIRST>) AND round <= u64(<LAST>) AND ($creator = addr(<m1>) OR …)`
Late = every (round, member ≠ collector) in the due rounds with no claim.

**Q6. Write reconciliation** (after an ambiguous write; [`writer.ts`](../src/arkiv/writer.ts))
`project = str('turn_arkiv_v1') AND op_id = str('<OP_ID>')` + `.createdBy(<ME>)`, `limit(5)`

**Q7. `/verify`, keyless** ([`public-ledger.ts`](../src/arkiv/public-ledger.ts)). Selects
`key, creator, createdAt, expiresAt, creationFlags, attributes`, never the payload:
1. `… AND circle_id = str('<CIRCLE>') AND entity_type = str('circle')` (optionally `AND $creator = addr(<ORGANISER>)`); the earliest wins and its creator is the organiser.
2. `… AND entity_type = str('roster') AND $creator = addr(<ORGANISER>)`, then `getEntity(rosterKey)` for `m1…mN`.
3. Q2 over `m1…mN`, then Q3 for the ignored count.

**Single-entity reads:** `getEntity(circleKey)` right after creating a circle, to read its real
`expiresAt` (other records die with it).

**Live updates** ([`lib/live.ts`](../lib/live.ts)): `eventsClient().watchEntityEvents({ onEntityCreated, onExpiryExtended, onOwnershipTransferred, onError })`
over `webSocket("wss://rpc.tiramisu.db-chain.testnet.arkiv.network")`, **no `fromBlock`**. Events
carry keys only. A create whose `owner` (= creator at creation) is a circle participant, or an
extension/transfer of a known key, triggers a coalesced re-read (Q1–Q3), at most every 8 s.

## What is public on the explorer

| Anyone reading Tiramisu sees | Only circle members see (encrypted) |
|---|---|
| That an address created a Turn record of a type, in a random `circle_id`, at a block | Committee name, amount, frequency, rules |
| Round numbers, round due dates (`due_at`), claim↔ack links (`ref_key`), `on_time`, `is_final` | Display names, languages |
| The roster's member addresses in turn order (already visible as the circle's writers) | Payment amounts, methods, notes |
| Which addresses write in the same `circle_id` | Dispute reasons and notes, winners and payouts |
| Ciphertext size bucket, timing, expiry | — |

The circle key exists only in the invite link fragment and on members' devices.
