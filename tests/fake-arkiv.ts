/**
 * Minimal in-memory stand-in for the Arkiv public client's `select()` builder, evaluating the real
 * SDK expression trees. Lets tests prove which entities a creator-scoped query actually returns.
 */
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { toValue, type Attributes } from "@arkiv-network/sdk/attr"
import type { Expression } from "@arkiv-network/sdk/query"
import { keccak256, toHex } from "viem"
import type { RawEntity } from "../src/arkiv/records"
import type { loadCircle } from "../src/arkiv/circle"
import type { Address, Hex } from "../src/core/bodies"

export class FakeArkiv {
  entities: RawEntity[] = []
  head = 1000n
  queries: string[] = []

  add(params: CreateEntityParameters, creator: Address, overrides: Partial<RawEntity> = {}): RawEntity {
    this.head += 1n
    const attributes: Record<string, ReturnType<typeof toValue>> = {}
    for (const [k, v] of Object.entries(params.attributes ?? {})) attributes[k] = toValue(v, k)
    const e: RawEntity = {
      key: keccak256(toHex(`${creator}:${this.entities.length}:${Math.random()}`)) as Hex,
      creator,
      createdAt: this.head,
      expiresAt: this.head + 100_000n,
      creationFlags: { readonly: !!params.flags?.readonly, permissionlessExtension: !!params.flags?.permissionlessExtension },
      contentType: params.contentType,
      payload: params.payload,
      attributes: attributes as Attributes,
      ...overrides,
    }
    this.entities.push(e)
    return e
  }

  async getBlockNumber(_?: unknown) { return this.head }

  /** Typed as the slice of the SDK public client that loadCircle/fetchAll use. */
  get reader(): Parameters<typeof loadCircle>[0] {
    return this as unknown as Parameters<typeof loadCircle>[0]
  }

  select(_sel?: unknown) {
    const filters: Expression[] = []
    let created: Address | undefined
    let limit = 200
    const self = this
    const builder = {
      where(...ex: (Expression | readonly Expression[])[]) { filters.push(...ex.flat()); return builder },
      createdBy(a: Address) { created = a; return builder },
      atBlock(_b: bigint) { return builder },
      limit(n: number) { limit = n; return builder },
      async fetch() {
        self.queries.push(filters.map(String).join(" AND ") + (created ? ` AND $creator=${created}` : ""))
        const rows = self.entities.filter((e) => filters.every((f) => evaluate(f, e)) && (!created || e.creator.toLowerCase() === created.toLowerCase()))
        return { entities: rows.slice(0, limit), blockNumber: self.head, cursor: undefined, hasNextPage: () => false, next: async () => { throw new Error("no more") } }
      },
    }
    return builder
  }
}

function evaluate(ex: Expression, e: RawEntity): boolean {
  switch (ex.kind) {
    case "and": return ex.expressions.every((x) => evaluate(x, e))
    case "or": return ex.expressions.some((x) => evaluate(x, e))
    case "not": return !evaluate(ex.expression, e)
    case "comparison": {
      if (ex.operator !== "=") throw new Error("fake supports = only")
      if (ex.name === "$creator") return e.creator.toLowerCase() === String(ex.value.value).toLowerCase()
      if (ex.name === "$key") return e.key.toLowerCase() === String(ex.value.value).toLowerCase()
      const a = e.attributes[ex.name]
      return !!a && a.type === ex.value.type && String(a.value).toLowerCase() === String(ex.value.value).toLowerCase()
    }
    default: throw new Error(`fake: unsupported ${ex.kind}`)
  }
}
