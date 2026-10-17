/**
 * Everything the app writes, from the member's own account (creator = provenance). Each action
 * returns what to show: the record key and tx hash ("Saved to the shared record").
 */
"use client"
import { ExpirationTime } from "@arkiv-network/sdk"
import type { PrivateKeyAccount } from "viem/accounts"
import type { Hash } from "viem"
import { loadCircle, type Snapshot } from "@/src/arkiv/circle"
import { publicClient, walletClient } from "@/src/arkiv/client"
import { importCircleKey, newCircleKeyHex } from "@/src/arkiv/payload"
import { ArkivWriter, buildCreate, expiry, newOpId, runBatch, type Intent, type WriteOutcome } from "@/src/arkiv/writer"
import type { Address, CircleBody, DisputeReason, Hex } from "@/src/core/bodies"
import { extensionsTo, keepAliveTargetBlock, leaseTargetBlock } from "@/src/core/lease"
import { roundDueMs } from "@/src/core/schedule"
import { buildView, fixedPayout, type CircleView, type RoundView } from "@/src/core/view"
import type { Payment } from "@/src/core/payments"
import { saveCircle, type SavedCircle } from "./circles"

export const reader = publicClient()

const writers = new Map<string, ArkivWriter>()
function writerFor(account: PrivateKeyAccount) {
  const a = account.address.toLowerCase()
  let w = writers.get(a)
  if (!w) { w = new ArkivWriter(walletClient(account), reader, a as Address); writers.set(a, w) }
  return w
}

export class WriteFailed extends Error {
  constructor(readonly outcome: Exclude<WriteOutcome, { status: "confirmed" }> | { status: "failed" | "unconfirmed"; reason: string; txHash?: Hash }) {
    super(outcome.status === "unconfirmed" ? "unconfirmed" : `failed: ${outcome.reason}`)
    this.name = "WriteFailed"
  }
}

export type Saved = { key: Hex; txHash?: Hash }

async function write(account: PrivateKeyAccount, intent: Intent, key: CryptoKey | null): Promise<Saved> {
  await ensureGas(account.address)
  const out = await writerFor(account).create(intent, key)
  if (out.status !== "confirmed") throw new WriteFailed(out)
  return { key: out.entityKey, ...(out.txHash && { txHash: out.txHash }) }
}

/** A brand-new member has no GLM: ask Turn's drip for a small amount, once per address. */
export async function ensureGas(address: `0x${string}`): Promise<void> {
  if ((await reader.getBalance({ address })) > 0n) return
  const res = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })
  const body = (await res.json().catch(() => ({}))) as { status?: string; reason?: string }
  if (body.status !== "sent" && body.reason !== "already_funded") throw new Error(`drip: ${body.reason ?? body.status ?? res.status}`)
  for (let i = 0; i < 20; i++) {
    if ((await reader.getBalance({ address })) > 0n) return
    await new Promise((r) => setTimeout(r, 1_500))
  }
  throw new Error("drip: not received yet")
}

export async function snapshot(c: Pick<SavedCircle, "circleId" | "organiser" | "keyHex">): Promise<{ snap: Snapshot; view?: CircleView; head: bigint }> {
  const key = await importCircleKey(c.keyHex)
  const snap = await loadCircle(reader, { circleId: c.circleId, organiser: c.organiser }, key)
  const view = buildView(snap)
  return { snap, head: snap.block, ...(view && { view }) }
}

export async function createCircle(account: PrivateKeyAccount, rules: CircleBody, displayName: string, lang: "en" | "hi") {
  const keyHex = newCircleKeyHex()
  const key = await importCircleKey(keyHex)
  const circleId = newOpId()
  const organiser = account.address.toLowerCase() as Address
  const circle = await write(account, { type: "circle", circleId, body: rules, expires: expiry.circle(rules) }, key)
  // Save locally first: if a later step fails, the organiser can still open and finish it.
  await saveCircle({ circleId, organiser, keyHex, name: rules.name })
  const entity = await reader.getEntity(circle.key)
  const asCircle = expiry.asCircle(entity.expiresAt)
  await write(account, { type: "member", circleId, body: { display_name: displayName, lang }, expires: asCircle }, key)
  await write(account, { type: "invite", circleId, body: { seats_left: rules.members - 1 }, expires: expiry.invite() }, key)
  return { circleId, organiser, keyHex, circle }
}

export async function joinCircle(account: PrivateKeyAccount, c: Pick<SavedCircle, "circleId" | "organiser" | "keyHex">, view: CircleView, displayName: string, lang: "en" | "hi") {
  const key = await importCircleKey(c.keyHex)
  const saved = await write(account, { type: "member", circleId: c.circleId, body: { display_name: displayName, lang }, expires: expiry.asCircle(view.circleExpiresAt) }, key)
  await saveCircle({ ...c, name: view.rules.name })
  return saved
}

