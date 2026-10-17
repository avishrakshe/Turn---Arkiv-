"use client"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, formatDate, Loading, Pill, Shell, Stamp, short } from "@/components/ui"
import { useApp } from "@/components/providers"
import { ShareInvite } from "@/components/share"
import { DisputeSheet } from "@/components/dispute"
import { ProgressRing } from "@/components/ring/ProgressRing"
import { TurnRing } from "@/components/ring/TurnRing"
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

  if (saved === null) return <Shell back="/"><Card><p>{t("inviteBad")}</p></Card></Shell>
  if (saved && !data && loadError) {
    return (
      <Shell back="/">
        <Card className="flex flex-col gap-3">
          <p>{t(loadError === "limit" ? "readLimit" : "readFailed")}</p>
          <Button tone="quiet" onClick={() => { setLoadError(null); load(saved, false).catch((e) => setLoadError(isRateLimited(e) ? "limit" : "other")) }}>{t("retry")}</Button>
        </Card>
      </Shell>
    )
  }
  if (!saved || !data) return <Shell back="/"><Loading text={t("loading")} /></Shell>

  const { view, head } = data
  const amISeated = !!me && view.members.some((m) => m.address === me)
  const isOrganiser = me === view.organiser
  const date = (b: bigint) => formatDate(blockToDate(b, head, data.at), lang)

  async function run(id: string, fn: () => Promise<unknown>, okText?: string) {
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
  const ringMembers = view.members.map((m) => {
    const p = cur?.payments.find((x) => x.payer === m.address)
    return { name: m.name, status: (!p ? "paid" : p.state === "confirmed" ? "paid" : p.state === "disputed" ? "late" : "pending") as "paid" | "pending" | "late" }
  })

  return (
    <Shell back="/">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.8rem]">{view.rules.name}</h1>
          <p className="tabular text-sm text-ink-muted">{inr(view.rules.amount_inr)} × {view.rules.members} · {t(view.rules.frequency as MsgKey)}</p>
        </div>
        {view.rounds.length > 0 && <ProgressRing round={cur?.round ?? view.rounds.length} total={view.rounds.length} yourTurn={cur?.collector === me} />}
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <span className={`inline-block size-2 rounded-full ${live ? "live-dot bg-success" : "bg-ink-faint"}`} aria-hidden />
        {t("recordUntil", { date: date(view.minExpiresAt) })}
        {view.ignoredCount > 0 && <span className="ms-auto">{t(view.ignoredCount === 1 ? "ignored" : "ignoredMany", { n: view.ignoredCount })}</span>}
      </p>

      {view.members.length > 0 && (
        <div className="mx-auto w-64">
          <TurnRing members={ringMembers} step={(cur?.round ?? 1) - 1} marker={view.phase === "running"} showStatus={view.phase === "running"}
            center={cur ? <><span className="text-xs text-ink-muted">{t("round", { n: cur.round })}</span><span className="tabular font-display text-xl">{inr(fixedPayout(view.rules, view.members.length))}</span></> : undefined} />
        </div>
      )}

      {view.phase === "joining" && (
        <JoiningPanel view={view} saved={saved} isOrganiser={isOrganiser} busy={busy === "roster"}
          onLock={() => run("roster", () => lockRoster(account!, saved, view), t("saved"))} />
      )}

      {cur && (
        <RoundCard key={cur.round} r={cur} view={view} me={me} isOrganiser={isOrganiser} busy={busy}
          onPay={(method) => run(`pay-${method}`, () => payClaim(account!, saved, view, cur.round, method), t("saved"))}
          onAck={(p) => run(`ack-${p.payer}`, () => ackPayment(account!, saved, view, p), t("saved"))}
          onClose={() => run("close", () => closeRound(account!, saved, view, cur), t("saved"))}
          onDispute={setDispute} />
      )}

      {isOrganiser && view.phase === "running" && view.rounds[0] && <WhoHasntPaid view={view} />}

      {view.phase === "finished" && <Card><p className="font-display text-xl">{t("finished")} ✓</p></Card>}

      {view.rounds.filter((r) => r.status === "closed").reverse().map((r) => (
        <Card key={r.round} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{t("round", { n: r.round })}</span>
            <Pill tone={r.resultMismatch ? "bad" : "ok"}>{r.progress.confirmed}/{r.progress.total} ✓</Pill>
          </div>
          {r.result && <p>{t("roundClosed", { name: nameOf(view, r.result.body.winner), amount: inr(r.result.body.payout_inr) })}</p>}
          {r.resultMismatch && <p className="text-sm text-danger">{t("mismatch")}</p>}
          {r.result && <Stamp name={nameOf(view, r.result.creator)} address={r.result.creator} entityKey={r.result.key} />}
          {r.disputes.map((d) => <DisputeLine key={d.key} d={d} view={view} />)}
          {amISeated && r.result && (
            <button className="self-start text-xs text-danger underline underline-offset-2" onClick={() => setDispute({ round: r.round, refKey: r.result!.key, label: t("round", { n: r.round }) })}>{t("dispute")}</button>
          )}
        </Card>
      ))}

      {view.phase !== "joining" && (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">{t("keepAlive")}</p>
          <p className="text-sm text-ink-muted">{t("keepAliveHint")}</p>
          <p className="text-sm">{t("recordUntil", { date: date(view.minExpiresAt) })}</p>
          {amISeated && (
            <Button tone="quiet" busy={busy === "keep"} onClick={() => run("keep", async () => {
              const r = await keepAlive(account!, view)
              toast(t("kept", { date: formatDate(blockToDate(r.target, await reader.getBlockNumber(), Date.now()), lang) }))
            })}>{t("keepAlive")}</Button>
          )}
          <p className="text-xs text-ink-faint">{t("managedBy", { creator: nameOf(view, view.organiser), owner: nameOf(view, view.managedBy) })}</p>
        </Card>
      )}

      <Link href={`/verify#c=${view.circleId}&o=${view.organiser}`} className="text-center text-sm text-teal-ink underline underline-offset-4">{t("verifyLink")}</Link>

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

function JoiningPanel({ view, saved, isOrganiser, busy, onLock }: { view: CircleView; saved: SavedCircle; isOrganiser: boolean; busy: boolean; onLock: () => void }) {
  const { t } = useT()
  return (
    <>
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">{view.seatsLeft > 0 ? `${t("waitingMembers")} · ${(view.seatsLeft === 1 ? t("seatLeft") : t("seatsLeft", { n: view.seatsLeft }))}` : t("full")}</p>
        <ul className="flex flex-col gap-2">
          {view.members.map((m) => (
            <li key={m.address}>
              <p className="font-medium">{m.name}{m.address === view.organiser && <span className="text-ink-muted"> · {t("organiser")}</span>}</p>
              <Stamp name={m.name} address={m.address} entityKey={m.joinKey} />
            </li>
          ))}
        </ul>
      </Card>
      {isOrganiser && view.seatsLeft > 0 && <ShareInvite circle={saved} name={view.rules.name} amount={view.rules.amount_inr} members={view.rules.members} />}
      {isOrganiser && view.seatsLeft === 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t("lockHint")}</p>
          <Button tone="teal" busy={busy} onClick={onLock}>{t("lockRoster")}</Button>
        </Card>
      )}
    </>
  )
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "member"

