# Turn on Arkiv — entity schema

> Status: **Phase 1 draft** (2026-10-15). Will be updated to "as built" at the end of Phase 5.
> SDK `@arkiv-network/sdk@0.8.1`, `arkiv-encryption@0.1.0`, network **Tiramisu** (chain `7738577`).

Turn keeps money on UPI/cash and uses Arkiv as the shared, tamper-evident ledger of a savings
committee (BC / kitty / chit). Every record is created by the member it speaks for, is `readonly`,
and carries an encrypted payload that only circle members can read.

## Conventions (apply to every entity)

| Item | Value | Why |
|---|---|---|
| `project` | `str("turn_v1")` | Namespace for all queries. Not authentication. |
| `entity_type` | `str(...)`, one of the types below | Query by record kind. |
| `circle_id` | `str`, 32 lowercase hex chars (128 random bits) | Groups a committee's records without revealing anything about it. Random, so it can't be guessed or linked to people. |
| `created_at` | `u64(Date.now())` (ms) | Client time for display only. **Never trusted for ordering** — ordering uses the chain's `createdAt` block. |
| Content type | `application/vnd.arkiv.encrypted.v1` (from `arkiv-encryption`) | Every payload except `bid_commit` is AES-256-GCM ciphertext. |
| Payload framing | `u32 length ‖ UTF-8 JSON ‖ zero padding` to a bucket of 256 / 512 / 1024 / 2048 / 4096 bytes, then encrypted | Ciphertext length reveals only the bucket, not whether an amount is ₹1,000 or ₹10,000 or how long a note is. |
| Payload binding | Every decrypted payload carries `v` (schema version), `t` (entity_type), `c` (circle_id), `by` (creator address) and `r` (round, where applicable). The reader rejects the entity if any differs from the entity's public attributes / chain `creator`. | `arkiv-encryption` has no associated data, so a valid envelope could be replayed into another entity. Binding makes copies from another circle, type, round or member fail closed. |
| Flags | `readonly: true`, `permissionlessExtension: false` on every record except `invite` | A record can never be edited after the fact. Corrections are new records. Nobody outside the circle can keep records alive. |
| Attribute names | lowercase `[a-z][a-z0-9_]*` | Tiramisu rejects uppercase (`Ident32InvalidByte`). |

**Never in attributes:** names, phone numbers, UPI IDs, amounts, notes, member counts, or anything
typed by a person. Attributes hold only random ids, round numbers, entity keys, hashes and booleans.

**Never on Arkiv at all:** private keys, the circle encryption key, real identities, UPI IDs, money.

## Expiration

Let `P` be the round period (monthly = 30 days, weekly = 7 days, demo = 10 minutes), `N` the number
of members (= number of rounds).

| Name | Value |
|---|---|
| **circle deadline** | `circle` is created with `ExpirationTime.fromDays(ceil(N·P / 1 day) + 90)` (at least 90 days after the last round). Its receipt-decoded `expiresAt` block is stored in the circle view. |
| **as circle** | `ExpirationTime.atBlock(circle.expiresAt, { atLeast: fromDays(1) })` — every later record dies with the circle, not before. |

## Entity types

### `circle` — the committee rules

| | |
|---|---|
| Creator / owner | organiser |
| Flags | readonly |
| Expiration | circle deadline |
| Attributes | common only |
| Payload (encrypted) | `{ v, t, c, by, name, template, amount_inr, members, frequency: "monthly"\|"weekly"\|"demo", mode: "fixed"\|"bid", start_ms, due_days, max_discount_bps, reveal_window_ms, organiser_first }` |
| Why | The rules everyone agreed to. Readonly, so the organiser cannot quietly change the amount or order later; a "rule change" would have to be a new circle everyone can see. |

### `invite` — join window

| | |
|---|---|
| Creator | organiser |
| Flags | none (organiser may patch `seats_left`) |
| Expiration | `fromHours(48)` |
| Attributes | common only |
| Payload (encrypted) | `{ v, t, c, by, seats_left }` |
| Why | Clients refuse to join a circle whose invite entity has expired, so a leaked old link stops working after 48 h without any server. |

The invite **link** is `https://<app>/#/join?c=<circle_id>&o=<organiser address>&k=<circle key>`.
Everything after `#` stays in the browser — it is never sent to Vercel or to Arkiv.

### `member` — "I joined"

| | |
|---|---|
| Creator | the joining member |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common only |
| Payload (encrypted) | `{ v, t, c, by, display_name, lang }` — synthetic names only in this project |
| Why | Each member publishes their own membership from their own address, so the organiser cannot invent members. |

### `roster` — who is in, and in what order

| | |
|---|---|
| Creator | organiser |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common only |
| Payload (encrypted) | `{ v, t, c, by, members: [address…], member_keys: [member entity key…] }` — index = turn order for fixed mode |
| Why | Written once joins close. From then on clients **trust only entities created by roster addresses** (creator-scoped queries `$creator = addr(a) OR …`). Spam from anyone else is never fetched. The roster must be the organiser's earliest `roster` for the circle and every listed member must have a matching `member` entity. |

### `pay_claim` — "I've paid"

| | |
|---|---|
| Creator | payer |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common + `round: u64` |
| Payload (encrypted) | `{ v, t, c, by, r, amount_inr, method: "UPI"\|"cash", note? }` |
| Why | The payer's own signed statement. Alone it is only "claimed". |

### `pay_ack` — "Received"

