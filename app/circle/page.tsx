"use client"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Arrow, Button, Card, DarkPanel, formatDate, HeroPanel, Loading, PageHeader, Pill, SectionTitle, Shell, Stamp, short } from "@/components/ui"
import { useApp } from "@/components/providers"
import { ShareInvite } from "@/components/share"
import { DisputeSheet } from "@/components/dispute"
import { Seal } from "@/components/seal"
import { ProgressRing } from "@/components/ring/ProgressRing"
import { ackPayment, closeRound, keepAlive, lockRoster, payClaim, reader, snapshot, WriteFailed } from "@/lib/actions"
import { getCircle, type SavedCircle } from "@/lib/circles"
import { useT, type MsgKey } from "@/lib/i18n"
import { useLiveCircle } from "@/lib/live"
import { isRateLimited } from "@/src/arkiv/client"
import { EXPLORER } from "@/src/arkiv/config"
import type { AnyRec } from "@/src/arkiv/records"
import { overdueQueryText, whoHasntPaid, type Late } from "@/src/arkiv/queries"
import type { Address, Hex } from "@/src/core/bodies"
import { blockToDate } from "@/src/core/lease"
import { inr } from "@/src/core/money"
import type { Payment } from "@/src/core/payments"
import { fixedPayout, nameOf, type CircleView, type RoundView } from "@/src/core/view"

type Loaded = { view: CircleView; head: bigint; records: AnyRec[]; at: number }

