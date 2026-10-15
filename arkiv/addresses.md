# Addresses that create entities on Tiramisu

All on **Tiramisu** (chain `7738577`), explorer <https://tiramisu.explorer.arkiv.network>.
Every address here is a throwaway development key. No real person controls any of them.

| Role | Address | Creates | Key custody |
|---|---|---|---|
| Drip / dev EOA | `0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF` | GLM transfers to new member addresses (no entities); smoke-test entities (`project=turn_smoke`) | `.env.local` (git-ignored) and the Vercel env var `DRIP_PRIVATE_KEY`; never in the browser |
| Demo organiser ("Meera Sharma", synthetic) | _added by the seed script in Phase 5_ | `circle`, `invite`, `roster`, `bid_close`, `round_result` | `.seed/` (git-ignored) |
| Demo members (4, synthetic) | _added by the seed script in Phase 5_ | `member`, `pay_claim`, `pay_ack`, `bid_commit`, `bid_reveal`, `dispute` | `.seed/` (git-ignored) |

Members who use the live app create entities from their own passkey- or device-derived address;
those addresses are not listed here.
