/**
 * Round calendar. Dates are shown from the circle rules; on-chain checks use block numbers,
 * placed against the circle entity's own (block, created_at) anchor at the SDK's nominal 2 s/block.
 */
import { BLOCK_MS } from "../arkiv/config"
import type { CircleBody, Frequency } from "./bodies"

const DAY = 86_400_000
export const PERIOD_MS: Record<Frequency, number> = { monthly: 30 * DAY, weekly: 7 * DAY, demo: 10 * 60_000 }

export const periodMs = (c: Pick<CircleBody, "frequency">) => PERIOD_MS[c.frequency]

/** Payment window after a round opens. Demo circles use half a period. */
export const dueWindowMs = (c: Pick<CircleBody, "frequency" | "due_days">) =>
  c.frequency === "demo" ? PERIOD_MS.demo / 2 : c.due_days * DAY

export const roundOpensMs = (c: CircleBody, round: number) => c.start_ms + (round - 1) * periodMs(c)
export const roundDueMs = (c: CircleBody, round: number) => roundOpensMs(c, round) + dueWindowMs(c)

export type Anchor = { block: bigint; ms: number }

/** The block at (or after) a wall-clock instant, relative to the anchor. */
export function blockAt(anchor: Anchor, ms: number): bigint {
  const delta = ms - anchor.ms
  return anchor.block + BigInt(Math.ceil(delta / BLOCK_MS))
}

/** Approximate wall-clock time of a block, relative to the anchor. */
export function msAt(anchor: Anchor, block: bigint): number {
  return anchor.ms + Number(block - anchor.block) * BLOCK_MS
}

/** A payment claim is on time if it was created at or before the round's due block. */
export const isOnTime = (c: CircleBody, anchor: Anchor, round: number, claimBlock: bigint) =>
  claimBlock <= blockAt(anchor, roundDueMs(c, round))
