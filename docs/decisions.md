# Phase 1 decisions (2026-10-15)

## Verified

| Check | Result | Evidence |
|---|---|---|
| SDK | `@arkiv-network/sdk@0.8.1` installed; declarations and `src/` inspected (`createPublicClient`, `createWalletClient`, `select().where().createdBy().atBlock().limit().fetch()`, `ExpirationTime`, `watchEntityEvents`, attr constructors `u64/key/bytes32/addr/bool/str`) | `node_modules/@arkiv-network/sdk/src` |
| Network | Tiramisu chain id `7738577`, 2 s blocks, head ≈ 618,722, gas price ≈ 1 gwei | `npm run probe` |
| Plain GLM transfer | `eth_estimateGas` = 21,000 for an EOA→EOA transfer (no-EVM executor still accepts value transfers in estimation) | `npm run probe` |
| mera on Tiramisu | A mera secp256k1 session wrapped with `toViemAccount` produces **byte-identical** signed EIP-1559 transactions for chain 7738577 and identical, deterministic EIP-191 signatures as viem's `privateKeyToAccount` | `tests/mera-signing.test.ts` (3/3 pass) |
| Live drip transfer | **Pending** — needs the dev EOA funded from the faucet | `scripts/test-drip.ts` ready |
| Live entity write | **Pending** — same | Phase 2 smoke |

## Accounts: passkey first (mera PRF), local key fallback

- **Primary:** "Continue with passkey". `createPasskeyWithPrfOutput` / `getPasskeyPrfOutput` (mera
  0.2.0) → 32-byte PRF output → HKDF-SHA256 (`info = "turn-arkiv.v1.secp256k1"`) → secp256k1 key →
  `createSecp256k1SigningSession` → `toViemAccount` → Arkiv `createWalletClient({ account })`.
  The same synced passkey (e.g. Google Password Manager) gives the same address on a new phone,
  so there is **no seed phrase** and nothing to back up.
- **Fallback:** "Use this phone only" — a random EOA whose private key is wrapped with a
  non-extractable AES-GCM `CryptoKey`, both stored in IndexedDB, with an export/backup screen.
- **Why both:** WebAuthn PRF support is not universal (it depends on browser + password manager;
  some Android OEM managers and older desktops don't evaluate PRF). A committee app that fails for
  one member fails for the whole group, so the app detects a PRF failure and falls back instead of
  blocking. The signing path (the part Arkiv sees) is identical and verified for both.
- **Limits stated honestly:** the fallback protects against casual storage copying, not against
  malicious script running on the app origin; clearing site data without an export loses the account.

## Gas: server drip (option a)

- New member address → `POST /api/drip { address }` → the server sends `DRIP_AMOUNT_GLM` from the
  dev EOA. Members stay the **creators** of their own entities (creator = provenance; creator-scoped
  queries keep working). No relayer, no signatures re-published by a server.
- Refusals: invalid address, the drip's own address, recipient already holds
  ≥ `DRIP_MAX_RECIPIENT_BALANCE_GLM`, recipient has ever sent a transaction (one drip per address),
  drip balance low. Per-IP rate limit in the function (best effort per instance) — documented as
  such; Vercel Firewall rate-limit rule recommended for production.
- Uncertain sends are reported with their hash and **never resent automatically**.
- Key stays in `DRIP_PRIVATE_KEY` (server env only); nothing `VITE_*` contains a secret.

## Data model changes vs the brief

- Added **`bid_close`** (organiser, readonly): the chain block that separates commits from reveals.
  Without it, the commit/reveal windows would rely on forgeable client timestamps.
- Payments go **directly to the round's pot recipient** ("collector" = recipient), as in most kitty
  groups; the organiser only publishes rules and results.
- `pay_ack` gets a public `on_time: bool` and `round_result` a public `is_final: bool`, so Turn Score
  can be computed by anyone **without** circle keys.
- `member_addr` is not needed: the chain `creator` already is the member address.

## Stack

Vite 7 + React 19 + TypeScript 5.9 PWA (static, hash routing so invite keys stay in the fragment),
one Vercel Node function (`/api/drip`), Vitest 4. SDK pinned to `0.8.1`, viem `2.57.7`.
