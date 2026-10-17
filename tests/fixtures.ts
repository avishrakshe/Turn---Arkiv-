import { ExpirationTime } from "@arkiv-network/sdk"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { importCircleKey, newCircleKeyHex } from "../src/arkiv/payload"
import { buildCreate, newOpId, type Intent } from "../src/arkiv/writer"
import type { Address, BodyOf, CircleBody } from "../src/core/bodies"
import type { EntityType } from "../src/arkiv/config"
import { FakeArkiv } from "./fake-arkiv"
import { roundDueMs } from "../src/core/schedule"

export const newAddress = (): Address => privateKeyToAccount(generatePrivateKey()).address.toLowerCase() as Address

export const circleBody = (over: Partial<CircleBody> = {}): CircleBody => ({
  name: "Sharma Family BC", template: "family_bc", amount_inr: 5000, members: 5, frequency: "monthly",
  mode: "bid", start_ms: Date.UTC(2026, 9, 15), due_days: 7, max_discount_bps: 3000, reveal_window_ms: 86_400_000,
  organiser_first: true, ...over,
})

export async function setup(n = 5) {
  const chain = new FakeArkiv()
  const keyHex = newCircleKeyHex()
  const key = await importCircleKey(keyHex)
  const circleId = newOpId()
  const people = Array.from({ length: n }, newAddress)
  const organiser = people[0]!
  /** Rules used to fill due_at on payment records (withRoster replaces it). */
  const rules = { body: circleBody({ members: n }) }

  async function write<K extends EntityType>(by: Address, type: K, body: BodyOf[K], extra: Partial<Intent<K>> = {}, useKey: CryptoKey | null = key, cid = circleId) {
    const pay = type === "pay_claim" || type === "pay_ack"
    const dueAt = pay && extra.round !== undefined ? roundDueMs(rules.body, extra.round) : undefined
    const intent = { type, circleId: cid, body, expires: ExpirationTime.fromDays(30), ...(dueAt !== undefined && { dueAt }), ...extra } as Intent
    const params = await buildCreate(intent, by, useKey, newOpId())
    return chain.add(params, by)
  }

  return { chain, key, keyHex, circleId, people, organiser, rules, write }
}

/** A circle with a locked roster of everyone in `people`. */
export async function withRoster(n = 5, over: Partial<CircleBody> = {}) {
  const s = await setup(n)
  s.rules.body = circleBody({ members: n, ...over })
  await s.write(s.organiser, "circle", s.rules.body)
  const joins = []
  for (const [i, p] of s.people.entries()) joins.push(await s.write(p, "member", { display_name: `Member ${i}`, lang: "en" }))
  await s.write(s.organiser, "roster", { members: s.people, member_keys: joins.map((j) => j.key.toLowerCase() as `0x${string}`) })
  return s
}
