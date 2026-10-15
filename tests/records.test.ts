import { str, u64 } from "@arkiv-network/sdk/attr"
import { describe, expect, it } from "vitest"
import { decodeRecord } from "../src/arkiv/records"
import { importCircleKey, newCircleKeyHex } from "../src/arkiv/payload"
import { newAddress, setup } from "./fixtures"

const claim = { amount_inr: 5000, method: "UPI" as const, note: "" }

describe("decodeRecord trust gate", () => {
  it("accepts a well-formed record from a trusted creator", async () => {
    const s = await setup()
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    const d = await decodeRecord(e, { circleId: s.circleId, key: s.key, trusted: () => true })
    expect(d.ok).toBe(true)
    if (d.ok) expect(d.rec).toMatchObject({ type: "pay_claim", round: 1, creator: s.people[1], body: claim })
  })

  it("never decrypts an entity from an untrusted creator", async () => {
    const s = await setup()
    const e = await s.write(newAddress(), "pay_claim", claim, { round: 1 })
    let decrypts = 0
    const spyKey = new Proxy(s.key, { get: (t, p) => { decrypts++; return Reflect.get(t, p) } })
    const d = await decodeRecord(e, { circleId: s.circleId, key: spyKey, trusted: () => false })
    expect(d).toMatchObject({ ok: false, reason: "untrusted_creator" })
    expect(decrypts).toBe(0)
  })

  it("rejects the wrong circle key", async () => {
    const s = await setup()
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    const other = await importCircleKey(newCircleKeyHex())
    expect(await decodeRecord(e, { circleId: s.circleId, key: other, trusted: () => true })).toMatchObject({ ok: false, reason: "decrypt_failed" })
  })

  it("rejects tampered ciphertext", async () => {
    const s = await setup()
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    e.payload[50] = e.payload[50]! ^ 0xff
    expect(await decodeRecord(e, { circleId: s.circleId, key: s.key, trusted: () => true })).toMatchObject({ ok: false, reason: "decrypt_failed" })
  })

  it("rejects an entity replayed from another circle (same key reused, different circle_id)", async () => {
    const s = await setup()
    const otherCircle = "f".repeat(32)
    // Payload sealed for otherCircle, but the attacker labels the entity with our circle_id.
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 }, s.key, otherCircle)
    const ours = { ...e, attributes: { ...e.attributes, circle_id: str(s.circleId) } }
    expect(await decodeRecord(ours, { circleId: s.circleId, key: s.key, trusted: () => true })).toMatchObject({ ok: false, reason: "binding_mismatch" })
    // And as-is it is simply not this circle.
    expect(await decodeRecord(e, { circleId: s.circleId, key: s.key, trusted: () => true })).toMatchObject({ ok: false, reason: "wrong_circle" })
  })

  it("rejects a member's payload copied into another member's entity", async () => {
    const s = await setup()
    const original = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    const copy = { ...original, creator: s.people[2]! }
    expect(await decodeRecord(copy, { circleId: s.circleId, key: s.key, trusted: () => true })).toMatchObject({ ok: false, reason: "binding_mismatch" })
  })

  it("rejects a round-1 payload relabelled as round 2", async () => {
    const s = await setup()
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    const relabelled = { ...e, attributes: { ...e.attributes, round: u64(2n) } }
    expect(await decodeRecord(relabelled, { circleId: s.circleId, key: s.key, trusted: () => true })).toMatchObject({ ok: false, reason: "binding_mismatch" })
  })

  it("rejects mutable or publicly-extensible records", async () => {
    const s = await setup()
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    const ctx = { circleId: s.circleId, key: s.key, trusted: () => true }
    expect(await decodeRecord({ ...e, creationFlags: { readonly: false, permissionlessExtension: false } }, ctx)).toMatchObject({ reason: "mutable" })
    expect(await decodeRecord({ ...e, creationFlags: { readonly: true, permissionlessExtension: true } }, ctx)).toMatchObject({ reason: "extensible" })
  })

  it("rejects wrong content type and other projects", async () => {
    const s = await setup()
    const e = await s.write(s.people[1]!, "pay_claim", claim, { round: 1 })
    const ctx = { circleId: s.circleId, key: s.key, trusted: () => true }
    expect(await decodeRecord({ ...e, contentType: "application/json" }, ctx)).toMatchObject({ reason: "content_type" })
    expect(await decodeRecord({ ...e, attributes: { ...e.attributes, project: str("evil") } }, ctx)).toMatchObject({ reason: "wrong_project" })
  })
})
