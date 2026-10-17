/**
 * POST /api/drip { address } → a small amount of test GLM, once per new address, so the member's
 * own account can create their records (they stay the creator). The key is DRIP_PRIVATE_KEY,
 * a server-only env var. Best-effort per-instance rate limit; see README for the firewall rule.
 */
import { drip, parseDripConfig } from "@/src/server/drip"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WINDOW_MS = 10 * 60_000
const PER_IP = 5
const hits = new Map<string, number[]>()

function limited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5_000) hits.clear()
  return recent.length > PER_IP
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (limited(ip)) return Response.json({ status: "refused", reason: "rate_limited" }, { status: 429 })
  let address: unknown
  try {
    ({ address } = (await req.json()) as { address?: unknown })
  } catch {
    return Response.json({ status: "refused", reason: "invalid_address" }, { status: 400 })
  }
  if (typeof address !== "string") return Response.json({ status: "refused", reason: "invalid_address" }, { status: 400 })
  let config
  try {
    config = parseDripConfig(process.env)
  } catch {
    return Response.json({ status: "refused", reason: "drip_not_configured" }, { status: 503 })
  }
  try {
    const result = await drip(config, address)
    return Response.json(result, { status: result.status === "sent" ? 200 : result.status === "refused" ? 409 : 202 })
  } catch {
    return Response.json({ status: "uncertain", reason: "rpc_error" }, { status: 502 })
  }
}
