# Addresses that create entities on Tiramisu

Network **Tiramisu** (chain `7738577`), explorer <https://tiramisu.explorer.arkiv.network>.
Every address here is a throwaway test key; no real person is behind any of them. All data is
synthetic. `project = "turn_arkiv_v1"` on every Turn entity.

## Dev / drip EOA

| Address | Role | Creates |
|---|---|---|
| [`0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF`](https://tiramisu.explorer.arkiv.network/address/0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF) | Funds new members (GLM drip via `/api/drip` and the seed), organiser of the smoke-test circle `8aecd394cf0fa51f91f6b60df5457eb4` | GLM transfers; smoke-test `circle`, `member`, `roster`, `pay_ack` ([evidence](../docs/evidence.md)) |

Key custody: `.env.local` (git-ignored) and the Vercel env var `DRIP_PRIVATE_KEY`, never in the browser.

## Seeded demo: "Sharma Family BC"

`circle_id = d2ccb6e40b03bc6280b8ea95df17536e`. Keyless view:
<https://turn-arkiv.vercel.app/verify#c=d2ccb6e40b03bc6280b8ea95df17536e&o=0x0cbaaccdcf158845b04d0e770c75248084365e40>

| Synthetic member | Address | Role | Creates |
|---|---|---|---|
| Meera Sharma | [`0x0cbaaccdcf158845b04d0e770c75248084365e40`](https://tiramisu.explorer.arkiv.network/address/0x0cbaaccdcf158845b04d0e770c75248084365e40) | Organiser; collector of round 1 (`m1`) | `circle`, `invite`, `roster`, `round_result` (batch with 15 extensions), own `member`, `pay_ack` ×4 (r1), `pay_claim` (r2) |
| Ravi Sharma | [`0x9b296457833467b02701a059da14a04d0937ef00`](https://tiramisu.explorer.arkiv.network/address/0x9b296457833467b02701a059da14a04d0937ef00) | Member; collector of round 2 (`m2`) | `member`, `pay_claim` (r1), `pay_ack` (r2, Meera's), `dispute` (r2, on Arjun's claim) |
| Priya Sharma | [`0xa004c17b8324c015cc52bb330a07fb5a2e1c0abf`](https://tiramisu.explorer.arkiv.network/address/0xa004c17b8324c015cc52bb330a07fb5a2e1c0abf) | Member (`m3`) | `member`, `pay_claim` (r1, r2: waiting) |
| Arjun Mehta | [`0x53591bf83dc41c02bd075c094906b86addd19b78`](https://tiramisu.explorer.arkiv.network/address/0x53591bf83dc41c02bd075c094906b86addd19b78) | Member (`m4`) | `member`, `pay_claim` (r1, r2: disputed) |
| Sana Iyer | [`0x228a4401554f47b2c14b012b4e38f9b68b3a3cd3`](https://tiramisu.explorer.arkiv.network/address/0x228a4401554f47b2c14b012b4e38f9b68b3a3cd3) | Member (`m5`); renewed every record ("Keep our record alive") | `member`, `pay_claim` (r1, cash), batch of 21 **extensions** of records she doesn't own ([tx](https://tiramisu.explorer.arkiv.network/tx/0xe98c2c73427cf96b1dee31485e1e2fb7d195ff1decae13c42a8753dbcff8c018)) |

Key custody: `.seed/state.json` (git-ignored). The circle's encryption key is there too, so the
seeded names and amounts are readable only with it. `/verify` works without it.

## Browser test circle (2026-10-17)

`circle_id = d1259f4dd678c1e14388d43f20a3d57a`, created through the app UI from three browser origins:
organiser "Meera S." [`0x83ca873cef8e0cd041fd4cdc5e549327e5f14b39`](https://tiramisu.explorer.arkiv.network/address/0x83ca873cef8e0cd041fd4cdc5e549327e5f14b39),
plus two members who joined via the invite link. Each was funded by `/api/drip`.

## Live app users

People using <https://turn-arkiv.vercel.app> create entities from their own browser-generated
addresses (funded once by the drip). Those addresses are not listed here; find them with
`project = str('turn_arkiv_v1')` queries or from the drip EOA's outgoing transfers.
