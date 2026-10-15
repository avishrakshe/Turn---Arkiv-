import { createSecp256k1SigningSession } from "@category-labs/mera"
import { toViemAccount } from "@category-labs/mera/viem"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { describe, expect, it } from "vitest"
import { parseTransaction, recoverMessageAddress, recoverTransactionAddress, hexToBytes, type TransactionSerializable } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

// Phase 1 check: a mera-derived account signs Tiramisu (chain 7738577) EIP-1559 transactions
// exactly like viem's own local account, so the Arkiv SDK can use it as `account`.
describe("mera account on Tiramisu", () => {
  const pk = generatePrivateKey()
  const viemAccount = privateKeyToAccount(pk)
  const meraAccount = toViemAccount(createSecp256k1SigningSession({ privateKey: hexToBytes(pk) }))

  const tx: TransactionSerializable = {
    type: "eip1559",
    chainId: tiramisu.id,
    nonce: 3,
    to: "0x4400000000000000000000000000000000000044",
    data: "0x1234",
    gas: 250_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1n,
    value: 0n,
  }

  it("derives the same address", () => {
    expect(meraAccount.address).toBe(viemAccount.address)
  })

  it("produces byte-identical signed transactions (RFC 6979 deterministic)", async () => {
    const a = await meraAccount.signTransaction(tx)
    const b = await viemAccount.signTransaction(tx)
    expect(a).toBe(b)
    expect(parseTransaction(a).chainId).toBe(7738577)
    expect(await recoverTransactionAddress({ serializedTransaction: a as `0x02${string}` })).toBe(viemAccount.address)
  })

  it("produces deterministic EIP-191 signatures (needed for device-independent bid salts)", async () => {
    const m = "turn-arkiv bid salt v1|circle|1"
    const s1 = await meraAccount.signMessage({ message: m })
    const s2 = await meraAccount.signMessage({ message: m })
    expect(s1).toBe(s2)
    expect(s1).toBe(await viemAccount.signMessage({ message: m }))
    expect(await recoverMessageAddress({ message: m, signature: s1 })).toBe(viemAccount.address)
  })
})
