"use client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button, Card, Field, formatDate, inputCls, Loading, Shell, Stamp } from "@/components/ui"
import { useApp } from "@/components/providers"
import { joinCircle, snapshot, WriteFailed } from "@/lib/actions"
import { parseInvite, saveCircle, type SavedCircle } from "@/lib/circles"
import { useT, type MsgKey } from "@/lib/i18n"
import { isRateLimited } from "@/src/arkiv/client"
import { inr } from "@/src/core/money"
import { blockToDate } from "@/src/core/lease"
import type { CircleView } from "@/src/core/view"

export default function JoinPage() {
  const { t, lang } = useT()
  const router = useRouter()
  const { account, start } = useApp()
  const [ref, setRef] = useState<Pick<SavedCircle, "circleId" | "organiser" | "keyHex"> | null | undefined>(undefined)
  const [view, setView] = useState<CircleView | null | undefined>(undefined)
  const [head, setHead] = useState(0n)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readError, setReadError] = useState<"readLimit" | "readFailed" | null>(null)

  useEffect(() => {
    const r = parseInvite(window.location.hash)
    setRef(r)
    if (!r) return
    snapshot(r).then(({ view, head }) => { setView(view ?? null); setHead(head) }).catch((e) => setReadError(isRateLimited(e) ? "readLimit" : "readFailed"))
  }, [])

  useEffect(() => {
    if (ref && view && account && view.members.some((m) => m.address === account.address.toLowerCase())) {
      saveCircle({ ...ref, name: view.rules.name }).then(() => router.replace(`/circle?id=${ref.circleId}`))
    }
  }, [ref, view, account, router])

  if (ref === null) return <Shell><Card><p>{t("inviteBad")}</p></Card></Shell>
  if (readError) return <Shell><Card><p>{t(readError)}</p></Card></Shell>
  if (ref === undefined || view === undefined) return <Shell><Loading text={t("loading")} /></Shell>
  if (view === null) return <Shell><Card><p>{t("inviteBad")}</p></Card></Shell>

  const expired = !view.inviteExpiresAt || view.inviteExpiresAt <= head
  const organiser = view.members.find((m) => m.address === view.organiser)
  const full = view.seatsLeft === 0 || view.phase !== "joining"

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-widest text-marigold-ink">{t("joinTitle")}</p>
      <h1 className="text-[2rem]">{view.rules.name}</h1>
      <Card className="flex flex-col gap-2">
        <p className="tabular text-lg"><strong>{inr(view.rules.amount_inr)}</strong> × {view.rules.members} · {t(view.rules.frequency as MsgKey)}</p>
        <p className="text-sm text-ink-muted">{t("potIs")}: <span className="tabular">{inr(view.rules.amount_inr * view.rules.members)}</span></p>
        <p className="text-sm">{view.members.map((m) => m.name).join(", ")}</p>
        <p className="text-sm text-ink-muted">{full ? t("full") : t("seatsLeft", { n: view.seatsLeft })}</p>
        {organiser && <Stamp name={`${organiser.name} (${t("organiser")})`} address={organiser.address} entityKey={view.circleKey} />}
        {view.inviteExpiresAt && !expired && (
          <p className="text-xs text-ink-muted">{t("inviteExpires", { date: formatDate(blockToDate(view.inviteExpiresAt, head, Date.now()), lang, true) })}</p>
        )}
      </Card>
      {expired ? <Card><p>{t("inviteExpired")}</p></Card> : full ? null : (
        <>
          <Field label={t("yourName")} hint={t("syntheticNote")}>
            <input className={inputCls} value={name} maxLength={40} placeholder="Ravi K." onChange={(e) => setName(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button busy={busy} disabled={!name.trim()} onClick={async () => {
            setBusy(true); setError(null)
            try {
              const acct = account ?? (await start())
              await joinCircle(acct, ref, view, name.trim(), lang)
              router.replace(`/circle?id=${ref.circleId}`)
            } catch (e) {
              setError(e instanceof WriteFailed && e.outcome.status === "unconfirmed" ? t("unconfirmed") : t("error"))
            } finally { setBusy(false) }
          }}>{busy ? t("saving") : t("joinBtn")}</Button>
        </>
      )}
    </Shell>
  )
}