function RoundCard({ r, view, me, isOrganiser, busy, onPay, onAck, onClose, onDispute }: {
  r: RoundView; view: CircleView; me?: Address; isOrganiser: boolean; busy: string | null
  onPay: (m: "UPI" | "cash") => void; onAck: (p: Payment) => void; onClose: () => void
  onDispute: (d: { round: number; refKey: Hex; label: string }) => void
}) {
  const { t, lang } = useT()
  const collectorName = nameOf(view, r.collector)
  const mine = r.payments.find((p) => p.payer === me)
  const amount = view.rules.amount_inr
  // Synthetic VPA for the demo: real UPI IDs never go on Arkiv (or anywhere in this app).
  const upi = `upi://pay?pa=${slug(collectorName)}@example&pn=${encodeURIComponent(collectorName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`${view.rules.name} R${r.round}`)}`
  const allConfirmed = r.progress.confirmed === r.progress.total
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{t("round", { n: r.round })} <span className="text-ink-muted">{t("of", { n: view.rounds.length })}</span></span>
        <span className="text-xs text-ink-muted">{t("due", { date: formatDate(new Date(r.dueMs), lang, view.rules.frequency === "demo") })}</span>
      </div>
      <p className="font-display text-lg">{r.collector === me ? `${t("you")} · ` : ""}{t("collects", { name: collectorName })} <span className="tabular">{inr(fixedPayout(view.rules, view.members.length))}</span></p>

      {mine && mine.state === "unpaid" && (
        <div className="flex flex-col gap-2 rounded-2xl bg-marigold-soft p-3">
          <a href={upi}><Button className="w-full">{t("payNow", { amount: inr(amount) })} · {t("payUpi")}</Button></a>
          <div className="grid grid-cols-2 gap-2">
            <Button tone="teal" busy={busy === "pay-UPI"} onClick={() => onPay("UPI")}>{t("iPaid")}</Button>
            <Button tone="quiet" busy={busy === "pay-cash"} onClick={() => onPay("cash")}>{t("payCash")}</Button>
          </div>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {r.payments.map((p) => {
          const payer = nameOf(view, p.payer)
          return (
            <li key={p.payer} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{p.payer === me ? t("you") : payer}</span>
                <Pill tone={p.state === "confirmed" ? "ok" : p.state === "claimed" ? "wait" : p.state === "disputed" ? "bad" : "none"}>
                  {p.state === "confirmed" ? t("confirmed", { name: collectorName }) : p.state === "claimed" ? t("claimed", { name: collectorName }) : p.state === "disputed" ? t("disputed") : t("notPaid")}
                </Pill>
              </div>
              {p.claim && <Stamp name={payer} address={p.claim.creator} entityKey={p.claim.key} />}
              {p.ack && <Stamp name={collectorName} address={p.ack.creator} entityKey={p.ack.key} />}
              {p.disputes.map((d) => <DisputeLine key={d.key} d={d} view={view} />)}
              <div className="flex gap-3">
                {r.collector === me && p.state === "claimed" && (
                  <Button tone="teal" className="min-h-10 flex-1" busy={busy === `ack-${p.payer}`} onClick={() => onAck(p)}>{t("markReceived")}</Button>
                )}
                {me && view.members.some((m) => m.address === me) && p.claim && (
                  <button className="text-xs text-danger underline underline-offset-2" onClick={() => onDispute({ round: r.round, refKey: (p.ack ?? p.claim)!.key, label: `${payer} · ${t("round", { n: r.round })}` })}>{t("dispute")}</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {isOrganiser && (
        <div className="flex flex-col gap-1">
          <Button tone={allConfirmed ? "primary" : "quiet"} busy={busy === "close"} onClick={onClose}>
            {t("closeRound", { n: r.round, name: collectorName, amount: inr(fixedPayout(view.rules, view.members.length)) })}
          </Button>
          <p className="text-xs text-ink-muted">{t("closeHint")}</p>
        </div>
      )}
    </Card>
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
  useEffect(() => {
    let off = false
    const now = Date.now()
    whoHasntPaid(reader, view.circleId, view.rules, order, now, { closedRounds: closed }).then((r) => {
      const due = view.rounds.filter((x) => x.dueMs <= now && !closed.has(x.round)).map((x) => x.round)
      if (!off) setRes({ ...r, query: due.length ? overdueQueryText(view.circleId, now, [due[0]!, due.at(-1)!]) : "" })
    }).catch(() => undefined)
    return () => { off = true }
    // Re-query only when the committee or the set of closed rounds changes (each query costs budget).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.circleId, closed.size, order.length])
  if (!res) return null
  return (
    <Card className="flex flex-col gap-2">
      <p className="font-semibold">{t("whoHasntPaid")}</p>
      {res.late.length === 0 ? <p className="text-sm text-ink-muted">{t("allPaid")}</p> : (
        <ul className="text-sm">
          {res.late.map((l) => (
            <li key={`${l.round}-${l.member}`} className="flex justify-between py-1">
              <span>{nameOf(view, l.member)} → {nameOf(view, l.collector)}</span>
              <span className="text-warning">{t("round", { n: l.round })} · {t("late")} ({formatDate(new Date(l.dueMs), lang, view.rules.frequency === "demo")})</span>
            </li>
          ))}
        </ul>
      )}
      {res.query && <details className="text-xs text-ink-muted"><summary>Arkiv query</summary><code className="block break-all pt-1">{res.query}</code></details>}
    </Card>
  )
}
