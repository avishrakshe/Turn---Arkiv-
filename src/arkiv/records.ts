/**
 * Turns raw Arkiv entities into trusted Turn records.
 *
 * Order of checks matters: namespace → circle → type → creator trust → flags → content type →
 * attributes, and only then decryption and payload binding. An entity from an untrusted creator is
 * never decrypted.
 */
import type { Attributes } from "@arkiv-network/sdk"
import { EMPTY_CONTENT_TYPE, isEntityType, isLeaseType, PROJECT, type EntityType } from "./config"
import { ENCRYPTED_CONTENT_TYPE, open } from "./payload"
import { parseEnvelope, ROUND_TYPES, type Address, type BodyOf, type Hex } from "../core/bodies"

/** The fields Turn selects for every entity. */
export type RawEntity = {
  key: Hex
  creator: Hex
  owner?: Hex
  createdAt: bigint
  expiresAt: bigint
  creationFlags: { readonly: boolean; permissionlessExtension: boolean }
  contentType: string
  payload: Uint8Array
  attributes: Attributes
}

export type Rec<K extends EntityType = EntityType> = {
  key: Hex
  type: K
  creator: Address
  /** Current owner (mutable; only for display — trust uses `creator`). */
  owner: Address
  /** Chain block the entity was created in — the only ordering Turn trusts. */
  block: bigint
  expiresAt: bigint
  /** Client wall-clock claim, display only. */
  createdAtMs: number
  opId: string
  round?: number
  /** Round due time (ms), checked against the circle rules by the loader. */
  dueAt?: number
  refKey?: Hex
  commit?: Hex
  onTime?: boolean
  isFinal?: boolean
  body: BodyOf[K]
}
export type AnyRec = { [K in EntityType]: Rec<K> }[EntityType]

export type RejectReason =
  | "wrong_project" | "wrong_circle" | "unknown_type" | "untrusted_creator" | "flags"
  | "content_type" | "bad_attributes" | "decrypt_failed" | "binding_mismatch"

export type Decoded = { ok: true; rec: AnyRec } | { ok: false; key: Hex; reason: RejectReason }

export type DecodeContext = {
  circleId: string
  key: CryptoKey
  /** Decides, from public metadata only, whether this creator may publish this type. */
  trusted: (type: EntityType, creator: Address) => boolean
}

type AttrValue = Attributes[string]
const strAttr = (v: AttrValue | undefined) => (v?.type === "str" ? v.value : undefined)
const u64Attr = (v: AttrValue | undefined) =>
  v?.type === "u64" && v.value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v.value) : undefined
const boolAttr = (v: AttrValue | undefined) => (v?.type === "bool" ? v.value : undefined)
const keyAttr = (v: AttrValue | undefined) => (v?.type === "key" ? (v.value.toLowerCase() as Hex) : undefined)
const b32Attr = (v: AttrValue | undefined) => (v?.type === "bytes32" ? (v.value.toLowerCase() as Hex) : undefined)

export async function decodeRecord(raw: RawEntity, ctx: DecodeContext): Promise<Decoded> {
  const key = raw.key.toLowerCase() as Hex
  const reject = (reason: RejectReason): Decoded => ({ ok: false, key, reason })
  const a = raw.attributes

  if (strAttr(a.project) !== PROJECT) return reject("wrong_project")
  if (strAttr(a.circle_id) !== ctx.circleId) return reject("wrong_circle")
  const type = strAttr(a.entity_type)
  if (!isEntityType(type)) return reject("unknown_type")
  const creator = raw.creator.toLowerCase() as Address
  if (!ctx.trusted(type, creator)) return reject("untrusted_creator")
  // Flags are fixed at creation. Every record except the invite is readonly, and exactly the lease
  // types are extensible by anyone, so no member can publish a record the circle can't keep alive.
  if (raw.creationFlags.readonly !== (type !== "invite")) return reject("flags")
  if (raw.creationFlags.permissionlessExtension !== isLeaseType(type)) return reject("flags")

  const createdAtMs = u64Attr(a.created_at)
  const opId = strAttr(a.op_id)
  const round = u64Attr(a.round)
  const dueAt = u64Attr(a.due_at)
  const refKey = keyAttr(a.ref_key)
  const commit = b32Attr(a.commit)
  const onTime = boolAttr(a.on_time)
  const isFinal = boolAttr(a.is_final)
  if (createdAtMs === undefined || !opId || !/^[0-9a-f]{32}$/.test(opId)) return reject("bad_attributes")
  const needsRound = ROUND_TYPES.includes(type)
  if (needsRound ? round === undefined || round < 1 : round !== undefined) return reject("bad_attributes")
  if ((type === "pay_ack" || type === "bid_reveal" || type === "dispute") && !refKey) return reject("bad_attributes")
  if (type === "pay_ack" && onTime === undefined) return reject("bad_attributes")
  if ((type === "pay_claim" || type === "pay_ack") !== (dueAt !== undefined)) return reject("bad_attributes")
  if (type === "bid_commit" && !commit) return reject("bad_attributes")
  if (type === "round_result" && isFinal === undefined) return reject("bad_attributes")

  let body: BodyOf[EntityType] | undefined
  if (type === "bid_commit") {
    if (raw.contentType !== EMPTY_CONTENT_TYPE) return reject("content_type")
    if (raw.payload.length !== 0) return reject("binding_mismatch")
    body = {}
  } else {
    if (raw.contentType !== ENCRYPTED_CONTENT_TYPE) return reject("content_type")
    let plain: unknown
    try {
      plain = await open(ctx.key, raw.payload)
    } catch {
      return reject("decrypt_failed")
    }
    body = parseEnvelope(plain, { v: 1, t: type, c: ctx.circleId, by: creator, ...(needsRound ? { r: round } : {}) })
    if (!body) return reject("binding_mismatch")
    if (type === "pay_ack" && (body as BodyOf["pay_ack"]).ref !== refKey) return reject("binding_mismatch")
  }

  const rec = {
    key, type, creator, owner: (raw.owner ?? raw.creator).toLowerCase() as Address, block: raw.createdAt, expiresAt: raw.expiresAt, createdAtMs, opId, body,
    ...(round !== undefined && { round }),
    ...(dueAt !== undefined && { dueAt }),
    ...(refKey && { refKey }),
    ...(commit && { commit }),
    ...(onTime !== undefined && { onTime }),
    ...(isFinal !== undefined && { isFinal }),
  } as AnyRec
  return { ok: true, rec }
}

/**
 * Keep one record per (creator, op_id): the earliest by block, then key. A retried write that
 * landed twice is therefore counted once.
 */
export function dedupeByOp<T extends { creator: Address; opId: string; block: bigint; key: Hex }>(recs: T[]): T[] {
  const best = new Map<string, T>()
  for (const r of recs) {
    const id = `${r.creator}:${r.opId}`
    const cur = best.get(id)
    if (!cur || r.block < cur.block || (r.block === cur.block && r.key < cur.key)) best.set(id, r)
  }
  return [...best.values()].sort(byChainOrder)
}

export const byChainOrder = (x: { block: bigint; key: Hex }, y: { block: bigint; key: Hex }) =>
  x.block < y.block ? -1 : x.block > y.block ? 1 : x.key < y.key ? -1 : x.key > y.key ? 1 : 0
