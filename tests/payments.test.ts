import { describe, expect, it } from "vitest"
import { loadCircle } from "../src/arkiv/circle"
import { paymentFor, roundPayments, roundProgress } from "../src/core/payments"
import type { Hex } from "../src/core/bodies"
import { newAddress, setup, withRoster } from "./fixtures"

const claim = { amount_inr: 5000, method: "UPI" as const, note: "" }
const k = (e: { key: string }) => e.key.toLowerCase() as Hex

describe("circle loading is creator-scoped", () => {
  it("before the roster: lists valid joins, ignores undecryptable spam", async () => {
    const s = await setup(3)
    await s.write(s.organiser, "circle", (await import("./fixtures")).circleBody({ members: 3 }))
    await s.write(s.people[1]!, "member", { display_name: "Priya", lang: "hi" })
    const outsider = newAddress()
    const { importCircleKey, newCircleKeyHex } = await import("../src/arkiv/payload")
    await s.write(outsider, "member", { display_name: "Spam", lang: "en" }, {}, await importCircleKey(newCircleKeyHex()))
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key)
    expect(snap.circle?.body.name).toBe("Sharma Family BC")
    expect(snap.roster).toBeUndefined()
    expect(snap.joins.map((j) => j.body.display_name)).toEqual(["Priya"])
    expect(snap.rejected.some((r) => r.reason === "decrypt_failed")).toBe(true)
  })

  it("after the roster: records by non-roster addresses are never even queried", async () => {
    const s = await withRoster(3)
    const outsider = newAddress()
    await s.write(outsider, "pay_claim", claim, { round: 1 }) // has the key (link leaked) but isn't a member
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key)
    expect(snap.roster?.body.members).toEqual(s.people)
    expect(snap.records.some((r) => r.creator === outsider)).toBe(false)
    expect(snap.rejected.some((r) => r.key === k(s.chain.entities.at(-1)!))).toBe(false) // not fetched at all
    expect(s.chain.queries.some((q) => q.includes("$creator"))).toBe(true)
  })

  it("ignores a roster that lists an address with no join", async () => {
    const s = await setup(3)
    await s.write(s.organiser, "circle", (await import("./fixtures")).circleBody({ members: 3 }))
    const j0 = await s.write(s.organiser, "member", { display_name: "Meera", lang: "en" })
    const j1 = await s.write(s.people[1]!, "member", { display_name: "Priya", lang: "en" })
    await s.write(s.organiser, "roster", { members: [s.organiser, s.people[1]!, s.people[2]!], member_keys: [k(j0), k(j1), k(j1)] })
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: s.organiser }, s.key)
    expect(snap.roster).toBeUndefined()
    expect(snap.rejected.some((r) => r.reason === "invalid_roster")).toBe(true)
  })
})

describe("two-party payment confirmation", () => {
  it("claimed â†’ confirmed only with the collector's ack", async () => {
    const s = await withRoster(3)
    const [org, priya, rohan] = s.people as [Hex, Hex, Hex]
    const c = await s.write(priya, "pay_claim", claim, { round: 1 })
    let snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: org }, s.key)
    expect(paymentFor(snap.records, 1, priya, org, 5000).state).toBe("claimed")

    await s.write(org, "pay_ack", { ref: k(c), status: "received" }, { round: 1, refKey: k(c), onTime: true })
    snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: org }, s.key)
    const p = paymentFor(snap.records, 1, priya, org, 5000, s.people)
    expect(p.state).toBe("confirmed")
    expect(p.onTime).toBe(true)
    expect(paymentFor(snap.records, 1, rohan, org, 5000).state).toBe("unpaid")
  })

  it("ignores a forged pay_ack by a member who is not the collector", async () => {
    const s = await withRoster(3)
    const [org, priya, rohan] = s.people as [Hex, Hex, Hex]
    const c = await s.write(priya, "pay_claim", claim, { round: 1 })
    await s.write(rohan, "pay_ack", { ref: k(c), status: "received" }, { round: 1, refKey: k(c), onTime: true })
    await s.write(priya, "pay_ack", { ref: k(c), status: "received" }, { round: 1, refKey: k(c), onTime: true })
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: org }, s.key)
    expect(paymentFor(snap.records, 1, priya, org, 5000, s.people).state).toBe("claimed")
  })

  it("ignores an ack for a different round or a different claim", async () => {
    const s = await withRoster(3)
    const [org, priya, rohan] = s.people as [Hex, Hex, Hex]
    const c1 = await s.write(priya, "pay_claim", claim, { round: 1 })
    const c2 = await s.write(rohan, "pay_claim", claim, { round: 1 })
    await s.write(org, "pay_ack", { ref: k(c1), status: "received" }, { round: 2, refKey: k(c1), onTime: true })
    await s.write(org, "pay_ack", { ref: k(c2), status: "received" }, { round: 1, refKey: k(c2), onTime: true })
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: org }, s.key)
    expect(paymentFor(snap.records, 1, priya, org, 5000).state).toBe("claimed")
    expect(paymentFor(snap.records, 1, rohan, org, 5000).state).toBe("confirmed")
  })

  it("a dispute takes precedence and flags amount mismatch", async () => {
    const s = await withRoster(3)
    const [org, priya, rohan] = s.people as [Hex, Hex, Hex]
    const c = await s.write(priya, "pay_claim", { ...claim, amount_inr: 4000 }, { round: 1 })
    await s.write(org, "pay_ack", { ref: k(c), status: "received" }, { round: 1, refKey: k(c), onTime: true })
    await s.write(rohan, "dispute", { reason: "wrong_amount", note: "short by â‚¹1,000" }, { round: 1, refKey: k(c) })
    const snap = await loadCircle(s.chain.reader, { circleId: s.circleId, organiser: org }, s.key)
    const ps = roundPayments(snap.records, { round: 1, collector: org, members: s.people, dueInr: 5000 })
    const p = ps.find((x) => x.payer === priya)!
    expect(p.state).toBe("disputed")
    expect(p.amountMismatch).toBe(true)
    expect(roundProgress(ps)).toEqual({ total: 2, confirmed: 0, claimed: 0, disputed: 1, unpaid: 1 })
  })
})
