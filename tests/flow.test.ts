import { describe, expect, it } from "vitest"
import { loadCircle } from "../src/arkiv/circle"
import { readPublicLedger } from "../src/arkiv/public-ledger"
import { whoHasntPaid } from "../src/arkiv/queries"
import { buildView, nameOf } from "../src/core/view"
import { roundDueMs } from "../src/core/schedule"
import type { Hex } from "../src/core/bodies"
import { newAddress, withRoster } from "./fixtures"

const k = (e: { key: string }) => e.key.toLowerCase() as Hex
const claim = { amount_inr: 5000, method: "UPI" as const, note: "" }

async function sharma() {
  const s = await withRoster(5, { frequency: "monthly", start_ms: Date.UTC(2026, 8, 1), due_days: 7 })
  const [meera, ravi, priya, arjun, sana] = s.people as [Hex, Hex, Hex, Hex, Hex]
  // Round 1 (Meera collects): everyone confirmed, result published.
  for (const p of [ravi, priya, arjun, sana]) {
    const c = await s.write(p, "pay_claim", claim, { round: 1 })
    await s.write(meera, "pay_ack", { ref: k(c), status: "received" }, { round: 1, refKey: k(c), onTime: true })
  }
  await s.write(meera, "round_result", { winner: meera, discount_bps: 0, payout_inr: 20000, share_inr: 0, close_key: null, reveal_keys: [] }, { round: 1, isFinal: false })
  // Round 2 (Ravi collects): Priya claimed (waiting), Arjun confirmed, Sana disputes Arjun's receipt, Meera unpaid.
  await s.write(priya, "pay_claim", claim, { round: 2 })
  const ca = await s.write(arjun, "pay_claim", claim, { round: 2 })
  const aa = await s.write(ravi, "pay_ack", { ref: k(ca), status: "received" }, { round: 2, refKey: k(ca), onTime: true })
  await s.write(sana, "dispute", { reason: "wrong_amount", note: "test" }, { round: 2, refKey: k(aa) })
  return { s, meera, ravi, priya, arjun, sana }
}

describe("circle view (what the app shows)", () => {
  it("shows a closed round, the open round's states, and who collects", async () => {
    const { s, meera, ravi, priya, arjun, sana } = await sharma()
    const view = buildView(await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key))!
    expect(view.phase).toBe("running")
    expect(view.rounds[0]).toMatchObject({ status: "closed", progress: { confirmed: 4, total: 4 }, resultMismatch: false })
    const r2 = view.current!
    expect(r2.round).toBe(2)
    expect(r2.collector).toBe(ravi)
    const state = Object.fromEntries(r2.payments.map((p) => [p.payer, p.state]))
    expect(state).toEqual({ [meera]: "unpaid", [priya]: "claimed", [arjun]: "disputed", [sana]: "unpaid" })
    expect(nameOf(view, ravi)).toBe("Member 1")
    expect(view.rounds[2]!.status).toBe("upcoming")
  })

  it("flags an organiser result that names the wrong winner", async () => {
    const s = await withRoster(3)
    await s.write(s.organiser, "round_result", { winner: s.people[2]!, discount_bps: 0, payout_inr: 10000, share_inr: 0, close_key: null, reveal_keys: [] }, { round: 1, isFinal: false })
    const view = buildView(await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key))!
    expect(view.rounds[0]!.resultMismatch).toBe(true)
  })
})

describe("who hasn't paid (compound range query)", () => {
  it("lists members with no claim for rounds already due", async () => {
    const { s, meera, sana, ravi } = await sharma()
    const rules = s.rules.body
    const now = roundDueMs(rules, 2) + 1 // round 2's window has closed
    const res = await whoHasntPaid(s.chain.reader, s.circleId, rules, s.people, now, { closedRounds: new Set([1]) })
    expect(res.late.map((l) => [l.round, l.member, l.collector])).toEqual([[2, meera, ravi], [2, sana, ravi]])
    const q = s.chain.queries.at(-1)!
    expect(q).toContain("due_at")
    expect(q).toContain("$creator")
  })

  it("nothing is late before the due date", async () => {
    const { s } = await sharma()
    const res = await whoHasntPaid(s.chain.reader, s.circleId, s.rules.body, s.people, roundDueMs(s.rules.body, 1) - 1)
    expect(res.late).toEqual([])
  })
})

describe("/verify: keyless public ledger", () => {
  it("confirms payments from public attributes + $creator only", async () => {
    const { s, meera, ravi, priya, arjun } = await sharma()
    const outsider = newAddress()
    await s.write(outsider, "pay_ack", { ref: ("0x" + "22".repeat(32)) as Hex, status: "received" }, { round: 2, refKey: ("0x" + "22".repeat(32)) as Hex, onTime: true })
    const l = (await readPublicLedger(s.chain.reader, s.circleId))!
    expect(l.organiser).toBe(meera)
    expect(l.roster?.members).toEqual(s.people)
    expect(l.rounds[0]!.payments.every((p) => p.state === "confirmed")).toBe(true)
    expect(l.rounds[0]!.result).toBeDefined()
    const r2 = Object.fromEntries(l.rounds[1]!.payments.map((p) => [p.payer, p.state]))
    expect(r2[priya]).toBe("claimed")
    expect(r2[arjun]).toBe("confirmed")
    expect(l.rounds[1]!.collector).toBe(ravi)
    expect(l.rounds[1]!.disputes).toHaveLength(1)
    expect(l.ignored).toBe(1)
  })

  it("a copycat circle with the same id from another wallet doesn't take over", async () => {
    const { s, meera } = await sharma()
    await s.write(newAddress(), "circle", s.rules.body)
    const l = (await readPublicLedger(s.chain.reader, s.circleId))!
    expect(l.organiser).toBe(meera) // earliest circle entity wins; a later copy is just ignored
  })
})
