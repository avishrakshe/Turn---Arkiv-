import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { arcPath } from "./geometry";

export interface ProgressRingProps {
  /** Current round, 1-based. Rounds before it are complete. */
  round: number;
  total: number;
  size?: number;
  /** Highlight the current round as "your turn". */
  yourTurn?: boolean;
  /** Centre content. Defaults to "3/6". */
  children?: ReactNode;
  className?: string;
}

/** A circle's progress, one segment per round, so the ring motif carries into every card. */
export function ProgressRing({ round, total, size = 64, yourTurn, children, className }: ProgressRingProps) {
  const n = Math.max(total, 1);
  const slice = 360 / n;
  const gap = n > 12 ? 3 : 6;
  const stroke = size < 56 ? 5 : 6;
  const r = 50 - stroke;
  return (
    <div className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" role="img" aria-label={`Round ${round} of ${total}${yourTurn ? ", your turn" : ""}`}>
        {Array.from({ length: n }, (_, i) => {
          const done = i < round - 1;
          const current = i === round - 1;
          return (
            <path
              key={i}
              d={arcPath(50, 50, r, i * slice + gap / 2, (i + 1) * slice - gap / 2)}
              fill="none"
              strokeLinecap="round"
              strokeWidth={current ? stroke + 1.5 : stroke}
              stroke={current ? (yourTurn ? "var(--marigold)" : "var(--teal)") : done ? "var(--teal)" : "var(--line)"}
              opacity={done ? 0.55 : 1}
            />
          );
        })}
      </svg>
      <span className="tabular relative text-sm font-semibold" aria-hidden>
        {children ?? (
          <>
            {round}
            <span className="text-ink-muted font-normal">/{total}</span>
          </>
        )}
      </span>
    </div>
  );
}