export default function CirclePage() {
  const { t, lang } = useT()
  const { account, toast } = useApp()
  const [saved, setSaved] = useState<SavedCircle | null | undefined>(undefined)
  const [data, setData] = useState<Loaded | null>(null)
  const [live, setLive] = useState(false)
  const [loadError, setLoadError] = useState<"limit" | "other" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dispute, setDispute] = useState<{ round: number; refKey: Hex; label: string } | null>(null)
  const prev = useRef<Loaded | null>(null)
  const me = account?.address.toLowerCase() as Address | undefined
  // The loader reads these through a ref so it keeps one identity: re-creating it would re-run the
  // initial load (and spend read budget) whenever the account or language changes.
  const ctx = useRef({ me, t, toast })
  ctx.current = { me, t, toast }

  const load = useCallback(async (c: SavedCircle, announce: boolean) => {
    const { me, t, toast } = ctx.current
    const { view, head, snap } = await snapshot(c)
    if (!view) return
    const next: Loaded = { view, head, records: snap.records, at: Date.now() }
    const before = prev.current
    if (announce && before) {
      const known = new Set(before.records.map((r) => r.key))
      for (const r of snap.records) {
        if (known.has(r.key) || r.creator === me) continue
        const name = nameOf(view, r.creator)
        if (r.type === "pay_claim") toast(t("livePaid", { name }))
        else if (r.type === "pay_ack") {
          const claim = snap.records.find((x) => x.key === r.refKey)
          toast(t("liveConfirmed", { name, payer: nameOf(view, claim?.creator) }))
        } else if (r.type === "member") toast(t("liveJoined", { name }), "info")
        else if (r.type === "dispute") toast(t("liveDispute", { name }), "warn")
        else if (r.type === "round_result") toast(t("liveResult", { n: r.round ?? 0 }), "info")
      }
      if (view.maxExpiresAt > before.view.maxExpiresAt && snap.records.length === before.records.length) toast(t("liveKept"), "info")
    }
    prev.current = next
    setData(next)
  }, [])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? ""
    getCircle(id).then((c) => { setSaved(c ?? null); if (c) load(c, false).then(() => setLoadError(null), (e) => setLoadError(isRateLimited(e) ? "limit" : "other")) })
  }, [load])

  const watch = useMemo(() => {
    if (!saved || !data) return null
    const creators = new Set<string>([data.view.organiser, ...data.view.members.map((m) => m.address)])
    return {
      creators, keys: new Set(data.records.map((r) => r.key)), anyCreator: data.view.phase === "joining",
      onChange: () => { load(saved, true).catch((e) => toast(isRateLimited(e) ? t("readLimit") : t("readFailed"), "warn")) }, onHealth: setLive,
    }
  }, [saved, data, load, t, toast])
  useLiveCircle(watch)

  if (saved === null) return <Shell back="/app"><Card><p>{t("inviteBad")}</p></Card></Shell>
  if (saved && !data && loadError) {
    return (
      <Shell back="/app">
        <Card className="flex flex-col gap-3">
          <p>{t(loadError === "limit" ? "readLimit" : "readFailed")}</p>
          <Button tone="quiet" onClick={() => { setLoadError(null); load(saved, false).catch((e) => setLoadError(isRateLimited(e) ? "limit" : "other")) }}>{t("retry")}</Button>
        </Card>
      </Shell>
    )
  }
  if (!saved || !data) return <Shell back="/app"><Loading text={t("loading")} /></Shell>

  const { view, head } = data
  const amISeated = !!me && view.members.some((m) => m.address === me)
  const isOrganiser = me === view.organiser
  const date = (b: bigint) => formatDate(blockToDate(b, head, data.at), lang)

  async function run(id: string, fn: () => Promise<unknown>, okText?: string) {
    // Every write is logged with what triggered it (diagnosis of any unexpected write).
    console.info("[turn] write", id, new Date().toISOString())
    setBusy(id)
    try {
      await fn()
      if (okText) toast(okText)
      await load(saved!, false)
    } catch (e) {
      toast(e instanceof WriteFailed && e.outcome.status === "unconfirmed" ? t("unconfirmed") : t("error"), "warn")
    } finally { setBusy(null) }
  }

  const cur = view.current
  const pot = fixedPayout(view.rules, view.members.length)

  return (
    <Shell back="/app" width="xl">
      <PageHeader
        eyebrow={<>{t(view.rules.frequency as MsgKey)} · <span className="tabular">{inr(view.rules.amount_inr)} × {view.rules.members}</span></>}
        title={view.rules.name}
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-2"><span className={`inline-block size-2 rounded-full ${live ? "live-dot bg-success" : "bg-ink-faint"}`} aria-hidden />{t("recordUntil", { date: date(view.minExpiresAt) })}</span>
            {view.ignoredCount > 0 && <span>{t(view.ignoredCount === 1 ? "ignored" : "ignoredMany", { n: view.ignoredCount })}</span>}
          </span>
        }
        aside={view.rounds.length > 0 ? <ProgressRing round={cur?.round ?? view.rounds.length} total={view.rounds.length} size={72} yourTurn={cur?.collector === me} /> : undefined}
      />

      {view.phase === "joining" ? (
        <JoiningPanel view={view} saved={saved} isOrganiser={isOrganiser} busy={busy === "roster"}
          onLock={() => run("roster", () => lockRoster(account!, saved, view), t("saved"))} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
            {cur ? (
              <RoundHero key={cur.round} r={cur} view={view} me={me} busy={busy} pot={pot}
                onPay={(method) => run(`pay-${method}`, () => payClaim(account!, saved, view, cur.round, method), t("saved"))} />
            ) : (
              <HeroPanel className="flex flex-col gap-4">
                <span className={ON_ORANGE}><Seal state="confirmed" size={64} label="" /></span>
                <p className="text-3xl font-bold tracking-[-0.03em]">{t("finished")}</p>
              </HeroPanel>
            )}
            <MembersPanel view={view} me={me} />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {cur && (
              <PaymentsPanel r={cur} view={view} me={me} isOrganiser={isOrganiser} busy={busy}
                onAck={(p) => run(`ack-${p.payer}`, () => ackPayment(account!, saved, view, p), t("saved"))}
                onClose={() => run("close", () => closeRound(account!, saved, view, cur), t("saved"))}
                onDispute={setDispute} />
            )}

            {isOrganiser && view.phase === "running" && view.rounds[0] && <WhoHasntPaid view={view} />}

            {view.rounds.some((r) => r.status === "closed") && (
              <section className="flex flex-col gap-3">
                <SectionTitle>{t("history")}</SectionTitle>
                <ul className="flex flex-col">
                  {view.rounds.filter((r) => r.status === "closed").reverse().map((r) => (
                    <li key={r.round} className="flex flex-col gap-2 border-b border-line py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-baseline gap-3">
                          <span className="text-sm font-semibold text-ink-muted">{String(r.round).padStart(2, "0")}</span>
                          {r.result && <span className="font-bold">{t("roundClosed", { name: nameOf(view, r.result.body.winner), amount: inr(r.result.body.payout_inr) })}</span>}
                        </span>
                        <Pill tone={r.resultMismatch ? "bad" : "ok"}>{r.progress.confirmed}/{r.progress.total} ✓</Pill>
                      </div>
                      {r.resultMismatch && <p className="text-sm text-danger">{t("mismatch")}</p>}
                      {r.result && <Stamp name={nameOf(view, r.result.creator)} address={r.result.creator} entityKey={r.result.key} className="ps-8" />}
                      {r.disputes.length > 0 && <div className="flex flex-col gap-1 ps-8">{r.disputes.map((d) => <DisputeLine key={d.key} d={d} view={view} />)}</div>}
                      {amISeated && r.result && (
                        <button className="ms-8 self-start text-xs font-semibold text-danger underline underline-offset-2" onClick={() => setDispute({ round: r.round, refKey: r.result!.key, label: t("round", { n: r.round }) })}>{t("dispute")}</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <DarkPanel className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f4a340]">{t("record")}</p>
                  <p className="text-2xl font-bold tracking-[-0.03em]">{t("recordUntil", { date: date(view.minExpiresAt) })}</p>
                </div>
              </div>
              <p className="text-sm text-[#b4ada5]">{t("keepAliveHint")}</p>
              <div className="flex flex-wrap items-center gap-3">
                {amISeated && (
                  <button disabled={busy === "keep"} onClick={() => run("keep", async () => {
                    const r = await keepAlive(account!, view)
                    toast(t("kept", { date: formatDate(blockToDate(r.target, await reader.getBlockNumber(), Date.now()), lang) }))
                  })} className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-[#f2ede6] px-6 font-semibold text-[#0e0d0c] disabled:opacity-50">
                    {busy === "keep" ? t("saving") : t("keepAlive")} <Arrow />
                  </button>
                )}
                <Link href={`/verify#c=${view.circleId}&o=${view.organiser}`} className="group inline-flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-6 font-semibold hover:border-white">{t("verifyLink")} <Arrow /></Link>
              </div>
              <p className="text-xs text-[#7d766e]">{t("managedBy", { creator: nameOf(view, view.organiser), owner: nameOf(view, view.managedBy) })}</p>
            </DarkPanel>
          </div>
        </div>
      )}

      {dispute && (
        <DisputeSheet label={dispute.label} onClose={() => setDispute(null)} busy={busy === "dispute"}
          onSend={(reason, note) => run("dispute", async () => {
            const { fileDispute } = await import("@/lib/actions")
            await fileDispute(account!, saved, view, dispute.round, dispute.refKey, reason, note)
            setDispute(null)
          }, t("saved"))} />
      )}
    </Shell>
  )
}

/** Seal colours that read on the orange hero panel. */
const ON_ORANGE = "inline-flex [--line-strong:rgb(255_255_255/.75)] [--paper-sunk:rgb(255_255_255/.16)] [--paper:#fff] [--teal:#0f3d37] [--teal-hover:#0a2a26] [--marigold:#ffd089] [--marigold-ink:#fff] [--danger:#fff]"

function JoiningPanel({ view, saved, isOrganiser, busy, onLock }: { view: CircleView; saved: SavedCircle; isOrganiser: boolean; busy: boolean; onLock: () => void }) {
  const { t } = useT()
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <HeroPanel className="flex flex-col gap-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">{t("waitingMembers")}</p>
        <p className="text-4xl font-bold tracking-[-0.04em]">{view.seatsLeft > 0 ? (view.seatsLeft === 1 ? t("seatLeft") : t("seatsLeft", { n: view.seatsLeft })) : t("full")}</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: view.rules.members }, (_, i) => (
            <span key={i} className={ON_ORANGE}><Seal state={i < view.members.length ? "confirmed" : "unpaid"} size={40} label="" /></span>
          ))}
        </div>
        {isOrganiser && view.seatsLeft === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white/85">{t("lockHint")}</p>
            <Button tone="light" arrow busy={busy} onClick={onLock}>{t("lockRoster")}</Button>
          </div>
        )}
      </HeroPanel>
      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <SectionTitle aside={<span className="text-sm text-ink-muted">{view.members.length}/{view.rules.members}</span>}>{t("members")}</SectionTitle>
          <ul className="flex flex-col">
            {view.members.map((m, i) => (
              <li key={m.address} className="flex flex-col gap-1 border-b border-line py-3">
                <p className="flex items-baseline gap-3 font-bold">
                  <span className="text-sm font-semibold text-ink-muted">{String(i + 1).padStart(2, "0")}</span>{m.name}
                  {m.address === view.organiser && <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e8562a]">{t("organiser")}</span>}
                </p>
                <Stamp name={m.name} address={m.address} entityKey={m.joinKey} className="ps-8" />
              </li>
            ))}
          </ul>
        </section>
        {isOrganiser && view.seatsLeft > 0 && <ShareInvite circle={saved} name={view.rules.name} amount={view.rules.amount_inr} members={view.rules.members} />}
      </div>
    </div>
  )
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "member"

/** The orange panel: who collects this round, the pot, the due date, everyone's seal, and my payment. */
function RoundHero({ r, view, me, busy, pot, onPay }: {
  r: RoundView; view: CircleView; me?: Address; busy: string | null; pot: number; onPay: (m: "UPI" | "cash") => void
}) {
  const { t, lang } = useT()
  const collectorName = nameOf(view, r.collector)
  const mine = r.payments.find((p) => p.payer === me)
  const amount = view.rules.amount_inr
  // Synthetic VPA for the demo: real UPI IDs never go on Arkiv (or anywhere in this app).
  const upi = `upi://pay?pa=${slug(collectorName)}@example&pn=${encodeURIComponent(collectorName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`${view.rules.name} R${r.round}`)}`
  return (
    <HeroPanel className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">{t("round", { n: r.round })} {t("of", { n: view.rounds.length })}</p>
        <p className="text-xs font-semibold text-white/75">{t("due", { date: formatDate(new Date(r.dueMs), lang, view.rules.frequency === "demo") })}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-white/80">{r.collector === me ? t("you") : t("collectorNow")}</p>
        <p className="text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-none tracking-[-0.04em]">{collectorName}</p>
        <p className="tabular text-[clamp(2.4rem,7vw,3.4rem)] font-bold leading-none tracking-[-0.05em]">{inr(pot)}</p>
      </div>
      <ul className="flex flex-wrap gap-4" aria-label={t("payments")}>
        {r.payments.map((p) => (
          <li key={p.payer} className="flex w-16 flex-col items-center gap-1.5 text-center">
            <span className={ON_ORANGE}><Seal state={p.state} size={48} label={`${nameOf(view, p.payer)}: ${p.state}`} /></span>
            <span className="w-full truncate text-xs font-semibold text-white/90">{p.payer === me ? t("you") : nameOf(view, p.payer)}</span>
          </li>
        ))}
      </ul>
      {mine && mine.state === "unpaid" && (
        <div className="flex flex-col gap-2 rounded-[1.2rem] bg-black/15 p-3">
          <a href={upi} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-semibold text-[#e8562a]">{t("payNow", { amount: inr(amount) })} · {t("payUpi")} <Arrow /></a>
          <div className="grid grid-cols-2 gap-2">
            <Button tone="teal" busy={busy === "pay-UPI"} onClick={() => onPay("UPI")}>{t("iPaid")}</Button>
            <button disabled={busy === "pay-cash"} onClick={() => onPay("cash")} className="min-h-12 rounded-full border border-white/60 px-4 font-semibold text-white hover:border-white disabled:opacity-50">{t("payCash")}</button>
          </div>
        </div>
      )}
    </HeroPanel>
  )
}

/** Turn order: who collected, who collects now, who is next. */
function MembersPanel({ view, me }: { view: CircleView; me?: Address }) {
  const { t } = useT()
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle aside={<span className="text-sm text-ink-muted">{view.members.length}</span>}>{t("members")}</SectionTitle>
      <ol className="flex flex-col">
        {view.rounds.map((r) => (
          <li key={r.round} className="flex items-center gap-3 border-b border-line py-3">
            <span className="w-6 text-sm font-semibold text-ink-muted">{String(r.round).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{r.collector === me ? `${nameOf(view, r.collector)} (${t("you")})` : nameOf(view, r.collector)}</span>
            {r.status === "closed" ? <Pill tone="ok">{inr(r.result?.body.payout_inr ?? 0)} ✓</Pill>
              : r.status === "open" ? <Pill tone="wait">{t("collectorNow")}</Pill>
              : <span className="text-xs font-semibold text-ink-muted">{t("round", { n: r.round })}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Each payer's line with signatures and actions, plus the organiser's close button. */
function PaymentsPanel({ r, view, me, isOrganiser, busy, onAck, onClose, onDispute }: {
  r: RoundView; view: CircleView; me?: Address; isOrganiser: boolean; busy: string | null
  onAck: (p: Payment) => void; onClose: () => void; onDispute: (d: { round: number; refKey: Hex; label: string }) => void
}) {
  const { t } = useT()
  const allConfirmed = r.progress.confirmed === r.progress.total
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle aside={<span className="tabular text-sm text-ink-muted">{r.progress.confirmed}/{r.progress.total} ✓</span>}>{t("payments")}</SectionTitle>
      <ul className="flex flex-col divide-y divide-line">
        {r.payments.map((p) => (
          <PaymentRow key={p.payer} p={p} r={r} view={view} me={me} busy={busy} onAck={onAck} onDispute={onDispute} />
        ))}
      </ul>
      {isOrganiser && <CloseRound r={r} view={view} busy={busy === "close"} allConfirmed={allConfirmed} onClose={onClose} />}
    </section>
  )
}
function DisputeLine({ d, view }: { d: AnyRec & { type: "dispute" }; view: CircleView }) {
  const { t } = useT()
  return (
    <div className="rounded-xl border border-danger/30 bg-danger-soft p-2 text-sm">
      <p className="font-medium text-danger">⚠ {t(`reason_${d.body.reason}` as MsgKey)}{d.body.note && ` — ${d.body.note}`}</p>
      <p className="text-xs text-ink-muted">{t("reportedBy", { name: nameOf(view, d.creator) })} · <a className="underline" href={`${EXPLORER}/entity/${d.key}`} target="_blank" rel="noreferrer">{short(d.key)}</a></p>
    </div>
  )
}

function WhoHasntPaid({ view }: { view: CircleView }) {
  const { t, lang } = useT()
  const [res, setRes] = useState<{ late: Late[]; pages: number; claims: number; query: string } | null>(null)
  const order = useMemo(() => view.rounds.map((r) => r.collector), [view.rounds])
  const closed = useMemo(() => new Set(view.rounds.filter((r) => r.status === "closed").map((r) => r.round)), [view.rounds])
  const claims = view.rounds.reduce((n, r) => n + r.payments.filter((p) => p.claim).length, 0)
  useEffect(() => {
    let off = false
    const now = Date.now()
    whoHasntPaid(reader, view.circleId, view.rules, order, now, { closedRounds: closed }).then((r) => {
      const due = view.rounds.filter((x) => x.dueMs <= now && !closed.has(x.round)).map((x) => x.round)
      if (!off) setRes({ ...r, query: due.length ? overdueQueryText(view.circleId, now, [due[0]!, due.at(-1)!]) : "" })
    }).catch(() => undefined)
    return () => { off = true }
    // Re-query only when the committee, the closed rounds or the number of claims changes (each query costs budget).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.circleId, closed.size, order.length, claims])
  if (!res) return null
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle aside={<span className="tabular text-sm text-ink-muted">{res.late.length}</span>}>{t("whoHasntPaid")}</SectionTitle>
      {res.late.length === 0 ? <p className="py-2 text-sm text-ink-muted">{t("allPaid")}</p> : (
        <ul className="flex flex-col">
          {res.late.map((l) => (
            <li key={`${l.round}-${l.member}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-3 text-sm">
              <span className="font-semibold">{nameOf(view, l.member)} <span className="font-normal text-ink-muted">→ {nameOf(view, l.collector)}</span></span>
              <span className="text-xs font-semibold text-warning">{t("round", { n: l.round })} · {t("late")} · {formatDate(new Date(l.dueMs), lang, view.rules.frequency === "demo")}</span>
            </li>
          ))}
        </ul>
      )}
      {res.query && <details className="text-xs text-ink-muted"><summary className="cursor-pointer font-semibold">Arkiv query</summary><code className="mt-2 block break-all rounded-xl bg-paper-sunk p-3">{res.query}</code></details>}
    </section>
  )
}
/**
 * One payer's line: seal + status, signatures (collapsed), and actions. "Received" is a two-step
 * confirmation that names the person and amount and disarms after 8 s or when the data changes,
 * so a stray or stale tap can never confirm money.
 */
function PaymentRow({ p, r, view, me, busy, onAck, onDispute }: {
  p: Payment; r: RoundView; view: CircleView; me?: Address; busy: string | null
  onAck: (p: Payment) => void; onDispute: (d: { round: number; refKey: Hex; label: string }) => void
}) {
  const { t } = useT()
  const [armed, setArmed] = useState(false)
  const [showSig, setShowSig] = useState(false)
  const payer = nameOf(view, p.payer)
  const collectorName = nameOf(view, r.collector)
  const claimKey = p.claim?.key
  useEffect(() => { setArmed(false) }, [claimKey, p.state])
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 8_000)
    return () => clearTimeout(id)
  }, [armed])
  const canAck = r.collector === me && p.state === "claimed" && !!p.claim
  const canDispute = !!me && view.members.some((m) => m.address === me) && !!p.claim
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <Seal state={p.state} size={36} label={p.state} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{p.payer === me ? t("you") : payer}</p>
          <p className={`text-xs ${p.state === "confirmed" ? "text-success" : p.state === "claimed" ? "text-warning" : p.state === "disputed" ? "text-danger" : "text-ink-muted"}`}>
            {p.state === "confirmed" ? t("confirmed", { name: collectorName }) : p.state === "claimed" ? t("claimed", { name: collectorName }) : p.state === "disputed" ? t("disputed") : t("notPaid")}
          </p>
        </div>
      </div>
      {p.disputes.length > 0 && <div className="flex flex-col gap-1 ps-12">{p.disputes.map((d) => <DisputeLine key={d.key} d={d} view={view} />)}</div>}
      {canAck && armed && (
        <div className="ms-12 flex flex-col gap-3 rounded-2xl border border-ink/15 bg-paper-raised p-4" role="group">
          <p className="text-sm font-semibold">{t("ackQuestion", { amount: inr(p.claim!.body.amount_inr), name: payer })}</p>
          <div className="flex gap-2">
            <Button tone="teal" className="min-h-10 flex-1" busy={busy === `ack-${p.payer}`}
              onClick={(e) => { if (!e.isTrusted) return; setArmed(false); onAck(p) }}>{t("ackYes")}</Button>
            <Button tone="quiet" className="min-h-10" onClick={() => setArmed(false)}>{t("ackNo")}</Button>
          </div>
        </div>
      )}
      {(canAck || canDispute || p.claim || p.ack) && !armed && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ps-12">
          {canAck && <Button tone="teal" className="min-h-10 px-5" onClick={() => setArmed(true)}>{t("markReceived")}</Button>}
          {(p.claim || p.ack) && (
            <button type="button" aria-expanded={showSig} onClick={() => setShowSig((v) => !v)}
              className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink">
              {t("signatures")} <span aria-hidden className={`transition-transform ${showSig ? "rotate-180" : ""}`}>▾</span>
            </button>
          )}
          {canDispute && (
            <button className="min-h-10 text-xs font-semibold text-danger underline-offset-2 hover:underline"
              onClick={() => onDispute({ round: r.round, refKey: (p.ack ?? p.claim)!.key, label: `${payer} · ${t("round", { n: r.round })}` })}>{t("dispute")}</button>
          )}
        </div>
      )}
      {showSig && (
        <div className="ms-12 flex flex-col gap-1 rounded-xl bg-paper-sunk/60 p-3">
          {p.claim && <Stamp name={payer} address={p.claim.creator} entityKey={p.claim.key} />}
          {p.ack && <Stamp name={collectorName} address={p.ack.creator} entityKey={p.ack.key} />}
        </div>
      )}    </li>
  )
}
/** Closing a round is final. If not every seal is locked, ask first and say how many are open. */
function CloseRound({ r, view, busy, allConfirmed, onClose }: { r: RoundView; view: CircleView; busy: boolean; allConfirmed: boolean; onClose: () => void }) {
  const { t } = useT()
  const [armed, setArmed] = useState(false)
  useEffect(() => { setArmed(false) }, [r.progress.confirmed, r.round])
  const label = t("closeRound", { n: r.round, name: nameOf(view, r.collector), amount: inr(fixedPayout(view.rules, view.members.length)) })
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {!armed ? (
        <Button tone={allConfirmed ? "primary" : "quiet"} busy={busy} onClick={() => (allConfirmed ? onClose() : setArmed(true))}>{label}</Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3" role="group">
          <p className="text-sm">{t("closeEarly", { done: r.progress.confirmed, total: r.progress.total })}</p>
          <div className="flex gap-2">
            <Button tone="primary" className="min-h-10 flex-1" busy={busy} onClick={() => { setArmed(false); onClose() }}>{t("closeAnyway")}</Button>
            <Button tone="quiet" className="min-h-10" onClick={() => setArmed(false)}>{t("ackNo")}</Button>
          </div>
        </div>
      )}
      <p className="text-xs text-ink-muted">{t("closeHint")}</p>
    </div>
  )
}