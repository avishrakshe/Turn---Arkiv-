"use client"
import { useEffect, useState } from "react"
import { Arrow, Button, Card } from "./ui"
import { inviteLink, type SavedCircle } from "@/lib/circles"
import { useT } from "@/lib/i18n"
import { inr } from "@/src/core/money"

export function ShareInvite({ circle, name, amount, members, note }: {
  circle: Pick<SavedCircle, "circleId" | "organiser" | "keyHex">; name: string; amount: number; members: number; note?: string
}) {
  const { t } = useT()
  const [link, setLink] = useState("")
  const [copied, setCopied] = useState(false)
  useEffect(() => { setLink(inviteLink(window.location.origin, circle)) }, [circle])
  const msg = t("inviteMsg", { name, amount: inr(amount).slice(1), members, link })
  return (
    <Card className="flex flex-col gap-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#e8562a]">{t("share")}</p>
      <p className="break-all rounded-2xl bg-paper-sunk p-4 font-mono text-xs leading-relaxed text-ink-muted">{link}</p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
          className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#1f5e55] px-6 font-semibold text-white hover:bg-[#184b44]">
          {t("shareWhatsApp")} <Arrow />
        </a>
        <Button tone="quiet" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
          {copied ? `✓ ${t("copied")}` : t("copy")}
        </Button>
      </div>
    </Card>
  )
}
