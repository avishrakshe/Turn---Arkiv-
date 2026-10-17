"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Arrow, Button, DarkPanel, HeroPanel, Loading, PageHeader, Shell } from "@/components/ui"
import { useApp } from "@/components/providers"
import { Seal } from "@/components/seal"
import { listCircles, type SavedCircle } from "@/lib/circles"
import { useT } from "@/lib/i18n"

export default function Home() {
  const { t } = useT()
  const { account, ready, start } = useApp()
  const [circles, setCircles] = useState<SavedCircle[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (account) listCircles().then(setCircles) }, [account])

  if (!ready) return <Shell width="xl"><Loading text={t("loading")} /></Shell>

  if (!account) {
    return (
      <Shell width="xl">
        <div className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col justify-center gap-6 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#e8562a]">BC · Kitty · Office committee</p>
            <h1 className="text-[clamp(2.6rem,7vw,4.6rem)] font-bold leading-[0.95] tracking-[-0.045em]">{t("tagline")}</h1>
            <p className="max-w-lg text-lg text-ink-muted">{t("intro")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button arrow busy={busy} onClick={async () => { setBusy(true); try { await start() } finally { setBusy(false) } }}>{t("start")}</Button>
              <Link href="/verify" className="group inline-flex items-center gap-2 px-2 text-sm font-semibold underline-offset-4 hover:underline">{t("verifyLink")} <Arrow /></Link>
            </div>
            <p className="text-sm text-ink-muted">{t("startHint")}</p>
          </div>
          <HeroPanel className="flex min-h-80 flex-col justify-between gap-8">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-semibold text-white/80">Round 2 · Ravi collects</p>
              <p className="tabular text-sm font-semibold text-white/80">₹20,000</p>
            </div>
            <div className="flex flex-wrap items-end justify-center gap-4 [--line-strong:rgb(255_255_255/.7)] [--paper-sunk:rgb(255_255_255/.18)] [--paper:#fff] [--teal:#0f3d37] [--marigold:#ffd089] [--marigold-ink:#fff] [--danger:#fff]">
              {(["confirmed", "confirmed", "claimed", "disputed", "unpaid"] as const).map((st, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Seal state={st} size={i === 0 ? 76 : 56} label={st} />
                  <span className="text-xs font-semibold text-white/85">{["Meera", "Priya", "Arjun", "Sana", "Kiran"][i]}</span>
                </div>
              ))}
            </div>
            <p className="max-w-sm text-sm text-white/85">Each seal has two halves: the payer signs one, the collector signs the other.</p>
          </HeroPanel>
        </div>
      </Shell>
    )
  }

  return (
    <Shell width="xl">
      <PageHeader eyebrow={t("homeEyebrow")} title={t("homeTitle")} />
      {circles === null ? <Loading text={t("loading")} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/create" className="group flex min-h-52 flex-col justify-between rounded-[1.6rem] p-6 text-white transition-transform duration-200 hover:-translate-y-0.5"
            style={{ background: "radial-gradient(22rem 14rem at 90% 0%, rgb(255 196 120 / 0.55), transparent 60%), linear-gradient(125deg, #8f220b, #e8562a 50%, #f4a340)" }}>
            <span className="flex size-11 items-center justify-center rounded-full bg-white/15 text-2xl font-light">+</span>
            <span className="flex items-end justify-between gap-3">
              <span className="text-2xl font-bold leading-tight tracking-[-0.03em]">{t("create")}</span>
              <span className="flex size-10 flex-none items-center justify-center rounded-full bg-white text-[#e8562a]"><Arrow /></span>
            </span>
          </Link>
          {circles.map((c, i) => (
            <Link key={c.circleId} href={`/circle?id=${c.circleId}`}
              className="group flex min-h-52 flex-col justify-between rounded-[1.6rem] border border-line bg-paper-raised p-6 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-ink">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
                <Seal state="confirmed" size={40} label="" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-2xl font-bold leading-tight tracking-[-0.03em]">{c.name}</span>
                <span className="flex items-center justify-between gap-3 text-sm text-ink-muted">
                  <span className="font-mono">{c.circleId.slice(0, 10)}…</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-ink">{t("open")} <Arrow /></span>
                </span>
              </div>
            </Link>
          ))}
          {circles.length === 0 && (
            <div className="flex min-h-52 flex-col justify-center gap-2 rounded-[1.6rem] border border-dashed border-line-strong p-6 text-ink-muted">
              <p className="font-semibold text-ink">{t("yourCircles")}</p>
              <p className="text-sm">{t("noCircles")}</p>
            </div>
          )}
        </div>
      )}
      <DarkPanel className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f4a340]">{t("navVerify")}</p>
          <p className="text-xl font-bold tracking-[-0.02em]">{t("verifyLink")}</p>
        </div>
        <Link href="/verify" className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-[#f2ede6] px-6 font-semibold text-[#0e0d0c]">{t("navVerify")} <Arrow /></Link>
      </DarkPanel>
    </Shell>
  )
}
