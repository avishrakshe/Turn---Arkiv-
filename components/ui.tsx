"use client"
/**
 * App design system: the landing page's editorial language for the product.
 * Cream paper, near-black ink, ember/marigold accent; bold Urbanist headings with tight tracking;
 * pill buttons; hairline-bordered panels; uppercase eyebrows; orange "hero" panels.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"
import { useT } from "@/lib/i18n"
import { EXPLORER } from "@/src/arkiv/config"
import { RingLoader } from "./ring/RingLoader"

export const Arrow = ({ className }: { className?: string }) => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className={cn("flex-none transition-transform duration-200 group-hover:rotate-45", className)}>
    <path d="M3 11 11 3M5 3h6v6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** App frame: full-width top bar + content area. `width` picks the reading width of the page. */
export function Shell({ children, back, width = "md" }: { children: ReactNode; back?: string; width?: "md" | "lg" | "xl" }) {
  const { lang, setLang, t } = useT()
  const path = usePathname()
  const nav = [
    { href: "/app", label: t("navCommittees"), on: path === "/app" || path === "/circle" || path === "/create" || path === "/join" },
    { href: "/verify", label: t("navVerify"), on: path === "/verify" },
    { href: "/settings", label: t("settings"), on: path === "/settings" },
  ]
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          {back && (
            <Link href={back} aria-label={t("back")}
              className="-ms-1 flex size-9 flex-none items-center justify-center rounded-full border border-line text-ink-muted hover:border-ink hover:text-ink">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          )}
          <Link href="/" lang="en" className="text-[1.55rem] font-extrabold leading-none tracking-[-0.045em]" aria-label="Turn home">Turn</Link>
          <nav className="ms-auto hidden items-center gap-1 sm:flex" aria-label="App">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}
                className={cn("rounded-full px-3.5 py-2 text-sm font-semibold transition-colors", n.on ? "bg-ink text-paper" : "text-ink-muted hover:text-ink")}>{n.label}</Link>
            ))}
          </nav>
          <button type="button" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label={t("language")}
            className="ms-auto flex h-9 min-w-9 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold hover:border-ink sm:ms-1">
            {lang === "en" ? "हिं" : "EN"}
          </button>
          <Link href="/settings" aria-label={t("settings")} className="flex size-9 items-center justify-center rounded-full border border-line hover:border-ink sm:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </Link>
        </div>
      </header>
      <main className={cn("mx-auto flex w-full flex-1 flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10",
        width === "md" && "max-w-2xl", width === "lg" && "max-w-4xl", width === "xl" && "max-w-6xl")}>{children}</main>
    </div>
  )
}

/** Page title block: uppercase eyebrow, big tight title, optional meta line and right-side slot. */
export function PageHeader({ eyebrow, title, meta, aside }: { eyebrow?: ReactNode; title: ReactNode; meta?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#e8562a]">{eyebrow}</p>}
        <h1 className="text-[clamp(2.1rem,6vw,3.4rem)] font-bold leading-[0.98] tracking-[-0.04em]">{title}</h1>
        {meta && <div className="text-[0.95rem] text-ink-muted">{meta}</div>}
      </div>
      {aside && <div className="flex-none">{aside}</div>}
    </div>
  )
}

/** Section label used inside pages ("01 · Rules"). */
export function SectionTitle({ n, children, aside }: { n?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
      <h2 className="flex items-baseline gap-3 text-lg font-bold tracking-[-0.02em]">
        {n && <span className="text-sm font-semibold text-ink-muted">{n}</span>}{children}
      </h2>
      {aside}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "teal" | "quiet" | "danger" | "light"; busy?: boolean; arrow?: boolean }
export function Button({ tone = "primary", busy, arrow, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || busy}
      className={cn(
        "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.95rem] font-semibold transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0",
        tone === "primary" && "bg-[#e8562a] text-white hover:bg-[#d84a20]",
        tone === "teal" && "bg-ink text-paper hover:bg-[#2a2622]",
        tone === "quiet" && "border border-ink/20 bg-transparent text-ink hover:border-ink",
        tone === "danger" && "border border-danger/40 bg-danger-soft text-danger hover:border-danger",
        tone === "light" && "bg-white text-[#e8562a] hover:bg-white/90",
        className,
      )}>
      {busy && <RingLoader size={18} decorative />}
      {children}
      {arrow && !busy && <Arrow />}
    </button>
  )
}

