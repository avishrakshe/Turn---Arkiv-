import { describe, expect, it } from "vitest"
import { loadCircle } from "../src/arkiv/circle"
import { buildCreate, newOpId } from "../src/arkiv/writer"
import {
  bidCommitLifetimeBlocks, circleEndMs, circleLifetimeBlocks, DAY_MS, extensionsTo, keepAliveTargetBlock, leaseTargetBlock,
} from "../src/core/lease"
import { roundDueMs } from "../src/core/schedule"
import { circleBody, newAddress, withRoster } from "./fixtures"
import { ExpirationTime } from "@arkiv-network/sdk"

const BLOCKS_PER_DAY = 43_200n // 2 s blocks

describe("Entity Expiration per type", () => {
  const rules = circleBody({ members: 5, frequency: "monthly", start_ms: Date.UTC(2026, 9, 15) })
  const now = Date.UTC(2026, 9, 15)

  it("circle records: circle length + 30 days", () => {
    expect(circleEndMs(rules)).toBe(rules.start_ms + 5 * 30 * DAY_MS)
    expect(circleLifetimeBlocks(rules, now)).toBe((150n + 30n) * BLOCKS_PER_DAY)
  })

  it("a circle created after its schedule ended still gets 30 days", () => {
    expect(circleLifetimeBlocks(rules, circleEndMs(rules) + 10 * DAY_MS)).toBe(30n * BLOCKS_PER_DAY)
  })

  it("bid_commit lives until the reveal window ends + 1 day (at least 2 days)", () => {
    expect(bidCommitLifetimeBlocks(3 * DAY_MS)).toBe(4n * BLOCKS_PER_DAY)
    expect(bidCommitLifetimeBlocks(60_000)).toBe(2n * BLOCKS_PER_DAY)
  })

  it("closing a round late pushes the lease to the real pace", () => {
    const head = 1_000_000n
    // On schedule: round 1 closes at the end of month 1 → target is the original end + 30 d.
    const onTime = leaseTargetBlock(head, rules, 1, rules.start_ms + 30 * DAY_MS)
    expect(onTime).toBe(head + (120n + 30n) * BLOCKS_PER_DAY)
    // Two months late: the 4 remaining rounds start from now.
    const lateHead = head + 60n * BLOCKS_PER_DAY
    const late = leaseTargetBlock(lateHead, rules, 1, rules.start_ms + 90 * DAY_MS)
    expect(late - onTime).toBe(60n * BLOCKS_PER_DAY)
  })

  it("keep-alive adds 90 days beyond the latest deadline, or from now if expired", () => {
    expect(keepAliveTargetBlock(100n, 500n)).toBe(500n + 90n * BLOCKS_PER_DAY)
    expect(keepAliveTargetBlock(900n, 500n)).toBe(900n + 90n * BLOCKS_PER_DAY)
  })

  it("only extends records whose deadline is earlier than the target (one revert fails the batch)", () => {
    const a = { key: "0x01" as const, expiresAt: 10n }, b = { key: "0x02" as const, expiresAt: 50n }
    expect(extensionsTo([a, b, a], 50n)).toEqual([a])
  })
})

describe("due_at is checked against the rules", () => {
  it("drops a pay_claim whose public due_at doesn't match the circle schedule", async () => {
    const s = await withRoster(3)
    const [, priya] = s.people
    await s.write(priya!, "pay_claim", { amount_inr: 5000, method: "UPI", note: "" }, { round: 1, dueAt: roundDueMs(s.rules.body, 1) + 1 })
    const ok = await s.write(priya!, "pay_claim", { amount_inr: 5000, method: "UPI", note: "" }, { round: 1 })
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key)
    const claims = snap.records.filter((r) => r.type === "pay_claim")
    expect(claims.map((c) => c.key)).toEqual([ok.key.toLowerCase()])
    expect(snap.rejected.some((r) => r.reason === "bad_due_at")).toBe(true)
  })

  it("writer refuses a payment record without due_at", async () => {
    await expect(buildCreate({ type: "pay_claim", circleId: newOpId(), round: 1, body: { amount_inr: 1, method: "UPI", note: "" }, expires: ExpirationTime.fromDays(1) }, newAddress(), null, newOpId()))
      .rejects.toThrow(/due_at/)
  })
})

describe("unverified records are counted, never decrypted", () => {
  it("reports one ignored record from a wallet outside the roster", async () => {
    const s = await withRoster(3)
    const outsider = newAddress()
    await s.write(outsider, "pay_ack", { ref: ("0x" + "11".repeat(32)) as `0x${string}`, status: "received" }, { round: 1, refKey: ("0x" + "11".repeat(32)) as `0x${string}`, onTime: true })
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key)
    expect(snap.ignored).toEqual([{ key: s.chain.entities.at(-1)!.key.toLowerCase(), creator: outsider }])
    expect(snap.records.some((r) => r.creator === outsider)).toBe(false)
  })
})
