/**
 * Entity Expiration per type and the circle's lease.
 *
 *   invite      48 hours: an old WhatsApp link stops working by itself.
 *   bid_commit  until the round's reveal window ends, plus one day.
 *   everything else lives with the circle: until the scheduled end of the last round + 30 days.
 *
 * The lease moves with the committee. Closing a round re-bases "scheduled end" on the real pace
 * (late committees are the norm), and any member can press "Keep our record alive" to push every
 * record further. All targets are absolute blocks so one batch can set the same deadline everywhere.
 */
import { BLOCK_MS } from "../arkiv/config"
import type { CircleBody } from "./bodies"
import { periodMs } from "./schedule"

export const DAY_MS = 86_400_000
export const GRACE_MS = 30 * DAY_MS
export const KEEP_ALIVE_MS = 90 * DAY_MS
export const INVITE_MS = 2 * DAY_MS

const blocksFor = (ms: number) => BigInt(Math.ceil(Math.max(0, ms) / BLOCK_MS))

/** Scheduled end of the last round. */
export const circleEndMs = (c: Pick<CircleBody, "start_ms" | "members" | "frequency">) => c.start_ms + c.members * periodMs(c)

/** Lifetime of a new circle, in blocks from inclusion: rest of the schedule + 30 days. */
export function circleLifetimeBlocks(c: Pick<CircleBody, "start_ms" | "members" | "frequency">, nowMs: number): bigint {
  return blocksFor(Math.max(circleEndMs(c), nowMs) - nowMs + GRACE_MS)
}

/**
 * Lease target after `roundsClosed` rounds have closed at `nowMs`: the remaining rounds from now,
 * at the circle's period, + 30 days — never earlier than the original schedule.
 */
export function leaseTargetBlock(head: bigint, c: Pick<CircleBody, "start_ms" | "members" | "frequency">, roundsClosed: number, nowMs: number): bigint {
  const remaining = Math.max(0, c.members - roundsClosed) * periodMs(c)
  const end = Math.max(circleEndMs(c), nowMs + remaining)
  return head + blocksFor(end - nowMs + GRACE_MS)
}

/** "Keep our record alive": 90 more days beyond the latest current deadline (or from now). */
export function keepAliveTargetBlock(head: bigint, latestExpiresAt: bigint): bigint {
  const base = latestExpiresAt > head ? latestExpiresAt : head
  return base + blocksFor(KEEP_ALIVE_MS)
}

/** bid_commit: until the reveal window ends + 1 day, at least 2 days. */
export function bidCommitLifetimeBlocks(msUntilRevealEnd: number): bigint {
  return blocksFor(Math.max(2 * DAY_MS, Math.max(0, msUntilRevealEnd) + DAY_MS))
}

/**
 * Which records a lease extension to `target` must touch. The engine rejects an extension that
 * does not move the deadline later, and one rejection fails the whole batch, so records already at
 * or beyond the target are left out.
 */
export function extensionsTo<T extends { key: `0x${string}`; expiresAt: bigint }>(records: readonly T[], target: bigint): T[] {
  const seen = new Set<string>()
  return records.filter((r) => r.expiresAt < target && !seen.has(r.key) && (seen.add(r.key), true))
}

/** Approximate wall-clock date of a block, for display ("Record kept until 12 Dec 2026"). */
export function blockToDate(block: bigint, head: bigint, nowMs: number): Date {
  return new Date(nowMs + Number(block - head) * BLOCK_MS)
}
