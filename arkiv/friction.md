# Building on Arkiv — friction log

Logged as we hit it. Environment unless stated: Windows 11, Node 24.19.0, npm 11.17.0,
`@arkiv-network/sdk@0.8.1`, `viem@2.57.7`, `arkiv-encryption@0.1.0`, Tiramisu (chain 7738577),
anonymous RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.

---

## 1. Gas estimate for a create from an unfunded account returns an opaque error

- **Date:** 2026-10-15
- **Steps:** `npm run probe` ([scripts/probe-network.ts](../scripts/probe-network.ts)). It builds a
  `createWalletClient` for a freshly generated, **unfunded** account behind a guarded custom transport
  (broadcast blocked, only reads + `eth_estimateGas` allowed) and calls `createEntity({...})` with a
  1,052-byte payload, 5 attributes, `fromDays(180)`, `readonly: true`.
- **Observed:** `EntityMutationError: Transaction failed: Execution error without revert data`.
  The same probe's plain value transfer (`sendTransaction`, value 0) estimates fine at 21,000 gas.
- **Expected:** either a gas number (Ethereum nodes estimate without balance when no fee fields are
  set), or an error that says *insufficient funds for gas × price*.
- **Why it matters:** the SDK has no public create estimator, and this message is identical to the one
  the write-safety guidance says can follow a *lost send response*. A new developer can't tell
  "you have no GLM" from "your transaction may or may not have been sent".
- **Workaround:** check `getBalance` before any estimate and show "fund this address" first.
  Re-test with a funded account pending (see Phase 1 report).

## 2. No documented pattern for sharing one encryption key with a group

- **Date:** 2026-10-15
- **Context:** `arkiv-encryption` (and the `arkiv-encryption` skill) say never to put the key in a URL,
  and the package has "no persistence, escrow/recovery, automatic rotation, sharing or revocation".
  A savings committee needs 5–20 people to read the same records with no server.
- **What we did:** carry the circle key in the invite link **fragment** (`#…&k=`), which browsers never
  send to a server, and store it locally per device. Documented as a deliberate trade-off: anyone who
  gets the WhatsApp message can read the circle (but still can't write as a member — writes are
  creator-scoped to the roster).
- **Ask:** an official "group key via link fragment" or per-member key-wrapping recipe, with its threat
  model, would save every multi-user app from re-deriving this.

## 3. Ciphertext is not bound to the entity (no associated data)

- **Date:** 2026-10-15
- **Context:** the v1 envelope is `IV ‖ ciphertext ‖ tag` with no AAD, so any valid envelope can be
  copied into another entity (another circle, round, or creator) and still decrypt.
- **Workaround:** every Turn payload repeats `t`, `c`, `by`, `r` inside the plaintext and the reader
  rejects mismatches against the entity's attributes and chain `creator`. An optional AAD parameter
  (e.g. bind to `project/entity_type/creator`) in `encryptPayload` would make this unnecessary.
