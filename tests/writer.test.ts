import { ENTITY_EVENTS_ABI, EntityMutationError, ExpirationTime } from "@arkiv-network/sdk"
import { describe, expect, it, vi } from "vitest"
import { encodeAbiParameters, encodeEventTopics, type Hash } from "viem"
import { ArkivWriter, buildCreate, NeedsGasError, newOpId } from "../src/arkiv/writer"
import { importCircleKey, newCircleKeyHex } from "../src/arkiv/payload"
import type { Hex } from "../src/core/bodies"
import { FakeArkiv } from "./fake-arkiv"
import { newAddress } from "./fixtures"

const me = newAddress()
const TX = ("0x" + "ab".repeat(32)) as Hash
const KEY = ("0x" + "cd".repeat(32)) as Hex

function createdLog(entityKey: Hex) {
  return {
    address: "0x4400000000000000000000000000000000000044",
    topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: "EntityCreated", args: { entityKey, owner: me } }),
    data: encodeAbiParameters([{ type: "uint64" }, { type: "uint8" }], [5000n, 1]),
  }
}

async function intent() {
  return { type: "pay_claim" as const, circleId: newOpId(), round: 1, body: { amount_inr: 5000, method: "UPI" as const, note: "" }, expires: ExpirationTime.fromDays(30) }
}

// biome-ignore lint: test double
function make(chain: FakeArkiv, wallet: { createEntity: (p: any) => Promise<unknown> }, receipt?: unknown) {
  const reader = {
    select: chain.select.bind(chain),
    getBalance: vi.fn(async () => 10n ** 18n),
    getTransactionReceipt: vi.fn(async () => { if (!receipt) throw new Error("not found"); return receipt }),
  }
  return { reader, writer: new ArkivWriter(wallet as never, reader as never, me, { reconcileAttempts: 2, reconcileDelayMs: 1 }) }
}

describe("ArkivWriter", () => {
  it("returns the key on a clean create", async () => {
    const chain = new FakeArkiv()
    const wallet = { createEntity: vi.fn(async () => ({ entityKey: KEY, txHash: TX, expiresAt: 9n })) }
    const { writer } = make(chain, wallet, { status: "success", blockNumber: 77n, logs: [] })
    const key = await importCircleKey(newCircleKeyHex())
    const out = await writer.create(await intent(), key)
    expect(out).toMatchObject({ status: "confirmed", entityKey: KEY, block: 77n, reconciled: false })
  })

  it("receipt decoding failed after success → recovers the key from the receipt, never resends", async () => {
    const chain = new FakeArkiv()
    const wallet = { createEntity: vi.fn(async () => { throw new EntityMutationError("succeeded — do not retry", { txHash: TX }) }) }
    const { writer } = make(chain, wallet, { status: "success", blockNumber: 80n, logs: [createdLog(KEY)] })
    const out = await writer.create(await intent(), await importCircleKey(newCircleKeyHex()))
    expect(out).toMatchObject({ status: "confirmed", entityKey: KEY, reconciled: true })
    expect(wallet.createEntity).toHaveBeenCalledTimes(1)
  })

  it("lost response without a hash → finds the entity by op_id", async () => {
    const chain = new FakeArkiv()
    const wallet = {
      createEntity: vi.fn(async (params: Parameters<FakeArkiv["add"]>[0]) => {
        chain.add(params, me) // it actually landed...
        throw new EntityMutationError("Transaction failed: Execution error without revert data") // ...but we never heard back
      }),
    }
    const { writer } = make(chain, wallet)
    const out = await writer.create(await intent(), await importCircleKey(newCircleKeyHex()))
    expect(out.status).toBe("confirmed")
    expect(wallet.createEntity).toHaveBeenCalledTimes(1)
  })

  it("nothing found → unconfirmed; a retry with the same op_id checks first and does not duplicate", async () => {
    const chain = new FakeArkiv()
    let landLater: (() => void) | undefined
    const wallet = {
      createEntity: vi.fn(async (params: Parameters<FakeArkiv["add"]>[0]) => {
        landLater = () => chain.add(params, me)
        throw new EntityMutationError("timeout")
      }),
    }
    const { writer } = make(chain, wallet)
    const i = await intent()
    const key = await importCircleKey(newCircleKeyHex())
    const first = await writer.create(i, key)
    expect(first.status).toBe("unconfirmed")
    landLater!() // the original transaction is mined late
    const retry = await writer.create({ ...i, opId: first.opId }, key)
    expect(retry).toMatchObject({ status: "confirmed", reconciled: true })
    expect(wallet.createEntity).toHaveBeenCalledTimes(1)
  })

  it("reverted receipt → failed (safe to retry)", async () => {
    const chain = new FakeArkiv()
    const wallet = { createEntity: vi.fn(async () => { throw new EntityMutationError("reverted", { txHash: TX }) }) }
    const { writer } = make(chain, wallet, { status: "reverted", blockNumber: 81n, logs: [] })
    expect(await writer.create(await intent(), await importCircleKey(newCircleKeyHex()))).toMatchObject({ status: "failed", reason: "reverted" })
  })

  it("refuses to write with zero balance", async () => {
    const chain = new FakeArkiv()
    const wallet = { createEntity: vi.fn() }
    const { writer, reader } = make(chain, wallet)
    reader.getBalance.mockResolvedValueOnce(0n)
    await expect(writer.create(await intent(), await importCircleKey(newCircleKeyHex()))).rejects.toBeInstanceOf(NeedsGasError)
    expect(wallet.createEntity).not.toHaveBeenCalled()
  })

  it("serializes writes from one account", async () => {
    const chain = new FakeArkiv()
    let active = 0, maxActive = 0
    const wallet = { createEntity: vi.fn(async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 5)); active--; return { entityKey: KEY, txHash: TX, expiresAt: 1n } }) }
    const { writer } = make(chain, wallet, { status: "success", blockNumber: 1n, logs: [] })
    const key = await importCircleKey(newCircleKeyHex())
    await Promise.all([writer.create(await intent(), key), writer.create(await intent(), key), writer.create(await intent(), key)])
    expect(maxActive).toBe(1)
  })

  it("never puts plaintext in attributes", async () => {
    const params = await buildCreate({ ...(await intent()), body: { amount_inr: 7777, method: "UPI", note: "meera@example" } }, me, await importCircleKey(newCircleKeyHex()), newOpId())
    const flat = JSON.stringify(params.attributes, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    expect(flat).not.toContain("7777")
    expect(flat).not.toContain("meera")
    expect(params.flags).toEqual({ readonly: true, permissionlessExtension: false })
    expect(Object.keys(params.attributes ?? {}).every((n) => /^[a-z][a-z0-9_]*$/.test(n))).toBe(true)
  })
})
