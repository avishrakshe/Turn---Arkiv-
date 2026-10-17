"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button, Card, Shell, Loading } from "@/components/ui"
import { useApp } from "@/components/providers"
import { TurnRing } from "@/components/ring/TurnRing"
import { listCircles, type SavedCircle } from "@/lib/circles"
import { useT } from "@/lib/i18n"

export default function Home() {
  const { t } = useT()
  const { account, ready, start } = useApp()
  const [circles, setCircles] = useState<SavedCircle[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (account) listCircles().then(setCircles) }, [account])

  if (!ready) return <Shell><Loading text={t("loading")} /></Shell>

  if (!account) {
    return (
      <Shell>
        <div className="mx-auto mt-2 w-56">
          <TurnRing step={1} members={["Meera S.", "Ravi K.", "Priya N.", "Arjun P.", "Sana M."].map((name) => ({ name }))} />
        </div>
        <h1 className="text-[2.1rem]">{t("tagline")}</h1>
        <p className="text-ink-muted">{t("intro")}</p>
        <Button busy={busy} onClick={async () => { setBusy(true); try { await start() } finally { setBusy(false) } }}>{t("start")}</Button>
        <p className="text-center text-xs text-ink-muted">{t("startHint")}</p>
        <Link href="/verify" className="text-center text-sm text-teal-ink underline underline-offset-4">{t("verifyLink")}</Link>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-[1.9rem]">{t("yourCircles")}</h1>
      {circles === null ? <Loading text={t("loading")} /> : circles.length === 0 ? (
        <Card><p className="text-ink-muted">{t("noCircles")}</p></Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {circles.map((c) => (
            <li key={c.circleId}>
              <Link href={`/circle?id=${c.circleId}`} className="block rounded-[var(--radius-card)] border border-line bg-paper-raised p-4 hover:border-line-strong">
                <span className="font-display text-lg">{c.name}</span>
                <span className="block font-mono text-xs text-ink-faint">{c.circleId.slice(0, 12)}…</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/create"><Button className="w-full">{t("create")}</Button></Link>
      <Link href="/verify" className="text-center text-sm text-teal-ink underline underline-offset-4">{t("verifyLink")}</Link>
    </Shell>
  )
}
