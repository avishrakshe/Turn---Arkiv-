/**
 * Complete, consistent reads: one pinned block per walk, every page, bounded restarts.
 */
import type { PublicArkivClient } from "@arkiv-network/sdk"
import { addr } from "@arkiv-network/sdk/attr"
import { eq, or, QueryError, type Expression } from "@arkiv-network/sdk/query"
import type { RawEntity } from "./records"
import type { Address } from "../core/bodies"

type Reader = Pick<PublicArkivClient, "select" | "getBlockNumber">

export const SELECT = {
  key: true, creator: true, createdAt: true, expiresAt: true, creationFlags: true,
  contentType: true, payload: true, attributes: true,
} as const

export type ReadOptions = {
  /** Creator scope. An empty list means nobody is trusted → no query, no results. */
  creators?: readonly Address[]
  atBlock?: bigint
  maxPages?: number
  pageSize?: number
}

export function creatorScope(creators: readonly Address[]): Expression {
  return or(creators.map((c) => eq("$creator", addr(c))))
}

export async function fetchAll(client: Reader, predicates: Expression[], opts: ReadOptions = {}): Promise<{ block: bigint; entities: RawEntity[] }> {
  const { creators, maxPages = 25, pageSize = 200 } = opts
  if (creators && creators.length === 0) {
    return { block: opts.atBlock ?? (await client.getBlockNumber({ cacheTime: 0 })), entities: [] }
  }
  const where = creators ? [...predicates, creatorScope(creators)] : predicates
  let requests = 0
  for (let attempt = 0; ; attempt++) {
    const block = opts.atBlock ?? (await client.getBlockNumber({ cacheTime: 0 }))
    try {
      if (++requests > maxPages) throw new Error("page budget exhausted")
      let page = await client.select(SELECT).where(where).atBlock(block).limit(pageSize).fetch()
      if (page.blockNumber !== block) throw new Error("snapshot mismatch")
      const entities: RawEntity[] = [...page.entities]
      while (page.hasNextPage()) {
        if (++requests > maxPages) throw new Error("page budget exhausted")
        page = await page.next()
        if (page.blockNumber !== block) throw new Error("snapshot mismatch")
        entities.push(...page.entities)
      }
      return { block, entities }
    } catch (error) {
      // Only an expired/mismatched cursor restarts, once, discarding partial rows.
      if (!(error instanceof QueryError && error.kind === "cursor") || attempt >= 1 || opts.atBlock !== undefined) throw error
    }
  }
}
