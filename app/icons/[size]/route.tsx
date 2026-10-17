/**
 * PNG app icons for installation (the Turn ring: six seats, one lit), rendered at build time.
 * /icons/192, /icons/512, and /icons/maskable (512 with safe-zone padding).
 */
import { ImageResponse } from "next/og"

export const dynamic = "force-static"
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable" }]
}

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params
  const px = size === "192" ? 192 : 512
  const pad = size === "maskable" ? 0.2 : 0.12
  const c = px / 2
  const r = px * (0.5 - pad) * 0.78
  const seat = px * 0.085
  const lit = px * 0.135
  const seats = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 90) * Math.PI) / 180
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a), on: i === 1 }
  })
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", background: "#0e0d0c", position: "relative", borderRadius: size === "maskable" ? 0 : px * 0.22 }}>
        <div style={{ position: "absolute", left: c - r, top: c - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `${Math.max(2, px * 0.012)}px solid rgba(244,163,64,0.45)` }} />
        {seats.map((p, i) => {
          const d = p.on ? lit : seat
          return <div key={i} style={{ position: "absolute", left: p.x - d, top: p.y - d, width: d * 2, height: d * 2, borderRadius: "50%", background: p.on ? "#f4a340" : "#e8562a", border: p.on ? `${px * 0.02}px solid #0e0d0c` : "none" }} />
        })}
      </div>
    ),
    { width: px, height: px },
  )
}
