/** Circles this phone knows: id, organiser and the circle key (never sent anywhere). */
"use client"
import { kvGet, kvSet } from "./kv"

export type SavedCircle = { circleId: string; organiser: `0x${string}`; keyHex: string; name: string; addedAt: number }

export async function listCircles(): Promise<SavedCircle[]> {
  return ((await kvGet<SavedCircle[]>("circles")) ?? []).sort((a, b) => b.addedAt - a.addedAt)
}

export async function getCircle(circleId: string): Promise<SavedCircle | undefined> {
  return (await listCircles()).find((c) => c.circleId === circleId)
}

export async function saveCircle(c: Omit<SavedCircle, "addedAt">): Promise<void> {
  const all = await listCircles()
  const prev = all.find((x) => x.circleId === c.circleId)
  const next = [{ ...c, addedAt: prev?.addedAt ?? Date.now() }, ...all.filter((x) => x.circleId !== c.circleId)]
  await kvSet("circles", next)
}

/** Everything after `#` stays in the browser: never sent to Vercel or to Arkiv. */
export function inviteLink(origin: string, c: Pick<SavedCircle, "circleId" | "organiser" | "keyHex">): string {
  return `${origin}/join#c=${c.circleId}&o=${c.organiser}&k=${c.keyHex}`
}

export function parseInvite(hash: string): Pick<SavedCircle, "circleId" | "organiser" | "keyHex"> | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""))
  const circleId = p.get("c") ?? ""
  const organiser = (p.get("o") ?? "").toLowerCase()
  const keyHex = (p.get("k") ?? "").toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(circleId) || !/^0x[0-9a-f]{40}$/.test(organiser) || !/^[0-9a-f]{64}$/.test(keyHex)) return null
  return { circleId, organiser: organiser as `0x${string}`, keyHex }
}
