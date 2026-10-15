/**
 * Read-only Tiramisu probe. Never broadcasts: it reads chain metadata and runs guarded
 * eth_estimateGas dry runs for (a) a plain GLM value transfer and (b) a Turn-sized encrypted create.
 *
 *   npm run probe
 */
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { u64 } from "@arkiv-network/sdk/attr"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { custom, formatEther, http, MethodNotFoundRpcError, type LocalAccount } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const RPC = tiramisu.rpcUrls.default.http[0]

async function dryRunEstimate(account: LocalAccount, prepare: (w: ReturnType<typeof createWalletClient>) => Promise<unknown>) {
  const rpc = http(RPC, { retryCount: 0, timeout: 10_000, fetchOptions: { cache: "no-store", redirect: "error" } })({ chain: tiramisu })
  const reads = new Set(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getTransactionCount", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_estimateGas"])
  let gas: bigint | undefined
  const stop = new Error("dry-run: estimate captured")
  const transport = custom({
    async request(args) {
      if (args.method === "eth_sendRawTransaction" || args.method === "eth_sendTransaction") throw new Error("dry-run: broadcast blocked")
      if (args.method === "eth_fillTransaction") throw new MethodNotFoundRpcError(new Error("not in dry run"))
      if (!reads.has(args.method)) throw new Error(`dry-run: blocked ${args.method}`)
      const result = await rpc.request(args)
      if (args.method === "eth_estimateGas") {
        gas = BigInt(result as string)
        throw stop
      }
      return result
    },
  }, { retryCount: 0 })
  const wallet = createWalletClient({ account, chain: tiramisu, transport })
  try {
    await prepare(wallet)
  } catch (error) {
    let cause: unknown = error
    for (let d = 0; cause && d < 24; d++) {
      if (cause === stop && gas !== undefined) return gas
      cause = typeof cause === "object" ? (cause as { cause?: unknown }).cause : undefined
    }
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error)
    throw new Error(`estimate failed: ${msg}`)
  }
  throw new Error("estimate skipped")
}

async function main() {
  const client = createPublicClient({ chain: tiramisu, cacheTime: 0, transport: http(RPC, { retryCount: 0, timeout: 10_000 }) })
  const chainId = await client.getChainId()
  const head = await client.getBlockNumber({ cacheTime: 0 })
  const timing = await client.getBlockTiming()
  const gasPrice = await client.request({ method: "eth_gasPrice" } as never) as string
  const block = await client.getBlock({ blockNumber: head })
  console.log({ chainId, head: head.toString(), timing: { ...timing, currentBlock: timing.currentBlock.toString() },
    gasPriceWei: BigInt(gasPrice).toString(), baseFeePerGas: block.baseFeePerGas?.toString() })

  // Throwaway, unfunded account: nothing is signed with a real key and nothing is sent.
  const probe = privateKeyToAccount(generatePrivateKey())
  const other = privateKeyToAccount(generatePrivateKey())

  try {
    const g = await dryRunEstimate(probe, (w) => w.sendTransaction({ to: other.address, value: 0n, account: probe, chain: tiramisu }))
    console.log("value transfer estimate (gas units):", g.toString())
  } catch (e) { console.log("value transfer:", (e as Error).message) }

  // A Turn-sized create: 1,052-byte envelope (1,024-byte padded bucket + 28) and 6 attributes.
  const payload = new Uint8Array(1024 + 28)
  crypto.getRandomValues(payload)
  try {
    const g = await dryRunEstimate(probe, (w) => w.createEntity({
      payload, contentType: "application/vnd.arkiv.encrypted.v1",
      attributes: { project: "turn_probe", entity_type: "pay_claim", circle_id: "probe", round: u64(1), created_at: u64(Date.now()) },
      expires: ExpirationTime.fromDays(180), flags: { readonly: true },
    }))
    const price = BigInt(gasPrice)
    console.log("create estimate (gas units):", g.toString(), "≈ GLM at current gas price:", formatEther(g * price))
  } catch (e) { console.log("create:", (e as Error).message) }
}

main().catch((e) => { console.error(e); process.exit(1) })
