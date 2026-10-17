/**
 * What a circle looks like to one member, computed only from verified records (see
 * src/arkiv/circle.ts). Pure: the UI, /verify and the seed script all use it.
 */
import type { Snapshot } from "../arkiv/circle"
import type { AnyRec, Rec } from "../arkiv/records"
import type { Address, CircleBody, Hex } from "./bodies"
import { roundPayments, roundProgress, type Payment } from "./payments"
import { roundDueMs, roundOpensMs } from "./schedule"

export type MemberView = { address: Address; name: string; lang: "en" | "hi"; joinKey: Hex; seat: number }

export type RoundView = {
  round: number
  collector: Address
  opensMs: number
  dueMs: number
  status: "closed" | "open" | "upcoming"
  payments: Payment[]
  progress: ReturnType<typeof roundProgress>
  result?: Rec<"round_result">
  /** The organiser's result names someone other than the roster's turn order. */
  resultMismatch: boolean
  disputes: Rec<"dispute">[]
}

export type CircleView = {
  circleId: string
  organiser: Address
  rules: CircleBody
  circleKey: Hex
  phase: "joining" | "running" | "finished"
  members: MemberView[]
  seatsLeft: number
  rounds: RoundView[]
  /** First round without a result (undefined when finished or not started). */
  current?: RoundView
  /** Lease: the earliest and latest deadline among circle records (blocks). */
  minExpiresAt: bigint
  maxExpiresAt: bigint
  circleExpiresAt: bigint
  inviteExpiresAt?: bigint
  ignoredCount: number
  rejectedCount: number
  /** Every trusted record that the lease covers (for "Keep our record alive"). */
  leaseRecords: AnyRec[]
  /** Circle entity owner (changes on handover); trust stays with the creator. */
  managedBy: Address
}

const by = <K extends AnyRec["type"]>(records: readonly AnyRec[], type: K) =>
  records.filter((r): r is Extract<AnyRec, { type: K }> => r.type === type)

export function nameOf(view: Pick<CircleView, "members">, a: Address | undefined): string {
  if (!a) return "?"
  return view.members.find((m) => m.address === a)?.name ?? `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function buildView(snap: Snapshot): CircleView | undefined {
  const circle = snap.circle
  if (!circle) return undefined
  const rules = circle.body
  const roster = snap.roster
  const members: MemberView[] = snap.joins.map((j, i) => ({
    address: j.creator, name: j.body.display_name, lang: j.body.lang, joinKey: j.key, seat: roster ? i : -1,
  }))

  const results = by(snap.records, "round_result")
  const disputes = by(snap.records, "dispute")
  const rounds: RoundView[] = []
  if (roster) {
    const order = roster.body.members
    let openAssigned = false
    for (let r = 1; r <= order.length; r++) {
      const collector = order[r - 1]!
      const payments = roundPayments(snap.records, { round: r, collector, members: order, dueInr: rules.amount_inr })
      // Earliest result per round by the organiser (loader already enforced the creator).
      const result = results.filter((x) => x.round === r)[0]
      const status: RoundView["status"] = result ? "closed" : openAssigned ? "upcoming" : "open"
      if (!result) openAssigned = true
      rounds.push({
        round: r, collector, opensMs: roundOpensMs(rules, r), dueMs: roundDueMs(rules, r), status, payments,
        progress: roundProgress(payments), ...(result && { result }),
        resultMismatch: !!result && result.body.winner !== collector,
        disputes: disputes.filter((d) => d.round === r),
      })
    }
  }
  const current = rounds.find((r) => r.status === "open")
  const lease = snap.records.filter((r) => r.type !== "invite" && r.type !== "bid_commit")
  const exp = lease.map((r) => r.expiresAt)
  const invite = snap.invites.at(-1)

  return {
    circleId: snap.ref.circleId,
    organiser: snap.ref.organiser,
    rules,
    circleKey: circle.key,
    phase: !roster ? "joining" : current ? "running" : "finished",
    members,
    seatsLeft: Math.max(0, rules.members - members.length),
    rounds,
    ...(current && { current }),
    minExpiresAt: exp.reduce((m, x) => (x < m ? x : m), circle.expiresAt),
    maxExpiresAt: exp.reduce((m, x) => (x > m ? x : m), circle.expiresAt),
    circleExpiresAt: circle.expiresAt,
    ...(invite && { inviteExpiresAt: invite.expiresAt }),
    ignoredCount: snap.ignored.length,
    rejectedCount: snap.rejected.length,
    leaseRecords: lease,
    managedBy: circle.owner,
  }
}

/** Payout for a fixed-order round: every other member's contribution. */
export const fixedPayout = (rules: Pick<CircleBody, "amount_inr">, members: number) => rules.amount_inr * (members - 1)
