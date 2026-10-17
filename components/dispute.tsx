"use client"
import { useState } from "react"
import { Button, Field, inputCls } from "./ui"
import { useT, type MsgKey } from "@/lib/i18n"
import type { DisputeReason } from "@/src/core/bodies"

const REASONS: DisputeReason[] = ["not_received", "wrong_amount", "wrong_result", "other"]

export function DisputeSheet({ label, busy, onClose, onSend }: { label: string; busy: boolean; onClose: () => void; onSend: (r: DisputeReason, note: string) => void }) {
  const { t } = useT()
  const [reason, setReason] = useState<DisputeReason>("not_received")
  const [note, setNote] = useState("")
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={t("disputeTitle")} onClick={onClose}>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl">{t("disputeTitle")}</h2>
        <p className="text-sm text-ink-muted">{label}</p>
        <div className="flex flex-col gap-2" role="radiogroup">
          {REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
              className={`rounded-xl border px-3 py-2.5 text-start ${reason === r ? "border-danger bg-danger-soft" : "border-line"}`}>{t(`reason_${r}` as MsgKey)}</button>
          ))}
        </div>
        <Field label={t("note")} hint={t("syntheticNote")}>
          <input className={inputCls} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-muted">{t("disputeHint")}</p>
        <Button tone="danger" busy={busy} onClick={() => onSend(reason, note.trim())}>{t("send")}</Button>
      </div>
    </div>
  )
}
