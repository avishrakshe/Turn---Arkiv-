/**
 * POST /api/rpc — a narrow JSON-RPC pass-through to Tiramisu that adds Turn's Arkiv access key
 * (ARKIV_API_KEY, server env only). The app's browser client tries the public RPC first and only
 * falls back here when the anonymous budget refuses it (HTTP 429). /verify never uses this route.
 *
 * Only read methods and eth_sendRawTransaction (an already-signed member transaction; the proxy
 * cannot alter it) are forwarded. Per-IP limit is best effort per instance.
 */
import { RPC_HTTP } from "@/src/arkiv/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED = new Set([
  "arkiv_query", "arkiv_getBlockTiming", "arkiv_getEntityCount",
  "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_getTransactionCount", "eth_getTransactionReceipt",
  "eth_getBlockByNumber", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_estimateGas",
  "eth_sendRawTransaction", "eth_getTransactionByHash",
])
const MAX_BYTES = 600_000
const WINDOW_MS = 60_000
const PER_IP = 240
const hits = new Map<string, number[]>()

export async function POST(req: Request) {
  const key = process.env.ARKIV_API_KEY?.trim()
  if (!key) return Response.json({ error: "rpc_proxy_not_configured" }, { status: 503 })
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5_000) hits.clear()
  if (recent.length > PER_IP) return Response.json({ error: "rate_limited" }, { status: 429 })

  const text = await req.text()
  if (text.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(text) } catch { return Response.json({ error: "bad_json" }, { status: 400 }) }
  const calls = Array.isArray(body) ? body : [body]
  if (calls.length === 0 || calls.length > 20 || !calls.every((c) => typeof c === "object" && c !== null)) {
    return Response.json({ error: "bad_request" }, { status: 400 })
  }
  // A method outside the allowlist gets the standard JSON-RPC "method not found" (as a node would),
  // so clients fall back cleanly (e.g. viem tries eth_fillTransaction, then fills locally).
  const refused = (c: { id?: unknown }) => ({ jsonrpc: "2.0", id: c.id ?? null, error: { code: -32601, message: "method not available via Turn relay" } })
  if (!Array.isArray(body) && !ALLOWED.has((body as { method?: string }).method ?? "")) return Response.json(refused(body as { id?: unknown }))
  if (Array.isArray(body) && !calls.every((c) => ALLOWED.has((c as { method?: string }).method ?? ""))) {
    return Response.json(calls.map((c) => refused(c as { id?: unknown })))
  }
  const upstream = await fetch(process.env.ARKIV_RPC_URL || RPC_HTTP, {
    method: "POST", headers: { "content-type": "application/json", "X-API-KEY": key }, body: text, cache: "no-store", redirect: "error",
  })
  return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "no-store" } })
}
