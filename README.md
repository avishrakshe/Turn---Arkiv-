# Turn on Arkiv

**Save together. Take turns.** A tamper-evident shared record for Indian savings committees (BC, kitty,
chit), built on [Arkiv](https://arkiv.network) for the Arkiv Global Tour Stop challenge (road to
Devcon 8 Mumbai).

**Live app:** <https://turn-arkiv.vercel.app> (Tiramisu testnet, no sign-up)
**Check any committee without Turn:** <https://turn-arkiv.vercel.app/verify>

Families, office groups and kitty groups across India run committees: N people each pay a fixed
amount every month, and each month one of them takes the pot. Today the record is the organiser's
notebook or a WhatsApp thread, and the fights are always the same: *"I paid!"* / *"You never sent
it"*, rules that change mid-way, an organiser who disappears.

Turn keeps money on **UPI or cash, exactly as today**. No crypto for users, no custody. Arkiv is the
shared notebook nobody can rewrite:

- Each member's records are **created by that member's own key**. A payment shows **"Paid ✓ confirmed
  by Ravi"** only when the payer's claim *and* the collector's receipt both exist and each was created
  by the right wallet from the committee's list. A receipt forged by anyone else is not counted.
- Records are `readonly`. The organiser can't edit or delete anyone's claim, receipt or complaint.
- Every record is `permissionlessExtension`: **any member** can press *Keep our record alive*, so an
  organiser who vanishes can't let the evidence expire.
- The ledger is readable **without Turn**: `/verify` and the `curl` below go straight to Arkiv.
- Names, amounts and notes are **encrypted** for the committee (AES-256-GCM key in the invite link's
  `#fragment`, never sent to a server). On the explorer, the public sees only random ids, round
  numbers and addresses.

## What to try (2 minutes)

