/**
 * The Two-half Seal: Turn's picture of two-party confirmation.
 *
 *   left half  (marigold) = the payer's own record  "I've paid"
 *   right half (teal)     = the collector's record  "Received"
 *   both halves           = the seal locks: a ring closes around it and a check appears
 *   dispute               = a crack runs through the seal
 *
 * Pure SVG + CSS transitions (no layout shift: fixed square box), reduced-motion safe.
 */
import type { PaymentState } from "@/src/core/payments"
import styles from "./seal.module.css"

export function Seal({ state, size = 56, label }: { state: PaymentState | "self"; size?: number; label?: string }) {
  const payer = state === "claimed" || state === "confirmed" || state === "disputed"
  const collector = state === "confirmed"
  const locked = state === "confirmed"
  const cracked = state === "disputed"
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label ?? state}
      className={`${styles.seal} ${locked ? styles.locked : ""} ${cracked ? styles.cracked : ""}`} style={{ flex: "none" }}>
      {/* outer ring: dashed while open, solid once locked */}
      <circle cx="32" cy="32" r="29" className={styles.ring} />
      {/* payer half (left) */}
      <path d="M31 6 A26 26 0 0 0 31 58 Z" className={`${styles.half} ${styles.left} ${payer ? styles.payerOn : ""}`} />
      {/* collector half (right) */}
      <path d="M33 6 A26 26 0 0 1 33 58 Z" className={`${styles.half} ${styles.right} ${collector ? styles.collectorOn : ""}`} />
      {/* the seam between the halves */}
      <line x1="32" y1="6" x2="32" y2="58" className={styles.seam} />
      {/* lock: check mark */}
      <path d="M22 33 l7 7 l13 -15" className={styles.check} />
      {/* dispute crack */}
      <path d="M36 8 L28 22 L37 30 L27 42 L34 56" className={styles.crack} />
      {state === "self" && <text x="32" y="37" textAnchor="middle" className={styles.selfText}>₹</text>}
    </svg>
  )
}
