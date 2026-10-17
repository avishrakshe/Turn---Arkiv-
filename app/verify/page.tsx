"use client"
/**
 * /verify — read a committee's ledger WITHOUT Turn's backend: this static page queries the public
 * Tiramisu RPC directly from the browser. No circle key needed (keyless: who paid whom, confirmed
 * by whom, from public attributes + $creator). With the invite key in the fragment it also
 * decrypts names, locally.
 */
import { useEffect, useState } from "react"
import { Button, Card, Field, inputCls, Loading, Pill, Shell, short } from "@/components/ui"
import { isRateLimited, publicClient } from "@/src/arkiv/client"
import { EXPLORER, RPC_HTTP } from "@/src/arkiv/config"
import { importCircleKey } from "@/src/arkiv/payload"
import { loadCircle } from "@/src/arkiv/circle"
import { readPublicLedger, type PublicLedger } from "@/src/arkiv/public-ledger"
import type { Address } from "@/src/core/bodies"
import { buildView } from "@/src/core/view"
import { useT } from "@/lib/i18n"

export default function Verify() {
  const { t } = useT()
  const [circleId, setCircleId] = useState("")
  const [organiser, setOrganiser] = useState("")
  const [keyHex, setKeyHex] = useState<string | null>(null)
  const [ledger, setLedger] = useState<PublicLedger | null | undefined>(undefined)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(id: string, org: string, k: string | null) {
    setBusy(true); setLedger(undefined); setNames(new Map()); setError(null)
    try {
      const client = publicClient()
      const hint = /^0x[0-9a-f]{40}$/.test(org) ? (org as Address) : undefined
      const l = await readPublicLedger(client, id, hint)
      setLedger(l ?? null)
      if (l && k) {
        const snap = await loadCircle(client, { circleId: id, organiser: l.organiser }, await importCircleKey(k))
        const v = buildView(snap)
        if (v) setNames(new Map(v.members.map((m) => [m.address, m.name])))
      }
    } catch (e) {
      setError(isRateLimited(e)
        ? "The public Tiramisu RPC refused this read: its free anonymous budget for your connection is used up (HTTP 429). Wait a few minutes and try again — this page deliberately has no Turn server to fall back on."
        : "Couldn't reach the Tiramisu RPC. Check your connection and try again.")
    } finally { setBusy(false) }
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    const c = (p.get("c") ?? "").toLowerCase(), o = (p.get("o") ?? "").toLowerCase(), k = (p.get("k") ?? "").toLowerCase()
    if (/^[0-9a-f]{32}$/.test(c)) {
      setCircleId(c); setOrganiser(o)
      const key = /^[0-9a-f]{64}$/.test(k) ? k : null
      setKeyHex(key)
      run(c, o, key)
    }
  }, [])

  const who = (a: string) => names.get(a) ?? short(a)
  return (
    <Shell back="/">
      <h1 className="text-[1.8rem]">Read the ledger without Turn</h1>
      <p className="text-sm text-ink-muted">
        This page asks Arkiv directly from your browser (<span className="font-mono">{RPC_HTTP.replace("https://", "")}</span>). No Turn server, no account, no key needed.
        A payment counts as confirmed only if the payer&apos;s claim and the collector&apos;s receipt were each created by the right wallet from the committee&apos;s list.
      </p>
      <Card className="flex flex-col gap-3">
        <Field label="Committee id (circle_id)"><input className={`${inputCls} font-mono text-sm`} value={circleId} onChange={(e) => setCircleId(e.target.value.trim().toLowerCase())} placeholder="32 hex characters" /></Field>
        <Field label="Organiser address (optional)"><input className={`${inputCls} font-mono text-sm`} value={organiser} onChange={(e) => setOrganiser(e.target.value.trim().toLowerCase())} placeholder="0x…" /></Field>
        <Button tone="teal" busy={busy} disabled={!/^[0-9a-f]{32}$/.test(circleId)} onClick={() => run(circleId, organiser, keyHex)}>Read from Arkiv</Button>
      </Card>

      {busy && <Loading text={t("loading")} />}
      {error && <Card><p className="text-sm">{error}</p></Card>}
      {ledger === null && !busy && !error && <Card><p>No committee with this id on Tiramisu.</p></Card>}
      {ledger && (
        <>
          <Card className="flex flex-col gap-1 text-sm">
            <p>Read at block <span className="tabular font-mono">{ledger.block.toString()}</span>{names.size > 0 ? " · names decrypted on this device" : " · keyless"}</p>
            <p>Organiser (creator of the rules): <a className="font-mono text-teal-ink underline" href={`${EXPLORER}/address/${ledger.organiser}`} target="_blank" rel="noreferrer">{who(ledger.organiser)}</a></p>
            {ledger.roster ? <p>Members (public turn order): {ledger.roster.members.map((m, i) => `${i + 1}. ${who(m)}`).join("  ")}</p> : <p>Member list not locked yet.</p>}
            {ledger.ignored > 0 && <p className="text-warning">{ledger.ignored} record(s) from wallets outside the list ignored.</p>}
          </Card>
          {ledger.rounds.map((r) => (
            <Card key={r.round} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Round {r.round} · collector {who(r.collector)}</p>
                {r.result ? <Pill tone="ok">closed</Pill> : <Pill tone="none">open</Pill>}
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {r.payments.map((p) => (
                  <li key={p.payer} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{who(p.payer)}</span>
                    <span className="flex items-center gap-2">
                      <Pill tone={p.state === "confirmed" ? "ok" : p.state === "claimed" ? "wait" : "none"}>{p.state === "confirmed" ? `Paid ✓ confirmed by ${who(r.collector)}` : p.state}</Pill>
                      {p.claim && <a className="text-xs text-teal-ink underline" href={`${EXPLORER}/entity/${p.claim.key}`} target="_blank" rel="noreferrer">claim</a>}
                      {p.ack && <a className="text-xs text-teal-ink underline" href={`${EXPLORER}/entity/${p.ack.key}`} target="_blank" rel="noreferrer">receipt</a>}
                    </span>
                  </li>
                ))}
              </ul>
              {r.disputes.length > 0 && <p className="text-sm text-danger">⚠ {r.disputes.length} dispute(s) by {r.disputes.map((d) => who(d.creator)).join(", ")}</p>}
            </Card>
          ))}
          <details className="text-xs text-ink-muted">
            <summary>Queries this page ran</summary>
            {ledger.queries.map((q) => <code key={q} className="block break-all py-1">{q}</code>)}
          </details>
        </>
      )}
    </Shell>
  )
}
