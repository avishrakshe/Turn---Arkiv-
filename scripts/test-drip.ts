/**
 * Phase 1 live check: one drip from the funded dev EOA to a fresh throwaway address, then
 * read back the recipient balance. Spends ~0.001 GLM + 21,000 gas.
 *
 *   npx tsx --env-file=.env.local scripts/test-drip.ts
 */
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { formatEther, http } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { drip, dripAddress, parseDripConfig } from "../src/server/drip"

const config = { ...parseDripConfig(process.env), amountGlm: "0.001" }
const reader = createPublicClient({ chain: tiramisu, cacheTime: 0, transport: http() })
const from = dripAddress(config)
console.log("drip EOA", from, "balance", formatEther(await reader.getBalance({ address: from })), "GLM")

const recipient = privateKeyToAccount(generatePrivateKey()).address
console.log("recipient (throwaway)", recipient)
const result = await drip(config, recipient)
console.log(result)
console.log("recipient balance", formatEther(await reader.getBalance({ address: recipient })), "GLM")
const again = await drip(config, recipient)
console.log("second drip to same address →", again)
