"use client"
import Link from "next/link"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"
import { useT } from "@/lib/i18n"
import { EXPLORER } from "@/src/arkiv/config"
import { RingLoader } from "./ring/RingLoader"

export function Shell({ children, back }: { children: ReactNode; back?: string }) {
  const { lang, setLang, t } = useT()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          {back && (
            <Link href={back} className="-ms-2 rounded-full px-2 py-1 text-sm text-ink-muted hover:text-ink" aria-label={t("back")}>←</Link>
          )}
          <Link href="/app" className="inline-flex items-center gap-2" aria-label="Turn">
            <span lang="en" className="text-[1.6rem] leading-none font-extrabold tracking-[-0.04em]">Turn</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="rounded-full border border-line px-3 py-1 text-sm hover:border-line-strong" aria-label={t("language")}>
            {lang === "en" ? "हिं" : "EN"}
          </button>
          <Link href="/settings" className="rounded-full px-3 py-1 text-sm text-ink-muted hover:text-ink">{t("settings")}</Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "teal" | "quiet" | "danger"; busy?: boolean }
export function Button({ tone = "primary", busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || busy}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition-[background-color,transform] hover:-translate-y-px active:translate-y-0 disabled:opacity-55 disabled:hover:translate-y-0",
        tone === "primary" && "bg-[#e8562a] text-white hover:bg-[#f06a1f]",
        tone === "teal" && "bg-ink text-paper hover:bg-ink/85",
        tone === "quiet" && "border border-line bg-paper-raised text-ink hover:border-line-strong",
        tone === "danger" && "border border-danger/40 bg-danger-soft text-danger",
        className,
      )}>
      {busy && <RingLoader size={18} decorative />}
      {children}
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[var(--radius-card)] border border-line bg-paper-raised p-4 shadow-[var(--shadow-soft)]", className)}>{children}</section>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

export const inputCls = "min-h-12 w-full rounded-xl border border-line-strong bg-paper px-3 text-base text-ink placeholder:text-ink-faint"

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** "Signed by <name> · 0x12…ab · View on explorer" — on every record. */
export function Stamp({ name, address, txHash, entityKey, className }: { name: string; address: string; txHash?: string; entityKey?: string; className?: string }) {
  const { t } = useT()
  const href = txHash ? `${EXPLORER}/tx/${txHash}` : entityKey ? `${EXPLORER}/entity/${entityKey}` : `${EXPLORER}/address/${address}`
  return (
    <p className={cn("text-xs text-ink-muted", className)}>
      {t("signedBy", { name })} · <a className="font-mono underline-offset-2 hover:underline" href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{short(address)}</a>
      {" · "}<a className="text-teal-ink underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{t("viewExplorer")}</a>
    </p>
  )
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-ink-muted" role="status">
      <RingLoader size={24} decorative /> {text}
    </div>
  )
}

export function Pill({ tone, children }: { tone: "ok" | "wait" | "bad" | "none"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
      tone === "ok" && "bg-success-soft text-success", tone === "wait" && "bg-warning-soft text-warning",
      tone === "bad" && "bg-danger-soft text-danger", tone === "none" && "bg-paper-sunk text-ink-muted")}>{children}</span>
  )
}

export function formatDate(d: Date, lang: string, withTime = false) {
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", ...(withTime && { hour: "2-digit", minute: "2-digit" }) })
}
