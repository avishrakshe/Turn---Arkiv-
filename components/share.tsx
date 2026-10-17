"use client"
import { useEffect, useState } from "react"
import { Button, Card } from "./ui"
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
    <Card className="flex flex-col gap-3">
      <p className="break-all rounded-xl bg-paper-sunk p-3 font-mono text-xs">{link}</p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
      <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
        <Button tone="teal" className="w-full">{t("shareWhatsApp")}</Button>
      </a>
      <Button tone="quiet" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
        {copied ? t("copied") : t("copy")}
      </Button>
    </Card>
  )
}
