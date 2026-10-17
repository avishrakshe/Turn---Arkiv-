import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { fallback, http, webSocket, type LocalAccount, type Transport } from "viem"
import { CHAIN, RPC_HTTP, RPC_WS } from "./config"

const fetchOptions = { cache: "no-store", redirect: "error" } as const

export type ClientOptions = {
  rpcUrl?: string
  /** Arkiv access key, sent as X-API-KEY. Server/scripts only — never in a browser bundle. */
  apiKey?: string
  /** Browser only: a same-origin proxy (/api/rpc) tried when the direct RPC refuses (e.g. 429). */
  fallbackUrl?: string
}

/**
 * retryCount 0 everywhere: viem honours Retry-After on HTTP 429, and the anonymous Tiramisu budget
 * answers `retry-after: ~1800`, which turns a refused read into a half-hour silent wait. We fail
 * fast and let the caller (or the fallback transport) decide.
 */
function transport(o: ClientOptions, timeout: number): Transport {
  const headers = o.apiKey ? { "X-API-KEY": o.apiKey } : undefined
  const direct = http(o.rpcUrl ?? RPC_HTTP, { retryCount: 0, timeout, fetchOptions: { ...fetchOptions, ...(headers && { headers }) } })
  if (!o.fallbackUrl) return direct
  return fallback([direct, http(o.fallbackUrl, { retryCount: 0, timeout, fetchOptions })], { retryCount: 0 })
}

export function publicClient(o: ClientOptions = {}) {
  return createPublicClient({ chain: CHAIN, cacheTime: 0, transport: transport(o, 15_000) })
}

/** WebSocket client for live events only (reads stay on HTTP with pinned blocks). */
export function eventsClient(wsUrl: string = RPC_WS) {
  return createPublicClient({ chain: CHAIN, transport: webSocket(wsUrl, { retryCount: 3 }) })
}

export function walletClient(account: LocalAccount, o: ClientOptions = {}) {
  // Never retried by the transport: a retry must never turn into a second transaction. (A fallback
  // only re-sends the SAME signed transaction, so at worst the node sees one hash twice.)
  return createWalletClient({ account, chain: CHAIN, cacheTime: 0, transport: transport(o, 30_000) })
}

/** Scripts/server: use ARKIV_API_KEY when present. */
export const serverOptions = (env: Record<string, string | undefined> = process.env): ClientOptions =>
  ({ ...(env.ARKIV_API_KEY && { apiKey: env.ARKIV_API_KEY }), ...(env.ARKIV_RPC_URL && { rpcUrl: env.ARKIV_RPC_URL }) })

export type PublicClient = ReturnType<typeof publicClient>
export type WalletClient = ReturnType<typeof walletClient>

/** True if this error (anywhere in its cause chain) is an HTTP 429 from the RPC. */
export function isRateLimited(error: unknown): boolean {
  let e: unknown = error
  for (let i = 0; i < 12 && e && typeof e === "object"; i++) {
    if ((e as { status?: number }).status === 429) return true
    const m = (e as { message?: unknown }).message
    if (typeof m === "string" && /ANON_COST_LIMITED|Status: 429/.test(m)) return true
    e = (e as { cause?: unknown }).cause
  }
  return false
}
