"use client"
import { useState } from "react"
import { Button, Card, Field, HeroPanel, inputCls, PageHeader, PillLink, SectionTitle, Shell, Stat } from "@/components/ui"
import { Seal } from "@/components/seal"
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
      <Shell back="/app" width="lg">
        <PageHeader eyebrow={`✓ ${t("saved")}`} title={t("share")} meta={name} />
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <ShareInvite circle={done} name={name} amount={amount} members={members} />
          <HeroPanel className="flex flex-col justify-between gap-6">
            <Seal state="claimed" size={72} label="" />
            <p className="text-lg font-semibold leading-snug">{t("waitingMembers")}. {members - 1 === 1 ? t("seatLeft") : t("seatsLeft", { n: members - 1 })}.</p>
            <PillLink href={`/circle?id=${done.circleId}`} tone="light">{t("open")} {name}</PillLink>
          </HeroPanel>
        </div>
      </Shell>
    )
  }

  const valid = name.trim().length > 0 && me.trim().length > 0 && amount >= 100 && members >= 3 && members <= 20
  const pot = amount * members
  return (
    <Shell back="/app" width="xl">
      <PageHeader eyebrow={t("createEyebrow")} title={t("create")} meta={t("rulesLocked")} />
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-4">
            <SectionTitle n="01">{t("sectionType")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label={t("template")}>
              {TEMPLATES.map((x, i) => {
                const on = tpl.id === x.id
                return (
                  <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => pick(x)}
                    className={`flex min-h-32 flex-col justify-between rounded-[1.2rem] border p-4 text-start transition-colors ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised hover:border-ink"}`}>
                    <span className={`text-xs font-semibold ${on ? "text-paper/60" : "text-ink-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex flex-col gap-1">
                      <span className="font-bold leading-tight">{t(`tpl_${x.id}` as MsgKey)}</span>
                      <span className={`tabular text-sm ${on ? "text-paper/70" : "text-ink-muted"}`}>{inr(x.amount)} × {x.members}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <SectionTitle n="02">{t("sectionRules")}</SectionTitle>
            <Card className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label={t("name")}><input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field></div>
              <Field label={t("amount")}>
                <input className={`${inputCls} tabular`} inputMode="numeric" value={amount} onChange={(e) => setAmount(Math.min(1_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))} />
              </Field>
              <Field label={t("members")}>
                <input className={`${inputCls} tabular`} type="number" min={3} max={20} value={members} onChange={(e) => setMembers(Number(e.target.value))} />
              </Field>
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
            </Card>
          </section>

          <section className="flex flex-col gap-4">
            <SectionTitle n="03">{t("sectionYou")}</SectionTitle>
            <Card>
              <Field label={t("yourName")} hint={t("syntheticNote")}>
                <input className={inputCls} value={me} maxLength={40} placeholder="Meera S." onChange={(e) => setMe(e.target.value)} />
              </Field>
            </Card>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <HeroPanel className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">{t("summary")}</p>
              <span className="[--line-strong:rgb(255_255_255/.7)] [--paper-sunk:rgb(255_255_255/.18)] [--paper:#fff] [--marigold:#ffd089] [--marigold-ink:#fff]"><Seal state="claimed" size={44} label="" /></span>
            </div>
            <p className="text-2xl font-bold leading-tight tracking-[-0.03em]">{name.trim() || "—"}</p>
            <div className="grid grid-cols-2 gap-4">
              <Stat light label={t("potEach")} value={inr(pot)} />
              <Stat light label={t("perMember")} value={inr(amount)} />
              <Stat light label={t("rounds")} value={members} />
              <Stat light label={t("frequency")} value={t(frequency as MsgKey)} />
            </div>
          </HeroPanel>
          {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger" role="alert">{error}</p>}
          <Button arrow busy={busy} disabled={!valid} onClick={submit} className="w-full">{busy ? t("saving") : t("createBtn")}</Button>
        </aside>
      </div>
    </Shell>
  )
}
