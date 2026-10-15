/**
 * Creates a dedicated development EOA for the drip endpoint / seed script and appends it to
 * .env.local (git-ignored). Prints ONLY the address. Refuses to overwrite an existing key.
 *
 *   npx tsx scripts/new-dev-key.ts DRIP_PRIVATE_KEY
 */
import { existsSync, readFileSync, appendFileSync } from "node:fs"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const name = process.argv[2] ?? "DRIP_PRIVATE_KEY"
if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("env var name must be UPPER_SNAKE")
const file = ".env.local"
const current = existsSync(file) ? readFileSync(file, "utf8") : ""
const existing = new RegExp(`^${name}=(0x[0-9a-fA-F]{64})\\s*$`, "m").exec(current)
if (existing?.[1]) {
  console.log(`${name} already set; address ${privateKeyToAccount(existing[1] as `0x${string}`).address}`)
} else {
  const key = generatePrivateKey()
  appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}${name}=${key}\n`)
  console.log(`${name} written to ${file}; address ${privateKeyToAccount(key).address}`)
}
