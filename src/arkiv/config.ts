import { tiramisu } from "@arkiv-network/sdk/chains"

/** Namespace on every Turn entity. Not authentication — trust comes from creator checks. */
export const PROJECT = "turn_arkiv_v1"

export const CHAIN = tiramisu
export const RPC_HTTP = tiramisu.rpcUrls.default.http[0]
export const RPC_WS = tiramisu.rpcUrls.default.webSocket[0]
export const EXPLORER = "https://tiramisu.explorer.arkiv.network"

/** SDK nominal block time (2 s). Used only to place wall-clock dates against blocks. */
export const BLOCK_MS = 2_000

export const explorerEntityUrl = (key: string) => `${EXPLORER}/entity/${key}`
export const explorerTxUrl = (hash: string) => `${EXPLORER}/tx/${hash}`

export const ENTITY_TYPES = [
  "circle",
  "invite",
  "member",
  "roster",
  "pay_claim",
  "pay_ack",
  "bid_commit",
  "bid_close",
  "bid_reveal",
  "round_result",
  "dispute",
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export const isEntityType = (v: unknown): v is EntityType =>
  typeof v === "string" && (ENTITY_TYPES as readonly string[]).includes(v)

/** Created by the organiser only (trusted by the invite's organiser address, not the roster). */
export const ORGANISER_TYPES: readonly EntityType[] = ["circle", "invite", "roster", "bid_close", "round_result"]

/**
 * Records that live as long as the circle. Created `readonly` + `permissionlessExtension`, so any
 * member (not only the organiser) can renew the lease. `invite` dies after 48 h and `bid_commit`
 * after its reveal window; neither is part of the lease.
 */
export const LEASE_TYPES: readonly EntityType[] = ENTITY_TYPES.filter((t) => t !== "invite" && t !== "bid_commit")
export const isLeaseType = (t: EntityType) => LEASE_TYPES.includes(t)

/** `bid_commit` carries no payload; every other record is AES-GCM ciphertext. */
export const EMPTY_CONTENT_TYPE = "application/octet-stream"
