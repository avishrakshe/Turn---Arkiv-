# Devfolio answers (drafts)

Drafts for every question in the challenge's `docs/submission-checklist.md`. Placeholders in
`<…>` are filled at submission time. Never paste keys or credentialed RPC URLs into the form.

**Project name:** Turn on Arkiv
**Tagline:** Save together. Take turns. A savings-committee record nobody can rewrite.
**Tracks:** Best Indian Use Case only (decided 2026-10-17). The Security and Censorship Resistance
answers below are kept for reference but are **not** entered.
**Links:** repo <https://github.com/avishrakshe/Turn---Arkiv->, video `<YouTube/Drive link>`

---

### The problem it solves *

Rotating savings committees are how tens of millions of Indians save: family **BCs**, office
**committees**, **kitty** parties, chit-style groups. Five to twenty people pay ₹1,000–₹10,000 every
month and one of them takes the pot. They work on trust, and the record is the organiser's notebook or
a WhatsApp thread. The same three failures repeat:

1. **"I paid!" / "You never sent it."** UPI screenshots get lost or doctored, and cash leaves no trace.
2. **Rules drift.** The organiser "remembers" a different amount or turn order in month 7.
3. **The organiser vanishes**, along with the only copy of who paid and who already took the pot.

Turn keeps money exactly where it is (UPI or cash) and gives the group a **shared record every member
owns**. Each member's "I've paid" is created by their own key; it becomes **"Paid ✓ confirmed by
Ravi"** only when the round's collector confirms it from *their* key. Rules are read-only from day
one. Disputes are permanent and can't be deleted by the organiser. Any member can keep the whole record
alive. Anyone can read it without Turn's servers.

### Challenges I ran into *

- **Trust without a server.** A pay_ack is only meaningful from the right wallet. We made every reader
  scope queries by `$creator` (organiser, then roster wallets only) and never trust `$owner`. Because
  `arkiv-encryption` has no associated data, we bind type/circle/creator/round inside the encrypted
  payload so a valid ciphertext can't be replayed into another circle, round or member's entity
  (unit-tested).
- **Group keys.** Arkiv's encryption package deliberately has no key sharing. We carry the committee
  key in the invite link's `#fragment` (never sent to a server) and documented the threat model.
- **Leases vs privacy.** We planned an owner-controlled shorter expiry, then found it contradicts our
  core design: permissionlessly-extensible records can't be shortened (extensions only move later). We
  kept censorship resistance and dropped that feature and the Privacy track rather than ship half of it.
- **The anonymous RPC budget.** During testing our reads started hanging. It was an HTTP 429 with
  `retry-after: 1789`, which viem obeys silently. We now fail fast, back off the live watcher, cut one
  query per screen, and fall back to a keyed same-origin proxy (`/api/rpc`). `/verify` stays
  proxy-free on purpose. Logged with full reproduction in friction.md.
- **Our own bug, caught on chain:** the live smoke showed our faucet drip paying the same address twice.
  Fixed and re-verified with tx hashes.

### 1. Live app URL *
<https://turn-arkiv.vercel.app> (keyless verifier: <https://turn-arkiv.vercel.app/verify>)

### 2. Does any team member hold Indian nationality? *
Yes.

### Why India? (Best Indian Use Case)
**Who:** families, office colleagues and kitty groups in India who already run ₹1,000–₹10,000/month
committees over WhatsApp, often on budget Android phones. **What changes for them from day one:**

- Nothing about money: they still pay on UPI (Turn opens the UPI app with the amount filled) or in
  cash. No wallet, no crypto, no seed phrase; the words on screen are "I've paid", "Received",
  "Something's wrong", "Keep our record alive".
- The "who paid" argument ends: each payment is either *Says paid · waiting for Ravi* or *Paid ✓
  confirmed by Ravi*, signed by both.
- Rules can't drift: amount and turn order are read-only from the first day.
- The organiser no longer holds the only copy, and can't erase complaints or let the record lapse.
- Hindi + English, ₹ with Indian grouping (₹1,00,000), invite via WhatsApp, works in a mobile browser.

It works today on the live link: create a committee, share the WhatsApp invite, pay and confirm.