/** Navigational pill (a Link styled like a Button). */
export function PillLink({ href, tone = "primary", children, className }: { href: string; tone?: "primary" | "teal" | "quiet" | "light"; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(
      "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.95rem] font-semibold transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px",
      tone === "primary" && "bg-[#e8562a] text-white hover:bg-[#d84a20]",
      tone === "teal" && "bg-ink text-paper hover:bg-[#2a2622]",
      tone === "quiet" && "border border-ink/20 text-ink hover:border-ink",
      tone === "light" && "bg-white text-[#e8562a]",
      className)}>
      {children}<Arrow />
    </Link>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[1.4rem] border border-line bg-paper-raised p-5 sm:p-6", className)}>{children}</section>
}

/** The orange hero panel (same gradient as the landing page band). */
export function HeroPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("relative isolate overflow-hidden rounded-[1.6rem] p-6 text-white sm:p-8", className)}
      style={{ background: "radial-gradient(28rem 18rem at 85% 0%, rgb(255 196 120 / 0.55), transparent 60%), linear-gradient(125deg, #8f220b, #e8562a 48%, #f4a340)" }}>
      {children}
    </section>
  )
}

/** Dark panel (landing "process" section). */
export function DarkPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[1.6rem] bg-[#0e0d0c] p-6 text-[#f2ede6] sm:p-8", className)}>{children}</section>
}

export function Stat({ label, value, light }: { label: string; value: ReactNode; light?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn("text-[0.7rem] font-bold uppercase tracking-[0.14em]", light ? "text-white/70" : "text-ink-muted")}>{label}</span>
      <span className="tabular truncate text-xl font-bold tracking-[-0.02em]">{value}</span>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[0.8rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

export const inputCls = "min-h-12 w-full rounded-2xl border border-line-strong/70 bg-paper-raised px-4 text-base font-medium text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** "Signed by <name> · 0x12…ab · View on explorer" — on every record. */
export function Stamp({ name, address, txHash, entityKey, className }: { name: string; address: string; txHash?: string; entityKey?: string; className?: string }) {
  const { t } = useT()
  const href = txHash ? `${EXPLORER}/tx/${txHash}` : entityKey ? `${EXPLORER}/entity/${entityKey}` : `${EXPLORER}/address/${address}`
  return (
    <p className={cn("text-xs text-ink-muted", className)}>
      {t("signedBy", { name })} · <a className="font-mono underline-offset-2 hover:underline" href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{short(address)}</a>
      {" · "}<a className="font-semibold text-ink underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{t("viewExplorer")}</a>
    </p>
  )
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-4 py-6" role="status" aria-label={text}>
      <div className="flex items-center gap-3 text-ink-muted"><RingLoader size={22} decorative /> {text}</div>
      <div className="h-40 animate-pulse rounded-[1.6rem] bg-paper-sunk" />
      <div className="h-24 animate-pulse rounded-[1.4rem] bg-paper-sunk/70" />
    </div>
  )
}

export function Pill({ tone, children }: { tone: "ok" | "wait" | "bad" | "none"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
      tone === "ok" && "bg-success-soft text-success", tone === "wait" && "bg-warning-soft text-warning",
      tone === "bad" && "bg-danger-soft text-danger", tone === "none" && "bg-paper-sunk text-ink-muted")}>{children}</span>
  )
}

export function formatDate(d: Date, lang: string, withTime = false) {
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", ...(withTime && { hour: "2-digit", minute: "2-digit" }) })
}
