/**
 * Payload framing, padding and encryption.
 *
 *   plaintext JSON → [u32 length | UTF-8 JSON | zero padding to bucket] → arkiv-encryption envelope
 *
 * Padding to fixed buckets means ciphertext length reveals only the bucket, not an amount's digit
 * count or a note's length.
 */
import { CONTENT_TYPE, decryptPayload, encryptPayload, generateKey, importKey } from "arkiv-encryption"

export const ENCRYPTED_CONTENT_TYPE = CONTENT_TYPE
export const BUCKETS = [256, 512, 1024, 2048, 4096] as const
const HEADER = 4

export class PayloadError extends Error {
  constructor(readonly code: "too_large" | "bad_frame" | "decrypt_failed" | "bad_json") {
    super(`payload: ${code}`)
    this.name = "PayloadError"
  }
}

export function bucketFor(bytes: number): number {
  const need = bytes + HEADER
  const bucket = BUCKETS.find((b) => b >= need)
  if (bucket === undefined) throw new PayloadError("too_large")
  return bucket
}

export function frame(value: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(value))
  const out = new Uint8Array(bucketFor(json.length))
  new DataView(out.buffer).setUint32(0, json.length)
  out.set(json, HEADER)
  return out
}

export function unframe(bytes: Uint8Array): unknown {
  if (!(BUCKETS as readonly number[]).includes(bytes.length)) throw new PayloadError("bad_frame")
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  if (len > bytes.length - HEADER) throw new PayloadError("bad_frame")
  for (let i = HEADER + len; i < bytes.length; i++) if (bytes[i] !== 0) throw new PayloadError("bad_frame")
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(HEADER, HEADER + len)))
  } catch {
    // Never attach the parse error: its message can quote decrypted plaintext.
    throw new PayloadError("bad_json")
  }
}

export async function seal(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  return encryptPayload(key, frame(value))
}

export async function open(key: CryptoKey, envelope: Uint8Array): Promise<unknown> {
  let bytes: Uint8Array
  try {
    bytes = await decryptPayload(key, envelope)
  } catch {
    throw new PayloadError("decrypt_failed")
  }
  return unframe(bytes)
}

/** A circle key: 64 hex chars. Lives only in the invite fragment and local storage. */
export const newCircleKeyHex = (): string => generateKey()
export const isCircleKeyHex = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)
export async function importCircleKey(hex: string): Promise<CryptoKey> {
  if (!isCircleKeyHex(hex)) throw new PayloadError("decrypt_failed")
  return importKey(hex)
}
