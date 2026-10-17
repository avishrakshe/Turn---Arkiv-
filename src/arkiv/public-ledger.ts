/**
 * Reads a circle's ledger with NO circle key and NO Turn server: only public attributes and the
 * chain's immutable `$creator`. Used by /verify (straight from the browser to the Tiramisu RPC).
 *
 *   1. circle   : earliest `circle` entity with this circle_id → its creator is the organiser
 *   2. roster   : organiser's earliest `roster` → turn order from public attributes m1…mN
 *   3. records  : pay_claim / pay_ack / dispute / round_result created by roster wallets only
 *   4. confirmed: a claim by the payer + an ack by that round's collector with ref_key = claim key
 */
import type { PublicArkivClient } from "@arkiv-network/sdk"
import { str } from "@arkiv-network/sdk/attr"
import { eq, type Expression } from "@arkiv-network/sdk/query"
import { PROJECT } from "./config"
import { creatorScope } from "./reader"
import { publicRoster } from "./records"
import type { Address, Hex } from "../core/bodies"

type Reader = Pick<PublicArkivClient, "select" | "getBlockNumber" | "getEntity">
type Row = { key: Hex; creator: Address; block: bigint; expiresAt: bigint; type: string; round?: number; refKey?: Hex; readonly: boolean }

export type PublicPayment = { payer: Address; state: "confirmed" | "claimed" | "unpaid"; claim?: Row; ack?: Row }
export type PublicRound = { round: number; collector: Address; payments: PublicPayment[]; disputes: Row[]; result?: Row }
export type PublicLedger = {
  block: bigint
  organiser: Address
  circle: Row
  roster?: { key: Hex; members: Address[] }
  rounds: PublicRound[]
  ignored: number
  queries: string[]
}

const SEL = { key: true, creator: true, createdAt: true, expiresAt: true, creationFlags: true, attributes: true } as const

async function all(client: Reader, where: Expression[], block: bigint, creators?: readonly Address[]) {
  const preds = creators ? [...where, creatorScope(creators)] : where
  let page = await client.select(SEL).where(preds).atBlock(block).limit(200).fetch()
  const rows: Row[] = []
  for (let pages = 1; ; pages++) {
    for (const e of page.entities) {
      const a = e.attributes
      rows.push({
        key: e.key.toLowerCase() as Hex, creator: e.creator.toLowerCase() as Address, block: e.createdAt, expiresAt: e.expiresAt,
        type: a.entity_type?.type === "str" ? a.entity_type.value : "",
        ...(a.round?.type === "u64" && { round: Number(a.round.value) }),
        ...(a.ref_key?.type === "key" && { refKey: a.ref_key.value.toLowerCase() as Hex }),
        readonly: e.creationFlags.readonly,
      })
    }
    if (!page.hasNextPage() || pages >= 25) break
    page = await page.next()
  }
  return rows.sort((x, y) => (x.block < y.block ? -1 : x.block > y.block ? 1 : x.key < y.key ? -1 : 1))
}

export async function readPublicLedger(client: Reader, circleId: string, organiserHint?: Address): Promise<PublicLedger | undefined> {
  const block = await client.getBlockNumber({ cacheTime: 0 })
  const base = [eq("project", str(PROJECT)), eq("circle_id", str(circleId))]
  const queries: string[] = []

  queries.push(`project = "${PROJECT}" && circle_id = "${circleId}" && entity_type = "circle"${organiserHint ? ` && $creator = ${organiserHint}` : ""}`)
  const circles = (await all(client, [...base, eq("entity_type", str("circle"))], block, organiserHint ? [organiserHint] : undefined)).filter((r) => r.readonly)
  const circle = circles[0]
  if (!circle) return undefined
  const organiser = circle.creator

  queries.push(`project = "${PROJECT}" && circle_id = "${circleId}" && entity_type = "roster" && $creator = ${organiser}`)
  const rosters = (await all(client, [...base, eq("entity_type", str("roster"))], block, [organiser])).filter((r) => r.readonly && r.block > circle.block)
  let roster: PublicLedger["roster"]
  if (rosters[0]) {
    const attrs = (await client.getEntity(rosters[0].key).catch(() => undefined))?.attributes
    const members = attrs && publicRoster(attrs)
    if (members?.includes(organiser)) roster = { key: rosters[0].key, members }
  }

  const rounds: PublicRound[] = []
  let ignored = 0
  if (roster) {
    queries.push(`project = "${PROJECT}" && circle_id = "${circleId}" && ($creator = m1 || … || $creator = m${roster.members.length})`)
    const rows = (await all(client, base, block, roster.members)).filter((r) => r.readonly)
    const everyone = await all(client, base, block)
    const trusted = new Set<string>([organiser, ...roster.members])
    ignored = everyone.filter((r) => !trusted.has(r.creator)).length
    roster.members.forEach((collector, i) => {
      const round = i + 1
      const inRound = rows.filter((r) => r.round === round)
      const payments = roster!.members.filter((m) => m !== collector).map((payer): PublicPayment => {
        const claims = inRound.filter((r) => r.type === "pay_claim" && r.creator === payer)
        for (const c of claims) {
          const ack = inRound.find((r) => r.type === "pay_ack" && r.creator === collector && r.refKey === c.key && r.block >= c.block)
          if (ack) return { payer, state: "confirmed", claim: c, ack }
        }
        return claims[0] ? { payer, state: "claimed", claim: claims[0] } : { payer, state: "unpaid" }
      })
      const result = inRound.find((r) => r.type === "round_result" && r.creator === organiser)
      rounds.push({ round, collector, payments, disputes: inRound.filter((r) => r.type === "dispute"), ...(result && { result }) })
    })
  }
  return { block, organiser, circle, ...(roster && { roster }), rounds, ignored, queries }
}
