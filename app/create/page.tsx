"use client"
import Link from "next/link"
import { useState } from "react"
import { Button, Card, Field, inputCls, Shell } from "@/components/ui"
import { useApp } from "@/components/providers"
import { ShareInvite } from "@/components/share"
import { createCircle, WriteFailed } from "@/lib/actions"
import { useT, type MsgKey } from "@/lib/i18n"
import type { CircleBody, Frequency, Template } from "@/src/core/bodies"
import { inr } from "@/src/core/money"

const TEMPLATES: { id: Exclude<Template, "custom">; amount: number; members: number; name: string }[] = [
  { id: "family_bc", amount: 5000, members: 5, name: "Sharma Family BC" },
  { id: "office", amount: 2000, members: 10, name: "Office committee" },
  { id: "kitty", amount: 1000, members: 8, name: "Kitty party" },
  { id: "wedding", amount: 10000, members: 6, name: "Wedding fund" },
]

export default function CreatePage() {
  const { t, lang } = useT()
  const { account, start } = useApp()
  const [tpl, setTpl] = useState<(typeof TEMPLATES)[number]>(TEMPLATES[0]!)
  const [name, setName] = useState(TEMPLATES[0]!.name)
  const [amount, setAmount] = useState(TEMPLATES[0]!.amount)
  const [members, setMembers] = useState(TEMPLATES[0]!.members)
  const [frequency, setFrequency] = useState<Frequency>("monthly")
  const [dueDays, setDueDays] = useState(7)
  const [me, setMe] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ circleId: string; organiser: `0x${string}`; keyHex: string } | null>(null)

  const pick = (x: (typeof TEMPLATES)[number]) => { setTpl(x); setName(x.name); setAmount(x.amount); setMembers(x.members) }

  async function submit() {
    setBusy(true); setError(null)
    try {
      const acct = account ?? (await start())
      const rules: CircleBody = {
        name: name.trim(), template: tpl.id, amount_inr: amount, members, frequency, mode: "fixed",
        start_ms: Date.now(), due_days: frequency === "demo" ? 0 : dueDays, max_discount_bps: 0, reveal_window_ms: 0, organiser_first: true,
      }
      const r = await createCircle(acct, rules, me.trim(), lang)
      setDone(r)
    } catch (e) {
      setError(e instanceof WriteFailed && e.outcome.status === "unconfirmed" ? t("unconfirmed") : t("error"))
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <Shell back="/app">
        <h1 className="text-[1.8rem]">{t("share")}</h1>
        <p className="text-sm text-success">✓ {t("saved")}</p>
        <ShareInvite circle={done} name={name} amount={amount} members={members} />
        <Link href={`/circle?id=${done.circleId}`}><Button tone="teal" className="w-full">{name} →</Button></Link>
      </Shell>
    )
  }

  const valid = name.trim().length > 0 && me.trim().length > 0 && amount >= 100 && members >= 3 && members <= 20
  return (
    <Shell back="/app">
      <h1 className="text-[1.8rem]">{t("create")}</h1>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("template")}>
        {TEMPLATES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={tpl.id === x.id} onClick={() => pick(x)}
            className={`rounded-2xl border p-3 text-start ${tpl.id === x.id ? "border-teal bg-teal-soft" : "border-line bg-paper-raised"}`}>
            <span className="block font-semibold">{t(`tpl_${x.id}` as MsgKey)}</span>
            <span className="tabular text-sm text-ink-muted">{inr(x.amount)} × {x.members}</span>
          </button>
        ))}
      </div>
      <Card className="flex flex-col gap-4">
        <Field label={t("name")}><input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("amount")}>
            <input className={`${inputCls} tabular`} inputMode="numeric" value={amount} onChange={(e) => setAmount(Math.min(1_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))} />
          </Field>
          <Field label={t("members")}>
            <input className={`${inputCls} tabular`} type="number" min={3} max={20} value={members} onChange={(e) => setMembers(Number(e.target.value))} />
          </Field>
        </div>
        <Field label={t("frequency")}>
          <select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            <option value="monthly">{t("monthly")}</option>
            <option value="weekly">{t("weekly")}</option>
            <option value="demo">{t("demo")}</option>
          </select>
        </Field>
        {frequency !== "demo" && (
          <Field label={t("dueDays")}>
            <input className={`${inputCls} tabular`} type="number" min={0} max={30} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} />
          </Field>
        )}
        <Field label={t("yourName")} hint={t("syntheticNote")}>
          <input className={inputCls} value={me} maxLength={40} placeholder="Meera S." onChange={(e) => setMe(e.target.value)} />
        </Field>
        <p className="tabular text-sm">{t("potIs")}: <strong>{inr(amount * members)}</strong></p>
        <p className="text-xs text-ink-muted">{t("rulesLocked")}</p>
      </Card>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button busy={busy} disabled={!valid} onClick={submit}>{busy ? t("saving") : t("createBtn")}</Button>
    </Shell>
  )
}
