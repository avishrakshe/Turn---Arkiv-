"use client"
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { createAccount, loadAccount } from "@/lib/account"
import { I18nProvider } from "@/lib/i18n"

type Toast = { id: number; text: string; tone: "ok" | "info" | "warn" }
type AppCtx = {
  account: PrivateKeyAccount | null
  ready: boolean
  start: () => Promise<PrivateKeyAccount>
  toast: (text: string, tone?: Toast["tone"]) => void
}

const App = createContext<AppCtx | null>(null)

export function Providers({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null)
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    loadAccount().then(setAccount).catch(() => setAccount(null)).finally(() => setReady(true))
  }, [])

  const start = useCallback(async () => {
    const a = await createAccount()
    setAccount(a)
    return a
  }, [])

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5_000)
  }, [])

  return (
    <I18nProvider>
      <App.Provider value={{ account, ready, start, toast }}>
        {children}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div key={t.id} className={`toast pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-[var(--shadow-soft)] ${
              t.tone === "ok" ? "bg-teal text-on-teal" : t.tone === "warn" ? "bg-warning-soft text-ink" : "bg-paper-raised text-ink border border-line"}`}>
              {t.text}
            </div>
          ))}
        </div>
      </App.Provider>
    </I18nProvider>
  )
}

export function useApp() {
  const c = useContext(App)
  if (!c) throw new Error("Providers missing")
  return c
}
