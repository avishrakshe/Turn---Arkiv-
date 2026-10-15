/**
 * Decrypted payload schemas. Every decrypted object is untrusted input: validate only what is
 * needed, copy known fields, drop the rest.
 */
import type { EntityType } from "../arkiv/config"

export type Hex = `0x${string}`
export type Address = `0x${string}`

export type Frequency = "monthly" | "weekly" | "demo"
export type Mode = "fixed" | "bid"
export type Template = "family_bc" | "office" | "kitty" | "wedding" | "custom"
export type Lang = "en" | "hi"

export type CircleBody = {
  name: string
  template: Template
  amount_inr: number
  members: number
  frequency: Frequency
  mode: Mode
  start_ms: number
  due_days: number
  max_discount_bps: number
  reveal_window_ms: number
  organiser_first: boolean
}
export type InviteBody = { seats_left: number }
export type MemberBody = { display_name: string; lang: Lang }
export type RosterBody = { members: Address[]; member_keys: Hex[] }
export type PayClaimBody = { amount_inr: number; method: "UPI" | "cash"; note: string }
export type PayAckBody = { ref: Hex; status: "received" }
export type BidCommitBody = Record<string, never>
export type BidCloseBody = Record<string, never>
export type BidRevealBody = { discount_bps: number; salt: Hex }
export type RoundResultBody = {
  winner: Address
  discount_bps: number
  payout_inr: number
  share_inr: number
  close_key: Hex | null
  reveal_keys: Hex[]
}
export type DisputeReason = "not_received" | "wrong_amount" | "wrong_result" | "other"
export type DisputeBody = { reason: DisputeReason; note: string }

export type BodyOf = {
  circle: CircleBody
  invite: InviteBody
  member: MemberBody
  roster: RosterBody
  pay_claim: PayClaimBody
  pay_ack: PayAckBody
  bid_commit: BidCommitBody
  bid_close: BidCloseBody
  bid_reveal: BidRevealBody
  round_result: RoundResultBody
  dispute: DisputeBody
}

/** Types whose payload and attributes carry a round number. */
export const ROUND_TYPES: readonly EntityType[] = ["pay_claim", "pay_ack", "bid_commit", "bid_close", "bid_reveal", "round_result", "dispute"]

class Invalid extends Error {}
const fail = (): never => { throw new Invalid() }

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail()
const int = (v: unknown, min: number, max: number): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail()
const text = (v: unknown, max: number, allowEmpty = false): string =>
  typeof v === "string" && v.length <= max && (allowEmpty || v.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(v) ? v : fail()
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T =>
  typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fail()
const bool = (v: unknown): boolean => (typeof v === "boolean" ? v : fail())
export const isHex32 = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v)
export const isAddr = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v)
const hex32 = (v: unknown): Hex => (isHex32(v) ? v : fail())
const addr = (v: unknown): Address => (isAddr(v) ? v : fail())

export const MAX_MEMBERS = 20
export const MIN_MEMBERS = 3

const validators: { [K in EntityType]: (o: Record<string, unknown>) => BodyOf[K] } = {
  circle: (o) => ({
    name: text(o.name, 60),
    template: oneOf(o.template, ["family_bc", "office", "kitty", "wedding", "custom"] as const),
    amount_inr: int(o.amount_inr, 100, 1_000_000),
    members: int(o.members, MIN_MEMBERS, MAX_MEMBERS),
    frequency: oneOf(o.frequency, ["monthly", "weekly", "demo"] as const),
    mode: oneOf(o.mode, ["fixed", "bid"] as const),
    start_ms: int(o.start_ms, 1_600_000_000_000, 4_000_000_000_000),
    due_days: int(o.due_days, 0, 30),
    max_discount_bps: int(o.max_discount_bps, 0, 5000),
    reveal_window_ms: int(o.reveal_window_ms, 0, 7 * 86_400_000),
    organiser_first: bool(o.organiser_first),
  }),
  invite: (o) => ({ seats_left: int(o.seats_left, 0, MAX_MEMBERS) }),
  member: (o) => ({ display_name: text(o.display_name, 40), lang: oneOf(o.lang, ["en", "hi"] as const) }),
  roster: (o) => {
    const members = Array.isArray(o.members) ? o.members.map(addr) : fail()
    const keys = Array.isArray(o.member_keys) ? o.member_keys.map(hex32) : fail()
    if (members.length < MIN_MEMBERS || members.length > MAX_MEMBERS || keys.length !== members.length) fail()
    if (new Set(members).size !== members.length) fail()
    return { members, member_keys: keys }
  },
  pay_claim: (o) => ({
    amount_inr: int(o.amount_inr, 0, 10_000_000),
    method: oneOf(o.method, ["UPI", "cash"] as const),
    note: o.note === undefined ? "" : text(o.note, 140, true),
  }),
  pay_ack: (o) => ({ ref: hex32(o.ref), status: oneOf(o.status, ["received"] as const) }),
  bid_commit: () => ({}),
  bid_close: () => ({}),
  bid_reveal: (o) => ({ discount_bps: int(o.discount_bps, 0, 10_000), salt: hex32(o.salt) }),
  round_result: (o) => ({
    winner: addr(o.winner),
    discount_bps: int(o.discount_bps, 0, 10_000),
    payout_inr: int(o.payout_inr, 0, 100_000_000),
    share_inr: int(o.share_inr, 0, 10_000_000),
    close_key: o.close_key === null ? null : hex32(o.close_key),
    reveal_keys: Array.isArray(o.reveal_keys) ? o.reveal_keys.map(hex32) : fail(),
  }),
  dispute: (o) => ({
    reason: oneOf(o.reason, ["not_received", "wrong_amount", "wrong_result", "other"] as const),
    note: o.note === undefined ? "" : text(o.note, 140, true),
  }),
}

/** The binding envelope every decrypted payload carries (see arkiv/schema.md). */
export type Binding = { v: 1; t: EntityType; c: string; by: Address; r?: number }

export function makeEnvelope<K extends EntityType>(b: Binding & { t: K }, body: BodyOf[K]): Record<string, unknown> {
  return { ...body, v: 1, t: b.t, c: b.c, by: b.by, ...(b.r !== undefined ? { r: b.r } : {}) }
}

/**
 * Validates a decrypted envelope against the binding derived from the entity's PUBLIC metadata.
 * Returns undefined if anything is off (wrong type/circle/creator/round or malformed body).
 */
export function parseEnvelope<K extends EntityType>(raw: unknown, expect: Binding & { t: K }): BodyOf[K] | undefined {
  try {
    const o = obj(raw)
    if (o.v !== 1 || o.t !== expect.t || o.c !== expect.c) return undefined
    if (typeof o.by !== "string" || o.by.toLowerCase() !== expect.by) return undefined
    if (expect.r !== undefined ? o.r !== expect.r : o.r !== undefined) return undefined
    return validators[expect.t](o) as BodyOf[K]
  } catch (e) {
    if (e instanceof Invalid) return undefined
    throw e
  }
}

/** Writer-side check before encrypting: throws a plain Error for a malformed body. */
export function validateBody<K extends EntityType>(t: K, body: unknown): BodyOf[K] {
  try {
    return validators[t](obj(body)) as BodyOf[K]
  } catch (e) {
    if (e instanceof Invalid) throw new Error(`invalid ${t} record`)
    throw e
  }
}
