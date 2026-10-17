"use client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button, Card, Field, formatDate, HeroPanel, inputCls, Loading, PageHeader, Shell, Stamp, Stat } from "@/components/ui"
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
    <Shell width="lg">
      <PageHeader eyebrow={t("joinTitle")} title={view.rules.name}
        meta={organiser && <Stamp name={`${organiser.name} (${t("organiser")})`} address={organiser.address} entityKey={view.circleKey} />} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <HeroPanel className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-5">
            <Stat light label={t("perMember")} value={inr(view.rules.amount_inr)} />
            <Stat light label={t("potEach")} value={inr(view.rules.amount_inr * view.rules.members)} />
            <Stat light label={t("rounds")} value={view.rules.members} />
            <Stat light label={t("frequency")} value={t(view.rules.frequency as MsgKey)} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">{t("members")}</p>
            <p className="font-semibold">{view.members.map((m) => m.name).join(" · ")}</p>
            <p className="text-sm text-white/85">{full ? t("full") : (view.seatsLeft === 1 ? t("seatLeft") : t("seatsLeft", { n: view.seatsLeft }))}</p>
          </div>
          {view.inviteExpiresAt && !expired && (
            <p className="text-xs font-semibold text-white/75">{t("inviteExpires", { date: formatDate(blockToDate(view.inviteExpiresAt, head, Date.now()), lang, true) })}</p>
          )}
        </HeroPanel>
        {expired ? <Card><p className="font-semibold">{t("inviteExpired")}</p></Card> : full ? <Card><p className="font-semibold">{t("full")}</p></Card> : (
          <Card className="flex flex-col gap-5">
            <Field label={t("yourName")} hint={t("syntheticNote")}>
              <input className={inputCls} value={name} maxLength={40} placeholder="Ravi K." onChange={(e) => setName(e.target.value)} />
            </Field>
            {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger" role="alert">{error}</p>}
            <Button arrow busy={busy} disabled={!name.trim()} onClick={async () => {
              setBusy(true); setError(null)
              try {
                const acct = account ?? (await start())
                await joinCircle(acct, ref, view, name.trim(), lang)
                router.replace(`/circle?id=${ref.circleId}`)
              } catch (e) {
                setError(e instanceof WriteFailed && e.outcome.status === "unconfirmed" ? t("unconfirmed") : t("error"))
              } finally { setBusy(false) }
            }}>{busy ? t("saving") : t("joinBtn")}</Button>
            <p className="text-xs text-ink-muted">{t("startHint")}</p>
          </Card>
        )}
      </div>
    </Shell>
  )
}