export async function lockRoster(account: PrivateKeyAccount, c: SavedCircle, view: CircleView) {
  const key = await importCircleKey(c.keyHex)
  const order = view.members
  return write(account, {
    type: "roster", circleId: c.circleId,
    body: { members: order.map((m) => m.address), member_keys: order.map((m) => m.joinKey) },
    expires: expiry.asCircle(view.circleExpiresAt),
  }, key)
}

export async function payClaim(account: PrivateKeyAccount, c: SavedCircle, view: CircleView, round: number, method: "UPI" | "cash") {
  const key = await importCircleKey(c.keyHex)
  return write(account, {
    type: "pay_claim", circleId: c.circleId, round, dueAt: roundDueMs(view.rules, round),
    body: { amount_inr: view.rules.amount_inr, method, note: "" }, expires: expiry.asCircle(view.circleExpiresAt),
  }, key)
}

export async function ackPayment(account: PrivateKeyAccount, c: SavedCircle, view: CircleView, p: Payment) {
  if (!p.claim) throw new Error("nothing to confirm")
  const key = await importCircleKey(c.keyHex)
  const dueAt = roundDueMs(view.rules, p.round)
  return write(account, {
    type: "pay_ack", circleId: c.circleId, round: p.round, dueAt, refKey: p.claim.key, onTime: p.claim.createdAtMs <= dueAt,
    body: { ref: p.claim.key, status: "received" }, expires: expiry.asCircle(view.circleExpiresAt),
  }, key)
}

export async function fileDispute(account: PrivateKeyAccount, c: SavedCircle, view: CircleView, round: number, refKey: Hex, reason: DisputeReason, note: string) {
  const key = await importCircleKey(c.keyHex)
  return write(account, {
    type: "dispute", circleId: c.circleId, round, refKey, body: { reason, note }, expires: expiry.asCircle(view.circleExpiresAt),
  }, key)
}

/**
 * Close a round in ONE atomic batch: the round_result plus a Lifetime Extension of every circle
 * record to the re-based lease. Either both land or neither does.
 */
export async function closeRound(account: PrivateKeyAccount, c: SavedCircle, view: CircleView, r: RoundView) {
  await ensureGas(account.address)
  const key = await importCircleKey(c.keyHex)
  const n = view.members.length
  const head = await reader.getBlockNumber({ cacheTime: 0 })
  const target = leaseTargetBlock(head, view.rules, r.round, Date.now())
  const toExtend = extensionsTo(view.leaseRecords, target)
  // The result dies with the (renewed) lease, never before.
  const resultExpiry = ExpirationTime.atBlock(target > view.circleExpiresAt ? target : view.circleExpiresAt, { atLeast: ExpirationTime.fromDays(1) })
  const create = await buildCreate({
    type: "round_result", circleId: c.circleId, round: r.round, isFinal: r.round === n, expires: resultExpiry,
    body: { winner: r.collector, discount_bps: 0, payout_inr: fixedPayout(view.rules, n), share_inr: 0, close_key: null, reveal_keys: [] },
  }, account.address.toLowerCase() as Address, key, newOpId())
  const out = await runBatch(walletClient(account), reader, { creates: [create], extend: { keys: toExtend.map((x) => x.key), toBlock: target } })
  if (out.status !== "confirmed") throw new WriteFailed(out)
  return { txHash: out.txHash, created: out.created, extended: out.extended.length, target }
}

/** "Keep our record alive": any member, 90 more days for every circle record, one batch. */
export async function keepAlive(account: PrivateKeyAccount, view: CircleView) {
  await ensureGas(account.address)
  const head = await reader.getBlockNumber({ cacheTime: 0 })
  const target = keepAliveTargetBlock(head, view.maxExpiresAt)
  const toExtend = extensionsTo(view.leaseRecords, target)
  const out = await runBatch(walletClient(account), reader, { extend: { keys: toExtend.map((x) => x.key), toBlock: target } })
  if (out.status !== "confirmed") throw new WriteFailed(out)
  return { txHash: out.txHash, extended: out.extended.length, target }
}

/** Organiser handover: the circle entity gets a new owner; its creator never changes. */
export async function handOver(account: PrivateKeyAccount, view: CircleView, to: Address) {
  await ensureGas(account.address)
  const r = await walletClient(account).changeOwnership({ entityKey: view.circleKey, newOwner: to })
  return { txHash: r.txHash }
}