### Why this pillar? Security *(not entered)*
**Who is misled today:** the member whose payment is denied, and the group misled by an organiser who
edits the notebook. **What Turn changes:** the app shows and filters records **by their on-chain
creator, never by a field anyone can write.**
- A payment is confirmed only if the `pay_claim`'s `$creator` is the payer and the `pay_ack`'s
  `$creator` is that round's collector from the roster. A receipt from anyone else, even a
  roster member, is ignored (`tests/payments.test.ts: "ignores a forged pay_ack…"`).
- After the roster exists, queries are `$creator = m1 OR … OR mN`, so records from other wallets are
  **never fetched or decrypted**, only counted: "1 unverified record ignored".
- Every record shows **"Signed by <name> · 0x12…ab · View on explorer"**.
- Readonly + payload binding stop edits, replays from another circle, and copies between members.

### Why this pillar? Censorship Resistance *(not entered)*
**Who is censored today:** members whose evidence lives on the organiser's phone. The organiser can
delete a WhatsApp message, refuse to show the notebook, or disappear. **What changes:**
- **Anyone outside Turn can read and verify the ledger without Turn's backend.** `/verify` is a static
  page that queries the public Tiramisu RPC from the browser, with **no key**. The README has the
  same check as an SDK snippet and a raw `curl`.
- **Any member can keep the record alive** (`permissionlessExtension` on every record, one-batch
  renewal). An organiser who vanishes can't let the evidence expire.
- Disputes are owned by the member who filed them. The organiser can't delete them.

### 3. Why Arkiv? *
What breaks elsewhere:
- **Postgres / our own API:** the operator (us or the organiser) can edit or delete rows, and members
  must trust that we don't. If Turn shuts down, the committee loses its record. The whole point is
  that *no single party* holds the pen.
- **IPFS:** content-addressed blobs, no queries by `circle_id`/`round`/`due_at`, no native
  writer-scoped queries, no expiry or community renewal, and pinning depends on someone paying.
- **A subgraph:** needs contracts to index. Arkiv's no-EVM chain gives us typed queryable attributes
  directly, and a subgraph adds an operator again.

**What we get only from Arkiv:** immutable `$creator` per record (two-party confirmation without a
server); `readonly` records; **`permissionlessExtension`**, so any member can extend the record's
life; per-type expiration (invites die in 48 h); typed attributes with ranges for "who hasn't paid";
WebSocket entity events for live updates; atomic batches.

**What deliberately stays off Arkiv:** money (UPI/cash), real identities, phone numbers, UPI IDs
(the UPI link uses a synthetic VPA), private keys, the committee key, and notifications.

### 4. How do you use Arkiv? *
| Arkiv feature | What the user sees | Why | Code |
|---|---|---|---|
| `$creator` + `createdBy`/`or($creator=…)` | "Paid ✓ confirmed by Ravi" only from the right wallets; "Signed by … View on explorer"; "1 unverified record ignored" | Trust without a server | [circle.ts](../src/arkiv/circle.ts), [payments.ts](../src/core/payments.ts) |
| Typed attributes + compound range query + cursor pages | Organiser's **Who hasn't paid** list | `due_at`/`round` are u64, so ranges work; no payload decryption | [queries.ts](../src/arkiv/queries.ts) |
| Entity Expiration per type | "Link works until …" (invite 48 h); "Record kept until …" (schedule + 30 d) | Old WhatsApp links die by themselves; the record outlives the committee | [lease.ts](../src/core/lease.ts) |
| Lifetime Extension as a lease | Closing a round renews every record | Late-running committees keep their record | [actions.ts `closeRound`](../lib/actions.ts) |
| `permissionlessExtension` | **Keep our record alive**: any member, +90 days | Organiser can't let evidence expire | [actions.ts `keepAlive`](../lib/actions.ts) |
| `readonly` | Rules and payments can't be edited; corrections are new records | Tamper evidence | [writer.ts](../src/arkiv/writer.ts) |
| Atomic `executeBatch` | Round result + renewal land together | No half-closed rounds | [writer.ts `runBatch`](../src/arkiv/writer.ts) |
| `watchEntityEvents` over WebSocket, no `fromBlock` | Toast "Priya just paid ✓", screen updates without refresh | No polling loop | [live.ts](../lib/live.ts) |
| Encrypted payloads (`arkiv-encryption`) + size buckets | Explorer shows no names or amounts | Privacy of members | [payload.ts](../src/arkiv/payload.ts) |
| `$owner` vs `$creator` | "Created by X · Managed by Y" on the committee screen | We show `$owner` but never trust it; every trust decision uses `$creator`. (We don't ship an ownership-transfer button: a new manager couldn't publish organiser records, since trust follows the creator.) | [view.ts](../src/core/view.ts), [circle.ts](../src/arkiv/circle.ts) |

