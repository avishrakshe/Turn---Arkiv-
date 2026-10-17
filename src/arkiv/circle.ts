/**
 * Loads everything one circle member's device can trust about a circle, at one block.
 *
 *   1. Organiser records (creator = organiser from the invite link).
 *   2. Roster = organiser's earliest valid `roster`. Before it exists: `member` joins from anyone,
 *      validated by decryption + binding (the organiser chooses who gets in).
 *   3. After the roster: records from roster addresses ONLY — the query itself is creator-scoped,
 *      so spam from other addresses is never fetched or decrypted.
 */
import type { PublicArkivClient } from "@arkiv-network/sdk"
import { str } from "@arkiv-network/sdk/attr"
import { eq } from "@arkiv-network/sdk/query"
import { ORGANISER_TYPES, PROJECT, type EntityType } from "./config"
import { fetchAll } from "./reader"
import { roundDueMs } from "../core/schedule"
import { byChainOrder, decodeRecord, dedupeByOp, type AnyRec, type Decoded, type RawEntity, type Rec, type RejectReason } from "./records"
import type { Address, Hex } from "../core/bodies"

export type CircleRef = { circleId: string; organiser: Address }

export type Snapshot = {
  block: bigint
  ref: CircleRef
  circle?: Rec<"circle">
  invites: Rec<"invite">[]
  /** All valid joins seen (before the roster) or the roster members' joins (after). */
  joins: Rec<"member">[]
  roster?: Rec<"roster">
  /** Trusted, de-duplicated records in chain order (all types). */
  records: AnyRec[]
  rejected: { key: Hex; reason: RejectReason | "invalid_roster" | "bad_due_at" }[]
  /** Records in this circle_id from wallets outside the roster: never decrypted, only counted. */
  ignored: { key: Hex; creator: Address }[]
}

type Reader = Pick<PublicArkivClient, "select" | "getBlockNumber">

const isType = <K extends EntityType>(t: K) => (r: AnyRec): r is Rec<K> & AnyRec => r.type === t

export async function loadCircle(client: Reader, ref: CircleRef, key: CryptoKey): Promise<Snapshot> {
  const organiser = ref.organiser.toLowerCase() as Address
  const base = [eq("project", str(PROJECT)), eq("circle_id", str(ref.circleId))]
  const block = await client.getBlockNumber({ cacheTime: 0 })
  const rejected: Snapshot["rejected"] = []

  const decodeAll = async (entities: RawEntity[], trusted: (t: EntityType, c: Address) => boolean) => {
    const out: AnyRec[] = []
    for (const e of entities) {
      const d: Decoded = await decodeRecord(e, { circleId: ref.circleId, key, trusted })
      if (d.ok) out.push(d.rec)
      else rejected.push({ key: d.key, reason: d.reason })
    }
    return out
  }

  // 1. Organiser's own records (any type the organiser may create).
  const orgRaw = await fetchAll(client, base, { creators: [organiser], atBlock: block })
  const orgRecs = await decodeAll(orgRaw.entities, (_t, c) => c === organiser)
  const circle = dedupeByOp(orgRecs.filter(isType("circle")))[0]

  // 2. Joins from anyone (validated). Needed to verify the roster and, before it, to list joiners.
  const joinRaw = await fetchAll(client, [...base, eq("entity_type", str("member"))], { atBlock: block })
  const joinRecs = await decodeAll(joinRaw.entities.filter((e) => e.creator.toLowerCase() !== organiser), (t) => t === "member")
  const allJoins = dedupeByOp([...orgRecs.filter(isType("member")), ...joinRecs.filter(isType("member"))])
  // One join per address: the earliest.
  const firstJoin = new Map<Address, Rec<"member">>()
  for (const j of allJoins) if (!firstJoin.has(j.creator)) firstJoin.set(j.creator, j)

  const roster = pickRoster(orgRecs.filter(isType("roster")), firstJoin, organiser, circle, rejected)

  let records: AnyRec[]
  let ignored: Snapshot["ignored"] = []
  if (roster) {
    const others = roster.body.members.filter((m) => m !== organiser)
    const memberRaw = await fetchAll(client, base, { creators: others, atBlock: block })
    const rosterSet = new Set(roster.body.members)
    const memberRecs = await decodeAll(memberRaw.entities, (t, c) => rosterSet.has(c) && !ORGANISER_TYPES.includes(t))
    records = dedupeByOp([...orgRecs, ...memberRecs])
    // What the creator scope leaves out (keys + creators only; nothing is decrypted).
    const all = await fetchAll(client, base, { atBlock: block, light: true })
    const trustedSet = new Set<string>([organiser, ...roster.body.members])
    ignored = all.entities.filter((e) => !trustedSet.has(e.creator.toLowerCase()))
      .map((e) => ({ key: e.key.toLowerCase() as Hex, creator: e.creator.toLowerCase() as Address }))
  } else {
    records = dedupeByOp([...orgRecs, ...joinRecs])
  }

  // due_at is public and queryable, so it must match the rules everyone agreed to.
  if (circle) {
    records = records.filter((r) => {
      if ((r.type !== "pay_claim" && r.type !== "pay_ack") || r.round === undefined) return true
      const ok = r.dueAt === roundDueMs(circle.body, r.round)
      if (!ok) rejected.push({ key: r.key, reason: "bad_due_at" })
      return ok
    })
  }

  const joins = roster
    ? roster.body.members.map((m) => firstJoin.get(m)).filter((j): j is Rec<"member"> => !!j)
    : [...firstJoin.values()].sort(byChainOrder)

  return {
    block, ref: { circleId: ref.circleId, organiser }, ...(circle && { circle }),
    invites: records.filter(isType("invite")),
    joins, ...(roster && { roster }), records, rejected, ignored,
  }
}

/**
 * The organiser's earliest roster that is consistent: organiser included, size ≤ circle size
 * (the roster size is the number of rounds),
 * every member has a join whose key matches, and it was created after those joins.
 */
export function pickRoster(
  candidates: Rec<"roster">[],
  joins: Map<Address, Rec<"member">>,
  organiser: Address,
  circle: Rec<"circle"> | undefined,
  rejected: Snapshot["rejected"],
): Rec<"roster"> | undefined {
  if (!circle) return undefined
  for (const r of [...candidates].sort(byChainOrder)) {
    const ok = r.block > circle.block
      && r.body.members.includes(organiser)
      && r.body.members.length <= circle.body.members
      && r.body.members.every((m, i) => {
        const j = joins.get(m)
        return j && j.key === r.body.member_keys[i] && j.block <= r.block
      })
    if (ok) return r
    rejected.push({ key: r.key, reason: "invalid_roster" })
  }
  return undefined
}
