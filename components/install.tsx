"use client"
/**
 * "Install Turn" pop-up. Chrome/Edge/Android: the browser's own install prompt
 * (beforeinstallprompt). iPhone/iPad Safari, which has no prompt: short Add-to-Home-Screen steps.
 * Never shown once installed (standalone), and "Not now" hides it for 7 days.
 */
import { useEffect, useState } from "react"

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const KEY = "turn-install-dismissed"
const WEEK = 7 * 86_400_000

function dismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < WEEK } catch { return false }
}
function installed() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function InstallPrompt() {
  const [mode, setMode] = useState<"none" | "prompt" | "ios">("none")
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    if (installed() || dismissedRecently()) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
      timer = setTimeout(() => setMode("prompt"), 3_000)
    }
    const onInstalled = () => setMode("none")
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    const ua = navigator.userAgent
    const iOS = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
    if (iOS) timer = setTimeout(() => setMode("ios"), 4_000)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const close = () => {
    try { localStorage.setItem(KEY, String(Date.now())) } catch {}
    setMode("none")
  }

  if (mode === "none") return null
  return (
    <div role="dialog" aria-label="Install Turn" aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-sm flex-col gap-3 rounded-3xl border border-black/10 bg-[#0e0d0c] p-4 text-white shadow-[0_24px_60px_-12px_rgb(0_0_0_/_0.5)] sm:inset-x-auto sm:right-5 sm:bottom-5"
      style={{ animation: "install-in 420ms cubic-bezier(.22,1,.36,1) both" }}>
      <div className="flex items-start gap-3">
        <img src="/icons/192" alt="" width={48} height={48} className="size-12 flex-none rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight">Install Turn on your phone</p>
          <p className="mt-1 text-sm leading-snug text-white/70">
            {mode === "prompt"
              ? "Opens from your home screen like an app, full screen, with your committees one tap away."
              : <>Tap <ShareIcon /> <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</>}
          </p>
        </div>
        <button onClick={close} aria-label="Close" className="-m-1 flex size-8 flex-none items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">✕</button>
      </div>
      {mode === "prompt" && (
        <div className="flex gap-2">
          <button className="min-h-11 flex-1 rounded-full bg-[#e8562a] px-4 text-sm font-semibold text-white hover:bg-[#f06a1f]"
            onClick={async () => {
              if (!deferred) return
              await deferred.prompt()
              const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }))
              if (choice.outcome === "accepted") setMode("none")
              else close()
              setDeferred(null)
            }}>Install app</button>
          <button className="min-h-11 rounded-full border border-white/25 px-4 text-sm font-semibold text-white/90 hover:border-white/50" onClick={close}>Not now</button>
        </div>
      )}
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden className="inline align-[-2px]">
      <path d="M7 1v9M3.5 4.5 7 1l3.5 3.5M2 7.5v6.5h10V7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
