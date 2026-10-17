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

## 4. Anonymous query budget: a 429 with `retry-after: 1789` becomes a ~30-minute silent hang

- **Surface:** public RPC (`arkiv_query`) + SDK 0.8.1 query builder over viem `http` transport.
- **Date:** 2026-10-17, ~13:25 IST, from one IP (Cloudflare edge `BOM`).
- **Steps:** ran the app locally in three browser origins (three "phones") for ~20 minutes. Each
  screen load ran 3–4 block-pinned `arkiv_query` walks with `payload` selected, plus a watcher that
  re-read the circle on every relevant event. Then, from Node:
  `client.select({...}).where([project, circle_id, $creator]).limit(200).fetch()`.
- **Observed:** the call appeared to hang. Two runs left in the background (transport
  `http(url, { retryCount: 1, timeout: 15_000 })`) eventually **succeeded after 1,946,435 ms (32.4 min)
  and 2,046,438 ms (34.1 min)** for a single `fetch()` of 3 entities. That is the 15 s timeout plus
  viem waiting out `Retry-After`, then retrying once after the window reset. With `onFetchResponse` logging and
  `retryCount: 0` the cause appeared immediately:
  ```
  HTTP 429
  {"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}
  ratelimit: limit=10000, remaining=0, reset=1789
  retry-after: 1789
  access-control-expose-headers: RateLimit, Retry-After, Link, Arkiv-Quota-Used-Percent, Arkiv-Cost
  ```
  With our earlier `retryCount: 1`, viem honours `Retry-After`, so one query sleeps ~30 minutes
  before failing. The SDK then surfaces a generic `HttpRequestError`, not a `QueryError`.
- **Expected:** a budget refusal that a browser app can recognise and show quickly (e.g. a
  `QueryError` with `kind: "budget"` carrying `retryAfter`), and documentation of the anonymous budget
  (units, window, per-IP or not) next to the query docs. Dev builds of an app hit it fast; real users
  sharing a carrier-grade NAT IP (common on Indian mobile networks) could hit it together.
- **Good:** the response itself is excellent — clear error code, help link, `RateLimit` headers,
  `Arkiv-Cost` exposed to browsers via CORS.
- **What we changed:** `retryCount: 0` on every HTTP transport; reads fail fast with "Arkiv's free
  reading limit for this connection is used up"; the live watcher coalesces re-reads (≥ 8 s apart) and
  backs off reconnects; the loader dropped one redundant query after the roster exists; the app falls
  back to a same-origin `/api/rpc` proxy that adds our access key **server-side**. `/verify` stays
  direct-to-RPC on purpose (it proves the ledger is readable without Turn), and says so on a 429.
- **Suggested fix:** SDK: detect HTTP 429 / `ANON_COST_LIMITED` and throw a typed error without
  sleeping on `Retry-After` by default; docs: state the anonymous budget and a cost table per select
  field (does `payload: true` dominate cost?).
