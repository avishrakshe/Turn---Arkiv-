import { describe, expect, it } from "vitest"
import { BUCKETS, frame, importCircleKey, newCircleKeyHex, open, PayloadError, seal, unframe } from "../src/arkiv/payload"

describe("payload framing + padding", () => {
  it("round-trips JSON", () => {
    const v = { amount_inr: 5000, note: "धन्यवाद" }
    expect(unframe(frame(v))).toEqual(v)
  })

  it("pads to buckets so amount size does not leak", () => {
    expect(frame({ amount_inr: 1000 }).length).toBe(256)
    expect(frame({ amount_inr: 10_00_000 }).length).toBe(256)
    expect(frame({ note: "x".repeat(300) }).length).toBe(512)
    for (const b of BUCKETS) expect(b % 256).toBe(0)
  })

  it("rejects oversize and malformed frames", () => {
    expect(() => frame({ note: "x".repeat(5000) })).toThrow(PayloadError)
    const f = frame({ a: 1 })
    f[f.length - 1] = 7 // non-zero padding
    expect(() => unframe(f)).toThrow(PayloadError)
    expect(() => unframe(new Uint8Array(300))).toThrow(PayloadError)
  })
})

describe("circle-key encryption", () => {
  it("encrypts to bucket + 28 bytes and decrypts", async () => {
    const key = await importCircleKey(newCircleKeyHex())
    const env = await seal(key, { amount_inr: 5000 })
    expect(env.length).toBe(256 + 28)
    expect(await open(key, env)).toEqual({ amount_inr: 5000 })
  })

  it("fails closed with the wrong circle key", async () => {
    const env = await seal(await importCircleKey(newCircleKeyHex()), { amount_inr: 5000 })
    await expect(open(await importCircleKey(newCircleKeyHex()), env)).rejects.toMatchObject({ code: "decrypt_failed" })
  })

  it("fails closed on tampered ciphertext", async () => {
    const key = await importCircleKey(newCircleKeyHex())
    const env = await seal(key, { amount_inr: 5000 })
    env[40] = env[40]! ^ 0x01
    await expect(open(key, env)).rejects.toMatchObject({ code: "decrypt_failed" })
  })

  it("rejects a malformed key string", async () => {
    await expect(importCircleKey("not-a-key")).rejects.toBeInstanceOf(PayloadError)
  })
})
