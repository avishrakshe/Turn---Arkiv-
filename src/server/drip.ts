/**
 * Server-only GLM drip. Sends a small amount of test GLM from a funded dev EOA to a new member
 * address so the member can create their own entities (creator = provenance).
 *
 * Never import this from browser code: it reads DRIP_PRIVATE_KEY.
 */
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { createWalletClient, getAddress, http, isAddress, parseEther, type Address, type Hash } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export type DripConfig = {
  privateKey: `0x${string}`
  /** GLM sent per drip, as a decimal string (e.g. "0.05"). */
  amountGlm: string
  /** Refuse if the recipient already holds at least this much GLM. */
  maxRecipientBalanceGlm: string
  rpcUrl?: string
}

export type DripResult =
  | { status: "sent"; txHash: Hash; amountWei: string }
  | { status: "refused"; reason: "invalid_address" | "already_funded" | "already_used" | "self" | "drip_empty" }
  | { status: "uncertain"; txHash?: Hash; reason: string }

export function parseDripConfig(env: Record<string, string | undefined>): DripConfig {
  const key = env.DRIP_PRIVATE_KEY
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("DRIP_PRIVATE_KEY missing or malformed")
  return {
    privateKey: key as `0x${string}`,
    amountGlm: env.DRIP_AMOUNT_GLM ?? "0.02",
    maxRecipientBalanceGlm: env.DRIP_MAX_RECIPIENT_BALANCE_GLM ?? "0.005",
    rpcUrl: env.ARKIV_RPC_URL,
  }
}

export function dripAddress(config: DripConfig): Address {
  return privateKeyToAccount(config.privateKey).address
}

export async function drip(config: DripConfig, recipient: string): Promise<DripResult> {
  if (!isAddress(recipient, { strict: false })) return { status: "refused", reason: "invalid_address" }
  const to = getAddress(recipient)
  const account = privateKeyToAccount(config.privateKey)
  if (to === account.address) return { status: "refused", reason: "self" }

  const rpcUrl = config.rpcUrl ?? tiramisu.rpcUrls.default.http[0]
  const transport = http(rpcUrl, { retryCount: 0, timeout: 15_000, fetchOptions: { cache: "no-store", redirect: "error" } })
  const reader = createPublicClient({ chain: tiramisu, cacheTime: 0, transport })
  if (await reader.getChainId() !== tiramisu.id) throw new Error("Wrong chain")

  // One drip per address: a recipient that already has GLM, or has ever sent a transaction, is refused.
  const [balance, sent] = await Promise.all([
    reader.getBalance({ address: to }),
    reader.getTransactionCount({ address: to }),
  ])
  if (balance >= parseEther(config.maxRecipientBalanceGlm)) return { status: "refused", reason: "already_funded" }
  if (sent > 0) return { status: "refused", reason: "already_used" }

  const value = parseEther(config.amountGlm)
  const own = await reader.getBalance({ address: account.address })
  if (own < value * 2n) return { status: "refused", reason: "drip_empty" }

  const wallet = createWalletClient({ account, chain: tiramisu, transport })
  let txHash: Hash | undefined
  try {
    txHash = await wallet.sendTransaction({ to, value, account, chain: tiramisu })
  } catch (error) {
    // Unknown whether the provider accepted it. Never resend automatically.
    return { status: "uncertain", reason: error instanceof Error ? error.name : "send_failed" }
  }
  try {
    const receipt = await reader.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 })
    if (receipt.status !== "success") return { status: "uncertain", txHash, reason: "receipt_not_success" }
  } catch {
    return { status: "uncertain", txHash, reason: "receipt_timeout" }
  }
  return { status: "sent", txHash, amountWei: value.toString() }
}
