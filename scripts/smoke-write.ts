/**
 * Phase 2 live smoke on Tiramisu — the real code path end to end:
 *   organiser (dev EOA) creates circle + own join → drips GLM to two throwaway members →
 *   they join → organiser writes roster → member claims round 1 → organiser (collector) acks →
 *   loadCircle (creator-scoped, block-pinned) must show the payment as CONFIRMED.
 *
 * Spends: 2 drips × DRIP (0.003 GLM) + ~8 creates. All data synthetic.
 *   npx tsx --env-file=.env.local scripts/smoke-write.ts
 */
import { formatEther, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { eventsClient, publicClient, walletClient } from "../src/arkiv/client"
import { loadCircle } from "../src/arkiv/circle"
import { CHAIN, explorerEntityUrl, explorerTxUrl } from "../src/arkiv/config"
import { importCircleKey, newCircleKeyHex } from "../src/arkiv/payload"
import { ArkivWriter, expiry, newOpId, runBatch, type Intent, type WriteOutcome } from "../src/arkiv/writer"
import { extensionsTo, keepAliveTargetBlock } from "../src/core/lease"
import { paymentFor } from "../src/core/payments"
import { roundDueMs } from "../src/core/schedule"
import type { Address, CircleBody } from "../src/core/bodies"
import { drip, parseDripConfig } from "../src/server/drip"

const reader = publicClient()
const gasLog: { type: string; gasUsed: bigint }[] = []

function writerFor(pk: Hex) {
  const account = privateKeyToAccount(pk)
  return new ArkivWriter(walletClient(account), reader, account.address.toLowerCase() as Address)
}

async function must(w: ArkivWriter, intent: Intent, key: CryptoKey | null): Promise<Extract<WriteOutcome, { status: "confirmed" }>> {
  const out = await w.create(intent, key)
  if (out.status !== "confirmed") throw new Error(`${intent.type}: ${out.status} ${"reason" in out ? out.reason : ""} ${out.txHash ?? ""}`)
  if (out.txHash) {
    const r = await reader.getTransactionReceipt({ hash: out.txHash })
    gasLog.push({ type: intent.type, gasUsed: r.gasUsed })
  }
  console.log(`  ✓ ${intent.type.padEnd(12)} ${explorerEntityUrl(out.entityKey)}${out.txHash ? `  tx ${explorerTxUrl(out.txHash)}` : ""}`)
  return out
}

async function main() {
  if (await reader.getChainId() !== CHAIN.id) throw new Error("wrong chain")
  const cfg = { ...parseDripConfig(process.env), amountGlm: "0.003" }
  const orgPk = cfg.privateKey
  const org = writerFor(orgPk)
  const bal = await reader.getBalance({ address: org.address })
  console.log(`organiser ${org.address} balance ${formatEther(bal)} GLM`)
  if (bal === 0n) throw new Error("fund the dev EOA first")

  const keyHex = newCircleKeyHex()
  const key = await importCircleKey(keyHex)
  const circleId = newOpId()
  const body: CircleBody = {
    name: "Smoke test circle", template: "custom", amount_inr: 1000, members: 3, frequency: "demo", mode: "fixed",
    start_ms: Date.now(), due_days: 0, max_discount_bps: 0, reveal_window_ms: 0, organiser_first: false,
  }
  console.log(`circle_id ${circleId}`)
  const circle = await must(org, { type: "circle", circleId, body, expires: expiry.circle(body) }, key)
  const circleEntity = await reader.getEntity(circle.entityKey)
  const asCircle = expiry.asCircle(circleEntity.expiresAt)
  console.log(`  circle expires at block ${circleEntity.expiresAt}`)
  const j0 = await must(org, { type: "member", circleId, body: { display_name: "Smoke Organiser", lang: "en" }, expires: asCircle }, key)

  const members: { pk: Hex; w: ArkivWriter }[] = []
  for (const name of ["Smoke Member B", "Smoke Member C"]) {
    const pk = generatePrivateKey()
    const w = writerFor(pk)
    const d = await drip(cfg, w.address)
    console.log(`  drip → ${w.address}:`, d.status, "txHash" in d ? explorerTxUrl(d.txHash ?? "") : d.reason)
    if (d.status !== "sent") throw new Error("drip failed")
    const again = await drip(cfg, w.address)
    console.log(`  second drip to same address →`, again.status, "reason" in again ? again.reason : "")
    members.push({ pk, w })
    await must(w, { type: "member", circleId, body: { display_name: name, lang: "hi" }, expires: asCircle }, key)
  }

  // Roster from the organiser's view of joins.
  let snap = await loadCircle(reader, { circleId, organiser: org.address }, key)
  const joins = snap.joins
  console.log(`  joins seen: ${joins.map((j) => j.body.display_name).join(", ")}`)
  await must(org, { type: "roster", circleId, body: { members: joins.map((j) => j.creator), member_keys: joins.map((j) => j.key) }, expires: asCircle }, key)

  const b = members[0]!.w
  const claim = await must(b, { type: "pay_claim", circleId, round: 1, dueAt: roundDueMs(body, 1), body: { amount_inr: 1000, method: "UPI", note: "smoke" }, expires: asCircle }, key)
  await must(org, { type: "pay_ack", circleId, round: 1, dueAt: roundDueMs(body, 1), refKey: claim.entityKey, onTime: true, body: { ref: claim.entityKey, status: "received" }, expires: asCircle }, key)

  snap = await loadCircle(reader, { circleId, organiser: org.address }, key)
  const p = paymentFor(snap.records, 1, b.address, org.address, 1000, snap.roster?.body.members)
  console.log(`\nread-back at block ${snap.block}: roster=${snap.roster?.body.members.length} records=${snap.records.length} rejected=${snap.rejected.length}`)
  console.log(`payment round 1 by member B → ${p.state.toUpperCase()} (claim ${p.claim?.key.slice(0, 10)}…, ack ${p.ack?.key.slice(0, 10)}…)`)
  if (p.state !== "confirmed") throw new Error("smoke failed: payment not confirmed")
  if (j0.entityKey !== snap.roster?.body.member_keys[0]) console.log("  note: organiser join not first in roster order")

  // Lifetime Extension by a MEMBER (not the owner): permissionlessExtension on every lease record,
  // one atomic batch, observed live over the WebSocket watcher (no fromBlock → push, not polling).
  const head = await reader.getBlockNumber({ cacheTime: 0 })
  const latest = snap.records.reduce((m, r) => (r.expiresAt > m ? r.expiresAt : m), 0n)
  const target = keepAliveTargetBlock(head, latest)
  const toExtend = extensionsTo(snap.records.filter((r) => r.type !== "invite"), target)
  const seen: string[] = []
  const ws = eventsClient()
  const unwatch = ws.watchEntityEvents({ onExpiryExtended: (e) => { seen.push(e.entityKey.toLowerCase()) }, onError: (e) => console.log("  watch error:", e.message) })
  await new Promise((r) => setTimeout(r, 1_500))
  const m2 = members[1]!
  const memberWallet = walletClient(privateKeyToAccount(m2.pk))
  const ext = await runBatch(memberWallet, reader, { extend: { keys: toExtend.map((r) => r.key), toBlock: target } })
  console.log(`\nkeep-alive by member C: ${ext.status} ${"txHash" in ext && ext.txHash ? explorerTxUrl(ext.txHash) : ""} extended=${ext.status === "confirmed" ? ext.extended.length : 0}/${toExtend.length} → block ${target}`)
  if (ext.status === "confirmed") gasLog.push({ type: `batch_extend_x${ext.extended.length}`, gasUsed: (await reader.getTransactionReceipt({ hash: ext.txHash })).gasUsed })
  for (let i = 0; i < 20 && seen.length < toExtend.length; i++) await new Promise((r) => setTimeout(r, 500))
  unwatch()
  console.log(`watchEntityEvents (WebSocket) saw ${seen.filter((k) => toExtend.some((r) => r.key === k)).length}/${toExtend.length} ExpiryExtended events`)
  const after1 = await reader.getEntity(circle.entityKey)
  console.log(`circle expiresAt ${circleEntity.expiresAt} → ${after1.expiresAt}; owner ${after1.owner} creator ${after1.creator}`)

  const byType = new Map<string, bigint[]>()
  for (const g of gasLog) byType.set(g.type, [...(byType.get(g.type) ?? []), g.gasUsed])
  console.log("\ngas used per create:", Object.fromEntries([...byType].map(([t, v]) => [t, v.map(String)])))
  const after = await reader.getBalance({ address: org.address })
  console.log(`organiser spent ${formatEther(bal - after)} GLM (incl. drips); balance ${formatEther(after)}`)
  console.log(`\nSMOKE OK  circle_id=${circleId} organiser=${org.address}`)
}

main().then(() => process.exit(0), (e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1) })
