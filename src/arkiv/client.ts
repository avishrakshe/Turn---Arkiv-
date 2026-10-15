import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { http, webSocket, type LocalAccount } from "viem"
import { CHAIN, RPC_HTTP, RPC_WS } from "./config"

const fetchOptions = { cache: "no-store", redirect: "error" } as const

export function publicClient(rpcUrl: string = RPC_HTTP) {
  return createPublicClient({ chain: CHAIN, cacheTime: 0, transport: http(rpcUrl, { retryCount: 1, timeout: 15_000, fetchOptions }) })
}

/** WebSocket client for live events only (reads stay on HTTP with pinned blocks). */
export function eventsClient(wsUrl: string = RPC_WS) {
  return createPublicClient({ chain: CHAIN, transport: webSocket(wsUrl, { retryCount: 3 }) })
}

export function walletClient(account: LocalAccount, rpcUrl: string = RPC_HTTP) {
  // retryCount 0: transport retries must never turn into a second transaction.
  return createWalletClient({ account, chain: CHAIN, cacheTime: 0, transport: http(rpcUrl, { retryCount: 0, timeout: 30_000, fetchOptions }) })
}

export type PublicClient = ReturnType<typeof publicClient>
export type WalletClient = ReturnType<typeof walletClient>