| | |
|---|---|
| Creator | the round's collector (the round's pot recipient — members pay the recipient directly) |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common + `round: u64`, `ref_key: key` (the `pay_claim` key), `on_time: bool` |
| Payload (encrypted) | `{ v, t, c, by, r, ref, status: "received" }` |
| Why | Two-party confirmation: a payment is **confirmed** only when a `pay_claim` by the payer *and* a `pay_ack` referencing it by that round's collector both exist. An ack from anyone else is ignored. `on_time` is the collector's public attestation (used by Turn Score without decrypting anything). |

### `bid_commit` — sealed bid

| | |
|---|---|
| Creator | bidder |
| Flags | readonly |
| Expiration | `fromDays(...)` = estimated end of the round's reveal window + 1 day (minimum 2 days) |
| Attributes | common + `round: u64`, `commit: bytes32` |
| Payload | empty (`application/octet-stream`) |
| `commit` | `keccak256(abi.encode(uint32 discount_bps, bytes32 salt, string circle_id, uint64 round, address bidder))` |
| Salt | `keccak256(signMessage("Turn on Arkiv bid salt v1\ncircle:<id>\nround:<r>"))` — secp256k1 signatures are deterministic (RFC 6979), so the same account re-derives the salt on any device. |
| Why | Nobody, including the organiser, can see bids until they are revealed, and nobody can change a bid after seeing others. Short expiry: once revealed (or forfeited), the commit is no longer needed. |

### `bid_close` — bidding closed *(added in Phase 1; not in the original brief)*

| | |
|---|---|
| Creator | organiser |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common + `round: u64` |
| Payload (encrypted) | `{ v, t, c, by, r }` |
| Why | Commit-reveal needs an agreed moment when commits stop and reveals start. Wall-clock attributes are forgeable; the chain's block number of this entity is not. Commits count only if created **before** this block, reveals only **after** it. The organiser gains nothing by choosing the moment because bids are still sealed. Earliest `bid_close` per round wins. |

### `bid_reveal` — opening a bid

| | |
|---|---|
| Creator | bidder (must match the commit's creator) |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common + `round: u64`, `ref_key: key` (the `bid_commit` key) |
| Payload (encrypted) | `{ v, t, c, by, r, discount_bps, salt }` |
| Why | Anyone in the circle recomputes the hash; a reveal that doesn't match its commit, comes from another address, exceeds `max_discount_bps`, or comes from a member who already won, is invalid. |

### `round_result` — who takes the pot

| | |
|---|---|
| Creator | organiser |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common + `round: u64`, `is_final: bool` |
| Payload (encrypted) | `{ v, t, c, by, r, winner, discount_bps, payout_inr, share_inr, close_key?, reveal_keys[] }` |
| Why | The organiser announces; **every client recomputes** from the circle rules, roster, previous results, commits and reveals, and shows "Verified ✓" or "Mismatch ⚠". `is_final` lets Turn Score count completed circles without decrypting. |

Rules recomputed by clients:
- *fixed* mode: winner = `roster.members[r-1]`, discount 0.
- *bid* mode: round 1 → organiser at 0 % if `organiser_first`; last round → the only member who hasn't won; otherwise highest valid `discount_bps`, ties → earliest commit block (then lower entity key). No valid reveal → earliest-in-order eligible member at 0 %.
- If the result was published before `close + reveal_window` while a valid commit was still unrevealed → "Mismatch ⚠ (closed early)".
- `share_inr = floor(pot · bps / 10000 / (N − 1))`; each other member pays `amount_inr − share_inr` that round ("₹384 off your next payment"); winner receives `(N − 1) · (amount_inr − share_inr)`.

### `dispute` — "Something's wrong"

| | |
|---|---|
| Creator | any roster member |
| Flags | readonly |
| Expiration | as circle |
| Attributes | common + `round: u64`, `ref_key: key` (the disputed `pay_claim`, `pay_ack` or `round_result`) |
| Payload (encrypted) | `{ v, t, c, by, r, reason: "not_received"\|"wrong_amount"\|"wrong_result"\|"other", note? }` |
| Why | A permanent, visible objection. Payment state precedence: **disputed** > confirmed > claimed. |

## Queries (all pinned with `.atBlock(head)` and walked page by page)

| Purpose | Predicates |
|---|---|
| Circle | `project, entity_type="circle", circle_id` + `createdBy(organiser from invite)` |
| Joins (before roster) | `project, entity_type="member", circle_id` (any creator; validated by decryption + binding; organiser picks) |
| Roster | `project, entity_type="roster", circle_id` + `createdBy(organiser)` |
| Circle records | `project, circle_id, entity_type ∈ {…}` + `or($creator = addr(m₁), …)` over roster members |
| Turn Score (public, keyless) | `project, entity_type="pay_claim"` + `createdBy(address)`; acks by `ref_key`; finals by `is_final=true` + circle creator |

## What is public vs private

| Public (anyone reading Tiramisu) | Private (circle key holders only) |
|---|---|
| That an address created a Turn record of a given type, in a random `circle_id`, at a block | Circle name, amount, member count, frequency, rules |
| Round numbers, entity keys, ack `on_time` flag, `is_final` flag, bid commit hashes | Display names, languages, payment amounts, methods, notes |
| Which addresses interact in the same `circle_id` (the membership graph) | Bid discounts and salts (until revealed — and then only to members) |
| Ciphertext length (bucketed), timing, expiry | Dispute reasons and notes |

The circle key lives only in the invite link fragment and in each member's browser storage.
