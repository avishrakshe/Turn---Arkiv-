# Turn on Arkiv

**Save together. Take turns.** A tamper-evident shared ledger for Indian savings committees
(BC, kitty, chit), built on [Arkiv](https://arkiv.network) for the CROPS / road to Devcon 8 Mumbai
challenge.

Money stays on UPI or cash. Arkiv holds the record every member owns: who joined, who paid, who
confirmed, who bid, who won — encrypted for the circle, signed by the member it speaks for, and
impossible for the organiser to rewrite.

> **Status:** Phase 1 (verify and plan) complete. See [docs/decisions.md](docs/decisions.md).

## Repository map

| Path | What |
|---|---|
| [arkiv/schema.md](arkiv/schema.md) | Every entity, attribute, flag, expiration and why |
| [arkiv/friction.md](arkiv/friction.md) | Reproducible feedback on building with Arkiv |
| [arkiv/addresses.md](arkiv/addresses.md) | Every address that creates entities on Tiramisu |
| [docs/decisions.md](docs/decisions.md) | Accounts, gas and data-model decisions with evidence |
| `src/server/drip.ts` | Server-only GLM drip for new members |
| `scripts/` | Network probe, dev key generator, drip test |
| `tests/` | Vitest suites |

## Run locally

Requirements: Node ≥ 22 (tested on 24.19).

```bash
npm install
npm test               # unit tests
npm run probe          # read-only Tiramisu probe (never broadcasts)
```

Environment variables: see [.env.example](.env.example). All are server-only.

## Pre-existing work

The brand (name "Turn", palette, ring logo) and UI ideas come from
[github.com/avishrakshe/Turn](https://github.com/avishrakshe/Turn), a Monad project.
Baseline commit: **`0f15c23b8c0a0a8d6e5839e60ce7b71d00e55c9d`**. Everything in this repository was
written for Arkiv during this challenge; no Monad, AUSD, smart-contract, relayer or EIP-7702 code is
included. That repository and its deployment are untouched.

## License

[MIT](LICENSE)
