/**
 * Two-party payment confirmation.
 *
 * A payment for round r by payer P is:
 *   - "claimed"   when P created a pay_claim for r,
 *   - "confirmed" when, in addition, the round's collector created a pay_ack whose ref_key is that
 *                 claim (an ack by anyone else is ignored),
 *   - "disputed"  when any roster member created a dispute referencing the claim or its ack
 *                 (precedence: disputed > confirmed > claimed).
 */
import type { AnyRec, Rec } from "../arkiv/records"
import type { Address, Hex } from "./bodies"

export type PaymentState = "unpaid" | "claimed" | "confirmed" | "disputed"

export type Payment = {
  round: number
  payer: Address
  collector: Address
  dueInr: number
  state: PaymentState
  /** The claim the state refers to (confirmed one if any, else the latest). */
  claim?: Rec<"pay_claim">
  ack?: Rec<"pay_ack">
  claims: Rec<"pay_claim">[]
  disputes: Rec<"dispute">[]
  /** Claimed amount differs from what was due. */
  amountMismatch: boolean
  /** Collector's on-time attestation, when confirmed. */
  onTime?: boolean
}

export type RoundParties = { round: number; collector: Address; members: readonly Address[]; dueInr: number }

const of = <K extends AnyRec["type"]>(records: readonly AnyRec[], type: K) =>
  records.filter((r): r is Extract<AnyRec, { type: K }> => r.type === type)

export function paymentFor(records: readonly AnyRec[], round: number, payer: Address, collector: Address, dueInr: number, members?: readonly Address[]): Payment {
  const roster = members ? new Set(members) : undefined
  const inRoster = (a: Address) => !roster || roster.has(a)

  const claims = of(records, "pay_claim").filter((c) => c.creator === payer && c.round === round)
  const acks = of(records, "pay_ack").filter((a) =>
    a.creator === collector && a.round === round && a.body.status === "received" && inRoster(a.creator))

  let claim: Rec<"pay_claim"> | undefined
  let ack: Rec<"pay_ack"> | undefined
  for (const c of claims) {
    const a = acks.find((x) => x.refKey === c.key && x.body.ref === c.key && x.block >= c.block)
    if (a) { claim = c; ack = a; break }
  }
  claim ??= claims[claims.length - 1]

  const refs = new Set<Hex>([...claims.map((c) => c.key), ...(ack ? [ack.key] : [])])
  const disputes = of(records, "dispute").filter((d) => d.round === round && d.refKey !== undefined && refs.has(d.refKey) && inRoster(d.creator))

  const state: PaymentState = disputes.length > 0 && claims.length > 0 ? "disputed" : ack ? "confirmed" : claims.length > 0 ? "claimed" : "unpaid"
  return {
    round, payer, collector, dueInr, state, claims, disputes,
    ...(claim && { claim }), ...(ack && { ack }),
    amountMismatch: !!claim && claim.body.amount_inr !== dueInr,
    ...(ack && { onTime: ack.onTime }),
  }
}

/** Every member except the collector owes the collector for this round. */
export function roundPayments(records: readonly AnyRec[], p: RoundParties): Payment[] {
  return p.members.filter((m) => m !== p.collector).map((m) => paymentFor(records, p.round, m, p.collector, p.dueInr, p.members))
}

export function roundProgress(payments: readonly Payment[]) {
  const count = (s: PaymentState) => payments.filter((p) => p.state === s).length
  return { total: payments.length, confirmed: count("confirmed"), claimed: count("claimed"), disputed: count("disputed"), unpaid: count("unpaid") }
}
