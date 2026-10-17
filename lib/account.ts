/**
 * This phone's account: a random EOA, the creator of everything this member writes.
 *
 * The private key is stored in IndexedDB encrypted with an AES-GCM key that is itself stored as a
 * NON-extractable CryptoKey, so copying the database files does not reveal it. It is not
 * protection against malicious script on this origin (stated in the README). A backup file lets
 * the member move to a new phone; without one, clearing site data loses the account.
 */
"use client"
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from "viem/accounts"
import { kvDel, kvGet, kvSet } from "./kv"

type Stored = { v: 1; address: `0x${string}`; iv: Uint8Array; sealed: ArrayBuffer; wrap: CryptoKey; backedUp: boolean }

const KEY = "account"
let cached: PrivateKeyAccount | null = null

async function seal(pk: `0x${string}`, backedUp: boolean): Promise<Stored> {
  const wrap = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap, new TextEncoder().encode(pk))
  return { v: 1, address: privateKeyToAccount(pk).address, iv, sealed, wrap, backedUp }
}

export async function loadAccount(): Promise<PrivateKeyAccount | null> {
  if (cached) return cached
  const s = await kvGet<Stored>(KEY)
  if (!s) return null
  const pk = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: s.iv as Uint8Array<ArrayBuffer> }, s.wrap, s.sealed)) as `0x${string}`
  cached = privateKeyToAccount(pk)
  return cached
}

export async function accountInfo(): Promise<{ address: `0x${string}`; backedUp: boolean } | null> {
  const s = await kvGet<Stored>(KEY)
  return s ? { address: s.address, backedUp: s.backedUp } : null
}

export async function createAccount(): Promise<PrivateKeyAccount> {
  const existing = await loadAccount()
  if (existing) return existing
  const pk = generatePrivateKey()
  await kvSet(KEY, await seal(pk, false))
  cached = privateKeyToAccount(pk)
  return cached
}

/** The backup file's contents. Shown only after the member asks for it. */
export async function exportBackup(): Promise<string> {
  const s = await kvGet<Stored>(KEY)
  if (!s) throw new Error("no account")
  const pk = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: s.iv as Uint8Array<ArrayBuffer> }, s.wrap, s.sealed))
  await kvSet(KEY, { ...s, backedUp: true })
  const circles = (await kvGet<unknown[]>("circles")) ?? []
  return JSON.stringify({ v: 1, app: "turn-arkiv", network: "tiramisu", address: s.address, key: pk, circles }, null, 2)
}

export async function importBackup(text: string): Promise<`0x${string}`> {
  const o = JSON.parse(text) as { v?: number; app?: string; key?: string; circles?: unknown }
  if (o.v !== 1 || o.app !== "turn-arkiv" || typeof o.key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(o.key)) throw new Error("not a Turn backup")
  const pk = o.key as `0x${string}`
  await kvSet(KEY, await seal(pk, true))
  if (Array.isArray(o.circles)) await kvSet("circles", o.circles)
  cached = privateKeyToAccount(pk)
  return cached.address
}

export async function forgetAccount() {
  cached = null
  await kvDel(KEY)
}
