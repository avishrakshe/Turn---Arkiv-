# Live evidence on Tiramisu

Network: Tiramisu, chain `7738577`. SDK `@arkiv-network/sdk@0.8.1`, viem `2.57.7`. All data synthetic.
Explorer: <https://tiramisu.explorer.arkiv.network>

## 1. Smoke test — 2026-10-17 ~13:05 IST

`npx tsx --env-file=.env.local scripts/smoke-write.ts` ([script](../scripts/smoke-write.ts)). It runs the
app's real code paths: `ArkivWriter`, `loadCircle`, `paymentFor`, `runBatch`, `eventsClient().watchEntityEvents`.

`project = "turn_arkiv_v1"`, `circle_id = 8aecd394cf0fa51f91f6b60df5457eb4`, organiser = dev EOA
`0x6345b733ae620eedd74ac1c628e96b27abb3b2cf`, members B and C = throwaway keys funded by the drip.

| Step | Who (creator) | Entity | Transaction |
|---|---|---|---|
| create `circle` (readonly + permissionlessExtension, schedule + 30 d) | organiser | [0x1aa0…7585](https://tiramisu.explorer.arkiv.network/entity/0x1aa0dbc2c612024f78542ae5bff7b22fe0265ecb732c50421577acced3027585) | [0x7cf4…29dc](https://tiramisu.explorer.arkiv.network/tx/0x7cf4be26f477abc1c711eedd50c03531eef787a854b55e367e3597dfba7229dc) |
| organiser's `member` | organiser | [0x87aa…dc42](https://tiramisu.explorer.arkiv.network/entity/0x87aab141854ccc0b7feddbafbe6d2a94d9b15568ff3d3c34363db1df7550dc42) | [0x86f0…65a7](https://tiramisu.explorer.arkiv.network/tx/0x86f0b05a79cd46a3c138e64e9c1bc1bbe25a6e84f42d628971ce144f72c965a7) |
| GLM drip → member B `0x36f1…8592` | dev EOA | — (native transfer) | [0x664f…38db](https://tiramisu.explorer.arkiv.network/tx/0x664faba6193bd6b6783690efbca77ae25038bbbeee346bc55576aae6e2b338db) |
| member B `member` | member B | [0xf42c…b217](https://tiramisu.explorer.arkiv.network/entity/0xf42c5884743067d1aafeb7a51af9c8c94df415a0a0875dbbff7e02a9abb8b217) | [0xcafa…eef](https://tiramisu.explorer.arkiv.network/tx/0xcafa7589e4258055ec5f3bdc2dadbfa66f99db181183d0c2744c835aeb894eef) |
| GLM drip → member C `0x0104…2ea0` | dev EOA | — | [0x64b5…ceae](https://tiramisu.explorer.arkiv.network/tx/0x64b5a92e6a199af4a2c32d10ab5147a9d8badee01e1d3cd61a37783b0cefceae) |
| member C `member` | member C | [0x68e5…a935](https://tiramisu.explorer.arkiv.network/entity/0x68e57cb022dfccb98393e2a454cb1d30fe2982ae12e119a9694fd0f2cbc2a935) | [0xb660…6ac7](https://tiramisu.explorer.arkiv.network/tx/0xb6602ec4446ee117a23c8759de547f9628f0d161697e593b1d2285eb64db6ac7) |
| `roster` (public turn order m1…m3) | organiser | [0x375d…d011](https://tiramisu.explorer.arkiv.network/entity/0x375da51d023d810348777f018f182a17c3c7770c6e5c854e46adeeb5d647d011) | [0x3d6a…8b95](https://tiramisu.explorer.arkiv.network/tx/0x3d6af2700d37da96e6e467d9e50534a05c985d3df599c644b169c7c5be3c8b95) |
| `pay_claim` round 1 ("I've paid") | member B | [0xd825…4800](https://tiramisu.explorer.arkiv.network/entity/0xd825f3b87c6c274779a4dcadeafe6a438def9d84d7c05d73b93406811f744800) | [0x510b…f5cc](https://tiramisu.explorer.arkiv.network/tx/0x510bc77ce94d3900451e12157b84b8e10720924e95681a94b3189ed57168f5cc) |
| `pay_ack` round 1 ("Received", ref_key = claim) | organiser (round 1 collector) | [0xf2ba…fda4](https://tiramisu.explorer.arkiv.network/entity/0xf2ba7c60cff88586db80bb7969ed35f8d0c3cdc93793bbf0a4838df46c8fdda4) | [0x5e3d…e190](https://tiramisu.explorer.arkiv.network/tx/0x5e3d7e92498195a13779b7e8309b603f1fa90fd038a96467b46ea9106170e190) |
| **Lifetime Extension of all 7 records in one batch, by member C (not the owner)** | member C | 7 × `ExpiryExtended` | [0xe658…065f](https://tiramisu.explorer.arkiv.network/tx/0xe65895cfa8878baabe5e07c5abd3fa663990a22329f9cb6a2cdf54151c7e065f) |

Output (verbatim, abridged to the result lines):

```
read-back at block 686270: roster=3 records=7 rejected=0
payment round 1 by member B → CONFIRMED (claim 0xd825f3b8…, ack 0xf2ba7c60…)

keep-alive by member C: confirmed …/tx/0xe65895cf…065f extended=7/7 → block 5871134
watchEntityEvents (WebSocket) saw 7/7 ExpiryExtended events
circle expiresAt 1983134 → 5871134; owner 0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF creator 0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF

gas used per create: { circle: 114184, member: 110088 ×3, roster: 134184, pay_claim: 120088, pay_ack: 130088, batch_extend_x7: 70000 }
organiser spent 0.012572544001145088 GLM (incl. drips); balance 9.987427455998854912
SMOKE OK  circle_id=8aecd394cf0fa51f91f6b60df5457eb4
```

What this proves:

- **create → query → read back:** `loadCircle` (creator-scoped, block-pinned, paginated) decrypted all 7
  records and rejected none; the two-party payment state machine returned `confirmed`.
- **permissionless extension:** a member who owns none of the records extended all of them atomically
  (`executeBatch` with 7 extensions, 70,000 gas total).
- **live events:** `watchEntityEvents` over `wss://…` (no `fromBlock`) delivered all 7 `ExpiryExtended`.
- **creator vs owner:** after the extension, owner and creator of the circle are still the organiser.
- **cost:** a Turn record costs ~110–134k gas (≈ 0.00012 GLM at the observed ~1 gwei), so the 0.02 GLM
  drip covers ~150 records per member.

Bug found by this run (ours, not Arkiv's): the "second drip to same address" guard sent a second drip,
because the first drip (0.003 GLM in the smoke) was below the 0.005 GLM "already funded" threshold and
the recipient had not yet sent a transaction. Fixed: any non-zero balance now refuses (see §2).

## 2. Drip guard after the fix — 2026-10-17

`npx tsx --env-file=.env.local scripts/test-drip.ts`

```
drip EOA 0x6345b733AE620EEDD74Ac1C628e96B27ABB3B2CF balance 9.987427455998854912 GLM
recipient (throwaway) 0x0159AA5482AbeEEc8743F948f4aa28F3cB19E67C
{ status: 'sent', txHash: '0x15d496fd9ba713cd5639e7b46ea9dd50dfbb9627343379b5cd2966e42dcd778c', amountWei: '1000000000000000' }
recipient balance 0.001 GLM
second drip to same address → { status: 'refused', reason: 'already_funded' }
```

A native GLM transfer works on Tiramisu: [0x15d4…778c](https://tiramisu.explorer.arkiv.network/tx/0x15d496fd9ba713cd5639e7b46ea9dd50dfbb9627343379b5cd2966e42dcd778c).

## 3. End-to-end on production (https://turn-arkiv.vercel.app), 2026-10-17 16:00–17:36 IST

Committee "Prod Check BC", `circle_id = 31aa1255453d747719101afa4e4b6194`, demo cadence (10-minute
rounds), 3 members. Meera (organiser, `0x8a85e27d…8344`) used the real app in Chrome; Ravi
(`0x942f9623…6743`) and Priya (`0xd49ac195…70c4`) acted from their own keys via a script calling the
same library code, so their records reach the chain exactly as from another phone.

| Step | Who | Result in Meera's UI |
|---|---|---|
| Create committee (drip + circle + member + invite) | Meera, UI | invite link in ~50 s |
| Join ×2 | Ravi, Priya | both listed, "Signed by …" each |
| Lock member list | Meera, UI | round 1 opens; "Who hasn't paid" lists both |
| "I've paid" r1 | Ravi | **appears live** (WebSocket), no refresh |
| "Received" r1 | Meera, UI | "Paid ✓ confirmed by Meera S." |
| Forged receipt from a non-member wallet `0x178295f0…` | outsider | ignored; "1 unverified record ignored" |
| Close round 1 (round_result + lease renewal, one batch) | Meera, UI | exactly one `round_result` on chain (block 694399) |
| "I've paid" r2 | Meera, UI | her half of the seal lights |
| "Received" r2 | Ravi | **seal locks live** on Meera's screen |
| "I've paid" r2 | Priya | toast "Priya N. just paid ✓" |
| Dispute on Priya's claim | Meera, UI | seal cracks; "Reported by Meera S." |
| Keep our record alive | Meera, UI | "Record kept until" 16 Nov 2026 → **14 Feb 2027** |

Every UI write was logged once in the console (`[turn] write close / pay-UPI / dispute / keep`).

**Open finding (first run, before the fix):** at block 691877, Meera's browser created a `pay_ack`
for Priya's round-1 claim (`0x88c6a549…`, two blocks after the outsider's forged ack) although no
click was made in that window. The cause was not reproduced. In response, "Received" is now a
two-step confirmation ("Did ₹5,000 from Priya reach you? → Yes, received") that disarms after 8 s or
on any data change and ignores untrusted events, and every write is logged with its trigger. No
unexpected write occurred in the second run above. Because records are immutable, that ack remains
on chain; it is a test artefact on a test committee.