### 5. Friction report
<https://github.com/avishrakshe/Turn---Arkiv-/blob/main/arkiv/friction.md>

### 6. Wallet addresses that create your Arkiv entities *
See <https://github.com/avishrakshe/Turn---Arkiv-/blob/main/arkiv/addresses.md>. Summary: dev/drip EOA
`0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF` (smoke-test organiser, GLM drips); seeded demo
"Sharma Family BC" organiser `0x0cbaaccdcf158845b04d0e770c75248084365e40` (Meera) and four members
(Ravi `0x9b29…ef00`, Priya `0xa004…0abf`, Arjun `0x5359…9b78`, Sana `0x228a…cd3`); live-app members
create from their own browser keys.

### 7. Link to /arkiv/schema.md *
<https://github.com/avishrakshe/Turn---Arkiv-/blob/main/arkiv/schema.md>

### 8. How can judges reproduce your Arkiv usage? *
1. Open <https://turn-arkiv.vercel.app/verify#c=d2ccb6e40b03bc6280b8ea95df17536e&o=0x0cbaaccdcf158845b04d0e770c75248084365e40>: the seeded committee read
   keyless from Tiramisu (round 1 confirmed; round 2 claimed / disputed / unpaid). Expand "Queries
   this page ran".
2. Run the README's `curl` (section "Read the ledger without Turn") with the same `circle_id`: the
   roster's `m1…m5`, then every record created by those wallets. A `pay_ack` whose `ref_key` equals a
   claim's key and whose creator is `m<round>` is a confirmed payment.
3. In three browsers (normal, Incognito, another profile), open the live app → Start a committee →
   Demo, 3 members → share the link → join → I've paid → Received (watch the other screen update live)
   → Something's wrong → Keep our record alive.
4. Explorer: each record's creator and transaction; tx hashes in
   [docs/evidence.md](evidence.md).

### 9. Pre-existing work you reused *
Brand, design tokens, ring logo/components and fonts from github.com/avishrakshe/Turn (Monad
Metropolis), baseline commit `0f15c23b8c0a0a8d6e5839e60ce7b71d00e55c9d`; files listed in README →
"Pre-existing work". All Arkiv integration and core logic is new (15–18 Oct 2026). No contracts,
relayer, Monad, AUSD or EIP-7702 code.

### 10. Arkiv surfaces you used *
TypeScript SDK · Direct JSON-RPC (curl in README, debugging) · WebSocket events · Docs · Hub ·
Faucet · Access keys (server-side `/api/rpc` fallback and scripts) · Block Explorer · Arkiv skills.

### 12. How long after you started did you write your first Arkiv entity? *
More than a day. Code was ready on day 1 (15 Oct), but the dev account wasn't funded until 17 Oct; the
first entity landed within minutes of funding.

### 13. Which LLMs did you use? *
Claude (Anthropic).

### 14. The one thing Arkiv should improve first *
Make the anonymous RPC budget visible and fail-fast in the SDK: a typed `QueryError` for HTTP 429 /
`ANON_COST_LIMITED` with `retryAfter`, instead of a generic HTTP error that viem retries after a
~30-minute `Retry-After`. Document the budget and per-field query cost next to the query docs.

### 15. Open to a 20-minute feedback call? *
Yes.

### 16–17. Declarations *
Check both: built 9–18 Oct with pre-existing work disclosed; public MIT repo with accessible links.
