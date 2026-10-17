/**
 * Seeds the judges' demo circle on Tiramisu. SYNTHETIC data only (names are invented, no phones,
 * no UPI IDs). Every member has their own throwaway key, so every record is created by the member
 * it speaks for. Keys are written to .seed/ (git-ignored); the invite link is printed.
 *
 *   "Sharma Family BC" — ₹5,000/month, 5 members, fixed turn order (join order):
 *     Round 1 (Meera collects): all 4 paid and confirmed; result published (closed in one batch
 *                               together with a lease renewal)
 *     Round 2 (Ravi collects):  Meera paid → confirmed
 *                               Priya says paid → waiting for Ravi
 *                               Arjun says paid → Ravi disputes ("wrong amount")
 *                               Sana hasn't paid, and round 2 is past due → "Who hasn't paid"
 *     Sana presses "Keep our record alive" → every record extended by a member, in one batch.
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { ExpirationTime } from "@arkiv-network/sdk"
import { formatEther, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { loadCircle } from "../src/arkiv/circle"
import { publicClient, serverOptions, walletClient } from "../src/arkiv/client"
import { explorerTxUrl } from "../src/arkiv/config"
import { importCircleKey, newCircleKeyHex } from "../src/arkiv/payload"
import { ArkivWriter, buildCreate, expiry, newOpId, runBatch, type Intent } from "../src/arkiv/writer"
import type { Address, CircleBody } from "../src/core/bodies"
import { extensionsTo, keepAliveTargetBlock, leaseTargetBlock } from "../src/core/lease"
import { roundDueMs } from "../src/core/schedule"
import { buildView, fixedPayout } from "../src/core/view"
import { drip, parseDripConfig } from "../src/server/drip"

const opts = serverOptions()
const reader = publicClient(opts)
const STATE = ".seed/state.json"
const log: string[] = []
const say = (s: string) => { console.log(s); log.push(s) }

type Person = { name: string; pk: Hex }
const NAMES = ["Meera Sharma", "Ravi Sharma", "Priya Sharma", "Arjun Mehta", "Sana Iyer"]

function people(): Person[] {
  if (!existsSync(".seed")) mkdirSync(".seed")
  if (existsSync(STATE)) {
    const s = JSON.parse(readFileSync(STATE, "utf8")) as { people?: Person[]; circleId?: string }
    if (s.circleId) throw new Error(`.seed/state.json already has circle ${s.circleId}; move it away to seed again`)
    if (s.people) return s.people
  }
  const ps = NAMES.map((name) => ({ name, pk: generatePrivateKey() }))
  writeFileSync(STATE, JSON.stringify({ people: ps }, null, 2))
  return ps
}

async function main() {
  const cfg = { ...parseDripConfig(process.env), amountGlm: "0.01" }
  const ps = people()
  const acct = ps.map((p) => privateKeyToAccount(p.pk))
  const addr = acct.map((a) => a.address.toLowerCase() as Address)
  const w = acct.map((a) => new ArkivWriter(walletClient(a, opts), reader, a.address.toLowerCase() as Address))
  const [meera, ravi, priya, arjun, sana] = [0, 1, 2, 3, 4]

  for (const [i, a] of addr.entries()) {
    if ((await reader.getBalance({ address: a })) > 0n) continue
    const d = await drip(cfg, a)
    say(`drip → ${ps[i]!.name} ${a}: ${d.status} ${"txHash" in d && d.txHash ? explorerTxUrl(d.txHash) : "reason" in d ? d.reason : ""}`)
    if (d.status !== "sent") throw new Error("drip failed")
  }

  const keyHex = newCircleKeyHex()
  const key = await importCircleKey(keyHex)
  const circleId = newOpId()
  writeFileSync(STATE, JSON.stringify({ people: ps, circleId, organiser: addr[meera], keyHex }, null, 2))

  const DAY = 86_400_000
  const rules: CircleBody = {
    name: "Sharma Family BC", template: "family_bc", amount_inr: 5000, members: 5, frequency: "monthly", mode: "fixed",
    start_ms: Date.UTC(2026, 8, 10, 4, 30), due_days: 5, max_discount_bps: 0, reveal_window_ms: 0, organiser_first: true,
  }
  const must = async (i: number, intent: Intent) => {
    const out = await w[i]!.create(intent, key)
    if (out.status !== "confirmed") throw new Error(`${intent.type}: ${out.status}`)
    say(`  ✓ ${ps[i]!.name.padEnd(13)} ${intent.type.padEnd(12)}${intent.round ? ` r${intent.round}` : "   "} ${out.entityKey}  tx ${out.txHash}`)
    return out
  }

  say(`circle_id ${circleId}  organiser ${addr[meera]}`)
  const circle = await must(meera, { type: "circle", circleId, body: rules, expires: expiry.circle(rules) })
  const asCircle = () => expiry.asCircle(circleExp)
  let circleExp = (await reader.getEntity(circle.entityKey)).expiresAt
  await must(meera, { type: "invite", circleId, body: { seats_left: 4 }, expires: expiry.invite() })
  const joins = []
  for (const i of [meera, ravi, priya, arjun, sana]) joins.push(await must(i, { type: "member", circleId, body: { display_name: ps[i]!.name, lang: i === priya || i === sana ? "hi" : "en" }, expires: asCircle() }))
  await must(meera, { type: "roster", circleId, body: { members: addr, member_keys: joins.map((j) => j.entityKey) }, expires: asCircle() })

  const pay = (i: number, r: number, amount = 5000, method: "UPI" | "cash" = "UPI") =>
    must(i, { type: "pay_claim", circleId, round: r, dueAt: roundDueMs(rules, r), body: { amount_inr: amount, method, note: "" }, expires: asCircle() })
  const ack = (collector: number, r: number, claim: { entityKey: Hex }) =>
    must(collector, { type: "pay_ack", circleId, round: r, dueAt: roundDueMs(rules, r), refKey: claim.entityKey, onTime: true, body: { ref: claim.entityKey, status: "received" }, expires: asCircle() })

  // Round 1: Meera collects; everyone paid and she confirmed each.
  for (const i of [ravi, priya, arjun, sana]) await ack(meera, 1, await pay(i, 1, 5000, i === sana ? "cash" : "UPI"))

  // Close round 1 in ONE batch: round_result + lease renewal of every record so far.
  let snap = await loadCircle(reader, { circleId, organiser: addr[meera]! }, key)
  let view = buildView(snap)!
  const head = await reader.getBlockNumber({ cacheTime: 0 })
  const target = leaseTargetBlock(head, rules, 1, Date.now())
  const result = await buildCreate({
    type: "round_result", circleId, round: 1, isFinal: false,
    expires: ExpirationTime.atBlock(target > circleExp ? target : circleExp, { atLeast: ExpirationTime.fromDays(1) }),
    body: { winner: addr[meera]!, discount_bps: 0, payout_inr: fixedPayout(rules, 5), share_inr: 0, close_key: null, reveal_keys: [] },
  }, addr[meera]!, key, newOpId())
  const close = await runBatch(walletClient(acct[meera]!, opts), reader, { creates: [result], extend: { keys: extensionsTo(view.leaseRecords, target).map((r) => r.key), toBlock: target } })
  if (close.status !== "confirmed") throw new Error("close round 1 failed")
  say(`  ✓ Meera closes round 1 (round_result + ${close.extended.length} extensions, one batch) tx ${close.txHash}`)
  circleExp = (await reader.getEntity(circle.entityKey)).expiresAt

  // Round 2: Ravi collects.
  await ack(ravi, 2, await pay(meera, 2))
  await pay(priya, 2)
  const arjunClaim = await pay(arjun, 2)
  await must(ravi, { type: "dispute", circleId, round: 2, refKey: arjunClaim.entityKey, body: { reason: "wrong_amount", note: "Received ₹4,000 on UPI, not ₹5,000" }, expires: asCircle() })

  // Sana keeps the record alive: a member, not the owner, extends everything.
  snap = await loadCircle(reader, { circleId, organiser: addr[meera]! }, key)
  view = buildView(snap)!
  const h2 = await reader.getBlockNumber({ cacheTime: 0 })
  const keep = keepAliveTargetBlock(h2, view.maxExpiresAt)
  const kept = await runBatch(walletClient(acct[sana]!, opts), reader, { extend: { keys: extensionsTo(view.leaseRecords, keep).map((r) => r.key), toBlock: keep } })
  if (kept.status !== "confirmed") throw new Error("keep-alive failed")
  say(`  ✓ Sana keeps the record alive (${kept.extended.length} extensions → block ${keep}) tx ${kept.txHash}`)

  snap = await loadCircle(reader, { circleId, organiser: addr[meera]! }, key)
  view = buildView(snap)!
  const r2 = view.current!
  say(`\nround 1: ${view.rounds[0]!.status}, ${view.rounds[0]!.progress.confirmed}/4 confirmed`)
  say(`round 2 (collector ${ps[ravi]!.name}): ${r2.payments.map((p) => `${ps[addr.indexOf(p.payer)]!.name}=${p.state}`).join(", ")}`)
  say(`records=${snap.records.length} rejected=${snap.rejected.length} ignored=${snap.ignored.length}`)
  const bal = await reader.getBalance({ address: privateKeyToAccount(cfg.privateKey).address })
  say(`dev EOA balance ${formatEther(bal)} GLM`)
  say(`\nINVITE (organiser view): /join#c=${circleId}&o=${addr[meera]}&k=<key in .seed/state.json>`)
  say(`VERIFY (keyless):        /verify#c=${circleId}&o=${addr[meera]}`)
  writeFileSync(".seed/log.txt", log.join("\n"))
}

main().then(() => process.exit(0), (e) => { console.error("SEED FAILED:", e instanceof Error ? e.message : e); process.exit(1) })