1. Open the **demo committee** read-only: `/verify#c=<CIRCLE_ID>&o=<ORGANISER>` (see
   [Seeded demo](#seeded-demo)). Round 1 is confirmed by Meera, round 2 has a claim waiting, a dispute
   by Ravi, and Sana hasn't paid.
2. Start your own: **Start → Start a committee → "Demo (every 10 minutes)" with 3 members**. Share the
   link to two other browsers or phones (each browser/profile is one member), join, pay, confirm. The
   other screens update live.

## Repository map

| Path | What |
|---|---|
| [arkiv/schema.md](arkiv/schema.md) | Every entity, attribute, flag, expiration, and every query the app runs |
| [arkiv/friction.md](arkiv/friction.md) | Reproducible feedback on building with Arkiv |
| [arkiv/addresses.md](arkiv/addresses.md) | Every address that creates entities on Tiramisu |
| [docs/evidence.md](docs/evidence.md) | Live smoke on Tiramisu: tx hashes, gas, WebSocket events |
| [docs/decisions.md](docs/decisions.md) | Accounts, gas, data-model decisions; what was cut and why |
| `src/arkiv/` | Arkiv layer: writer (reconciling, batch), reader (pinned, paginated), circle loader, public ledger, queries |
| `src/core/` | Pure logic: payment state machine, view model, lease/expiry maths, schedule, money |
| `app/`, `components/`, `lib/` | Next.js PWA (screens, account, live events, i18n), `/api/drip`, `/api/rpc` |
| `scripts/` | `smoke-write.ts`, `seed-demo.ts`, `test-drip.ts`, `probe-network.ts` |
| `tests/` | Vitest suites (50 tests) |

## Run locally

Requirements: Node ≥ 22 (tested on 24.19).

```bash
npm install
cp .env.example .env.local      # then fill DRIP_PRIVATE_KEY (and optionally ARKIV_API_KEY)
npm test                         # 50 unit tests, no network
npm run dev                      # http://localhost:3000
```

Environment variables (all **server-only**, see [.env.example](.env.example)):

| Name | Used by | |
|---|---|---|
| `DRIP_PRIVATE_KEY` | `/api/drip`, scripts | Funded Tiramisu dev EOA (faucet: <https://hub.arkiv.network>). `npx tsx scripts/new-dev-key.ts` creates one and prints only its address. |
| `DRIP_AMOUNT_GLM` | `/api/drip` | Default `0.02` (≈150 records) |
| `DRIP_MAX_RECIPIENT_BALANCE_GLM` | `/api/drip` | Default `0.005` |
| `ARKIV_API_KEY` | `/api/rpc`, `/api/drip`, scripts | Optional Arkiv access key (sent as `X-API-KEY`). Without it the app uses the anonymous RPC only. |
| `ARKIV_RPC_URL` | all | Optional RPC override |

To test several members on one computer, open `http://localhost:3000`, `http://127.0.0.1:3000` and
`http://[::1]:3000` (start the dev server with `npx next dev -H ::`). Each origin has its own key.

## Seeded demo

```bash
npx tsx --env-file=.env.local scripts/seed-demo.ts
```

Creates **"Sharma Family BC"**: 5 synthetic members (Meera, Ravi, Priya, Arjun, Sana), ₹5,000 a
month, each with their own key (kept in git-ignored `.seed/`):

- round 1: all four payments confirmed by Meera; result + lease renewal written in **one atomic batch**
- round 2 (Ravi collects): Meera confirmed · Priya "says paid, waiting" · Arjun disputed by Ravi
  ("Received ₹4,000, not ₹5,000") · Sana not paid and past due ("Who hasn't paid")
- Sana (a member, not the owner) presses **Keep our record alive**: every record is extended in one batch

The seeded committee: see [arkiv/addresses.md](arkiv/addresses.md) for its `circle_id`, every
creating address and its role.

## Read the ledger without Turn

Turn's servers are not needed to read or verify a committee. You need its `circle_id` (public) and,
optionally, the organiser address. Both are in the invite link before `&k=`.

**1. In a browser:** `/verify` is a static page that calls the public Tiramisu RPC directly
(`rpc.tiramisu.db-chain.testnet.arkiv.network`) and never Turn's API. It works with no key: confirmed
payments are computed from public attributes and the immutable `$creator`.

**2. With the SDK** (Node, nothing from this repo needed):

```ts
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { addr, str } from "@arkiv-network/sdk/attr"
import { eq, or } from "@arkiv-network/sdk/query"
import { http } from "viem"

const client = createPublicClient({ chain: tiramisu, transport: http() })
const CIRCLE = "<circle_id>", ORGANISER = "<organiser address>"
const base = [eq("project", str("turn_arkiv_v1")), eq("circle_id", str(CIRCLE))]

// The roster (turn order) is public: attributes m1…mN, created by the organiser.
const roster = (await client.select({ key: true, attributes: true, createdAt: true })
  .where([...base, eq("entity_type", str("roster"))]).createdBy(ORGANISER).fetch()).entities[0]!
const n = Number(roster.attributes.member_count!.value)
const members = Array.from({ length: n }, (_, i) => String(roster.attributes[`m${i + 1}`]!.value).toLowerCase())

// Every record created by a roster wallet, with no payloads.
const page = await client.select({ key: true, creator: true, attributes: true })
  .where([...base, or(members.map((m) => eq("$creator", addr(m as `0x${string}`))))]).limit(200).fetch()
const rows = page.entities.map((e) => ({ key: e.key.toLowerCase(), by: e.creator.toLowerCase(),
  type: e.attributes.entity_type?.value, round: Number(e.attributes.round?.value ?? 0), ref: String(e.attributes.ref_key?.value ?? "").toLowerCase() }))

// Confirmed = a claim by the payer + a receipt by that round's collector (m_round) pointing at it.
for (const c of rows.filter((r) => r.type === "pay_claim")) {
  const collector = members[c.round - 1]
  const ack = rows.find((r) => r.type === "pay_ack" && r.by === collector && r.ref === c.key)
  console.log(`round ${c.round}: ${c.by} → ${collector}: ${ack ? "CONFIRMED" : "claimed"}`)
}
```

**3. Raw JSON-RPC with `curl`** (no SDK). List every record in a committee created by the roster
wallets, keys and public attributes only:

```bash
RPC=https://rpc.tiramisu.db-chain.testnet.arkiv.network
CIRCLE=<circle_id>; ORGANISER=<organiser address>

# a) the roster: public turn order in attributes m1..mN
curl -s $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",
  \"params\":[\"project = str('turn_arkiv_v1') AND circle_id = str('$CIRCLE') AND entity_type = str('roster') AND \$creator = addr($ORGANISER)\",
  {\"select\":{\"key\":true,\"creator\":true,\"createdAt\":true,\"attributes\":true},\"limit\":\"0x5\"}]}"

# b) every record created by those wallets (fill M1..M5 from a)
curl -s $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"arkiv_query\",
  \"params\":[\"project = str('turn_arkiv_v1') AND circle_id = str('$CIRCLE') AND (\$creator = addr($M1) OR \$creator = addr($M2) OR \$creator = addr($M3) OR \$creator = addr($M4) OR \$creator = addr($M5))\",
  {\"select\":{\"key\":true,\"creator\":true,\"createdAt\":true,\"attributes\":true},\"limit\":\"0xc8\"}]}"
```

In (b), a `pay_ack` whose `ref_key` equals a `pay_claim`'s key, and whose `creator` is `m<round>`,
is a confirmed payment. The anonymous RPC has a query budget (see [friction #4](arkiv/friction.md));
if it answers HTTP 429, wait for `retry-after` or use an access key (`-H "X-API-KEY: …"`).

## Security notes

- Trust comes from `$creator` only. `$owner` is displayed ("Managed by"), never trusted.
- The drip key lives in server env vars only (`DRIP_PRIVATE_KEY`). Nothing `NEXT_PUBLIC_*` holds a
  secret, and the client bundle is checked for it before each deploy.
- **Accounts:** a random key per phone, encrypted in IndexedDB under a non-extractable WebCrypto key,
  with a backup file in Settings. This protects against copying the browser's files. It does not
  protect against malicious script running on the app's own origin. Clearing site data without a
  backup loses the account. Why not passkeys yet: [docs/decisions.md](docs/decisions.md).
- **Invite links carry the circle key** in the `#fragment` (never sent to a server, and
  `Referrer-Policy: no-referrer` everywhere). Anyone who gets the WhatsApp message can *read* the
  committee. They can't *write* as a member, because writes count only from roster wallets.
- **Synthetic data only.** This is a testnet demo. Use made-up names.

## Pre-existing work

The brand and some UI come from **[github.com/avishrakshe/Turn](https://github.com/avishrakshe/Turn)**
(built for Monad Metropolis before 9 Oct 2026), **baseline commit
`0f15c23b8c0a0a8d6e5839e60ce7b71d00e55c9d`**. Reused, adapted:

| From `site/` at `0f15c23` | Here |
|---|---|
| `styles/tokens.css` (palette, avatar tones; marigold/teal set to #F4A340 / #1F5E55) | `styles/tokens.css` |
| `app/globals.css` (theme mapping, base typography; trimmed) | `app/globals.css` |
| `components/ring/TurnMark.tsx`, `TurnRing.tsx`, `ProgressRing.tsx`, `RingLoader.tsx`, `geometry.ts`, `ring.module.css` | `components/ring/` |
| `lib/cn.ts`, the font choice in `lib/fonts.ts` | `lib/` |
| `app/icon.svg`, `app/apple-icon.png` (ring logo) | `app/` |
| Name, tagline "Save together. Take turns." | copy |

Everything else (the whole Arkiv integration, encryption and binding, payments state machine, lease
logic, queries, live events, screens, i18n, drip and proxy routes, scripts and tests) was written for
this challenge between 15 and 18 Oct 2026. No Monad, AUSD, smart-contract, relayer or EIP-7702 code is
included. The original repository and its deployment (turn-sigma.vercel.app) are untouched.

## AI use

Built with Claude (Anthropic) as a coding assistant. Hindi strings are LLM drafts awaiting human
review ([TRANSLATIONS_TODO.md](TRANSLATIONS_TODO.md)).

## License

[MIT](LICENSE)
