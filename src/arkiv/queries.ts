/**
 * "Who hasn't paid": one compound query on typed numeric attributes, walked with cursor pages.
 *
 *   project = "turn_arkiv_v1" AND entity_type = "pay_claim" AND circle_id = <id>
 *   AND due_at <= <now ms> (u64 range) AND round >= <from> AND round <= <to>
 *   AND ($creator = <member 1> OR … OR $creator = <member N>)
 *
 * It returns only claims for rounds that are already due, made by roster wallets. Everyone who
 * owes for those rounds and has no claim is late. No payload is fetched (attributes only).
 */
import type { PublicArkivClient } from "@arkiv-network/sdk"
import { str, u64 } from "@arkiv-network/sdk/attr"
import { eq, gte, lte } from "@arkiv-network/sdk/query"
import { PROJECT } from "./config"
import { creatorScope } from "./reader"
import type { Address } from "../core/bodies"
import { roundDueMs } from "../core/schedule"
import type { CircleBody } from "../core/bodies"

type Reader = Pick<PublicArkivClient, "select" | "getBlockNumber">

export type Late = { round: number; member: Address; collector: Address; dueMs: number }

export const overdueQueryText = (circleId: string, nowMs: number, rounds: [number, number]) =>
  `project = "${PROJECT}" && entity_type = "pay_claim" && circle_id = "${circleId}" && due_at <= ${nowMs} && round >= ${rounds[0]} && round <= ${rounds[1]} && $creator ∈ roster`

export async function whoHasntPaid(
  client: Reader, circleId: string, rules: CircleBody, order: readonly Address[], nowMs: number,
  opts: { pageSize?: number; closedRounds?: ReadonlySet<number> } = {},
): Promise<{ late: Late[]; block: bigint; pages: number; claims: number }> {
  // Rounds whose payment window has ended.
  const due: number[] = []
  for (let r = 1; r <= order.length; r++) if (roundDueMs(rules, r) <= nowMs && !opts.closedRounds?.has(r)) due.push(r)
  const block = await client.getBlockNumber({ cacheTime: 0 })
  if (due.length === 0 || order.length === 0) return { late: [], block, pages: 0, claims: 0 }

  const where = [
    eq("project", str(PROJECT)), eq("entity_type", str("pay_claim")), eq("circle_id", str(circleId)),
    lte("due_at", u64(nowMs)), gte("round", u64(due[0]!)), lte("round", u64(due.at(-1)!)),
    creatorScope(order),
  ]
  let page = await client.select({ key: true, creator: true, attributes: { round: true, due_at: true } })
    .where(where).atBlock(block).limit(opts.pageSize ?? 100).fetch()
  const paid = new Set<string>()
  let pages = 1, claims = 0
  for (;;) {
    for (const e of page.entities) {
      const r = e.attributes.round
      const d = e.attributes.due_at
      if (r?.type !== "u64" || d?.type !== "u64") continue
      // A claim only counts for the due date the rules give its round.
      if (Number(d.value) !== roundDueMs(rules, Number(r.value))) continue
      paid.add(`${Number(r.value)}:${e.creator.toLowerCase()}`)
      claims++
    }
    if (!page.hasNextPage() || pages >= 25) break
    page = await page.next()
    pages++
  }
  const late: Late[] = []
  for (const r of due) {
    const collector = order[r - 1]!
    for (const m of order) if (m !== collector && !paid.has(`${r}:${m}`)) late.push({ round: r, member: m, collector, dueMs: roundDueMs(rules, r) })
  }
  return { late, block, pages, claims }
}
