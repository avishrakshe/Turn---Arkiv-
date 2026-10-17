# Decisions

## 2026-10-17: build decisions (what shipped, and why)

| Decision | Why |
|---|---|
| **Next.js 16 PWA** (App Router, all screens client-side) + two Node routes (`/api/drip`, `/api/rpc`) | The brief asks for Next.js; the screens are static and talk to Arkiv from the browser. |
| **Accounts: a key on this phone** (random EOA, encrypted in IndexedDB under a non-extractable AES-GCM key) with a **backup file** and restore in Settings | Works on every browser we tested. mera passkeys sign Tiramisu transactions correctly (see Phase 1 below), but WebAuthn PRF support on budget Android phones and their password managers is uneven. One member who can't sign in breaks the whole committee, so we shipped the option we could make reliable today. The passkey path stays a drop-in later: same `LocalAccount` interface. |
| **Gas: server drip** (`/api/drip`, 0.02 GLM, once per address) | Members stay the `$creator` of their own records. A record costs ~110–134k gas, so the drip covers ~150 records. The live smoke caught that a second drip went through when the first was below the "already funded" threshold; now **any** balance refuses ([evidence](evidence.md)). |
| **Lease records are `readonly` + `permissionlessExtension`** | "Keep our record alive" must work for any member, especially when the organiser has vanished. Readers reject records with other flags. |
| **Roster turn order is public** (`member_count`, `m1…mN` addr attributes) | Lets `/verify` and the `curl` in the README confirm payments with no circle key and no Turn server. Those addresses are already public as the circle's writers. Names and amounts stay encrypted. |
| **`due_at` (u64) on payment records**, checked against the rules | Enables the "Who hasn't paid" range query without decrypting. A `due_at` that doesn't match the rules is rejected, so the public attribute can't be gamed. |
| **Members pay the round's collector directly**; the collector acks | That's how most kitty and family BCs run. The organiser publishes rules and results only. |
| **Close round = one atomic batch** (`round_result` + lease extensions) | Result and renewal can't drift apart. |
| **Anonymous RPC first, keyed proxy as fallback** (`/api/rpc`) | The anonymous budget is finite (friction #4). `/verify` deliberately has no fallback, because it proves the ledger is readable without Turn. |

### Cut or partial, said plainly

- **Feature 8, owner-controlled shorter expiry: not possible as specified.** Lease records are
  permissionlessly extensible, and an extension can only move a deadline *later* (the SDK docs say so
  and the engine rejects it). An owner can't shorten them; only `deleteEntity` removes one early, and
  readonly entities can still be deleted by their owner. "Close circle and expire in 30 days" would
  mean either giving up community extension or deleting records, which defeats the point of the
  ledger. We therefore **do not enter the Privacy track**. Settings → "What's public" explains what
  is visible.
- **Feature 9, handover:** `handOver()` (`changeOwnership` of the circle entity) and the "Created by X ·
  Managed by Y" line exist. There is no UI button: trust stays with the creator, so a new manager
  couldn't publish organiser records, and a half-working control would mislead.
- **Feature 11, sealed bids:** schema and reader validation only, no UI.

## 2026-10-15: Phase 1 (verify and plan)

| Check | Result | Evidence |
|---|---|---|
| SDK | `@arkiv-network/sdk@0.8.1`; declarations inspected (`createPublicClient`, `createWalletClient`, `select().where().createdBy().atBlock().limit().fetch()`, `ExpirationTime`, `watchEntityEvents`, `executeBatch`, attr constructors) | `node_modules/@arkiv-network/sdk/dist/*.d.ts` |
| Network | Tiramisu chain id `7738577`, 2 s blocks, gas price ≈ 1 gwei | `npm run probe` |
| Plain GLM transfer | estimate 21,000 gas; **live transfer confirmed 2026-10-17** | [evidence.md](evidence.md) §2 |
| mera on Tiramisu | A mera secp256k1 session (`toViemAccount`) signs EIP-1559 transactions for chain 7738577 byte-identically to viem's `privateKeyToAccount` | `tests/mera-signing.test.ts` |
| Live entity write | **Confirmed 2026-10-17**: create → query → read back → member extension → WebSocket events | [evidence.md](evidence.md) §1 |
