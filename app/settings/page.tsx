"use client"
import { useEffect, useState } from "react"
import { Button, Card, Shell, short } from "@/components/ui"
import { useApp } from "@/components/providers"
import { accountInfo, exportBackup, importBackup } from "@/lib/account"
import { useT } from "@/lib/i18n"
import { EXPLORER } from "@/src/arkiv/config"

const PUBLIC_ROWS: [string, string][] = [
  ["That your account wrote a Turn record, of which kind (joined, paid, received, report), in which committee id, and when", "Committee name, amount, members' names, payment method, notes, report reasons"],
  ["Round numbers, due dates of rounds, links between a payment and its confirmation", "Who is in the committee by name, and the turn order"],
  ["Which accounts write in the same committee id", "Your phone number or UPI ID — Turn never asks for them"],
  ["Size bucket of each record (padded, so amounts don't show)", "The committee key (only in the invite link and on members' phones)"],
]

export default function Settings() {
  const { t, lang, setLang } = useT()
  const { account } = useApp()
  const [info, setInfo] = useState<{ address: string; backedUp: boolean } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { accountInfo().then(setInfo) }, [account])

  return (
    <Shell back="/">
      <h1 className="text-[1.8rem]">{t("settings")}</h1>
      <Card className="flex flex-col gap-2">
        <p className="font-semibold">{t("language")}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button tone={lang === "en" ? "teal" : "quiet"} onClick={() => setLang("en")}>English</Button>
          <Button tone={lang === "hi" ? "teal" : "quiet"} onClick={() => setLang("hi")}>हिन्दी</Button>
        </div>
      </Card>

      {info && (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">{t("myAddress")}</p>
          <a className="font-mono text-sm text-teal-ink underline" href={`${EXPLORER}/address/${info.address}`} target="_blank" rel="noreferrer">{short(info.address)}</a>
          <p className="font-semibold">{t("backup")}</p>
          <p className="text-sm text-ink-muted">{t("backupHint")}</p>
          <Button tone="quiet" onClick={async () => {
            const text = await exportBackup()
            const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
            const a = document.createElement("a")
            a.href = url; a.download = "turn-backup.json"; a.click()
            URL.revokeObjectURL(url)
            setInfo({ ...info, backedUp: true })
          }}>{t("download")}{info.backedUp ? " ✓" : ""}</Button>
        </Card>
      )}
      <Card className="flex flex-col gap-2">
        <p className="font-semibold">{t("restore")}</p>
        <input type="file" accept="application/json" className="text-sm" onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try { const a = await importBackup(await f.text()); setMsg(`✓ ${short(a)}`); location.href = "/" } catch { setMsg(t("error")) }
        }} />
        {msg && <p className="text-sm">{msg}</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="font-semibold">{t("whatsPublic")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead><tr className="text-ink-muted"><th className="pb-2 pe-3 text-start font-medium">Anyone on the explorer sees</th><th className="pb-2 text-start font-medium">Only members (encrypted)</th></tr></thead>
            <tbody>
              {PUBLIC_ROWS.map(([pub, priv]) => (
                <tr key={pub} className="border-t border-line align-top"><td className="py-2 pe-3">{pub}</td><td className="py-2">{priv}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">Money never touches Turn or Arkiv: you pay on UPI or in cash as always.</p>
      </Card>
    </Shell>
  )
}
