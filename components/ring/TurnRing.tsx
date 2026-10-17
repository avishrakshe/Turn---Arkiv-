import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { arcPath, avatarTone, initials, polar } from "./geometry";
import styles from "./ring.module.css";

export type SeatStatus = "paid" | "pending" | "late";

export interface RingMember {
  name: string;
  status?: SeatStatus;
}

export interface TurnRingProps {
  members: RingMember[];
  /**
   * Monotonic step counter. The highlighted seat is `step % members.length`. Keep
   * incrementing past N so the marker always travels forward around the circle.
   */
  step: number;
  /** Centre content, e.g. the pot amount. */
  center?: ReactNode;
  /** Animate a coin from the centre to the highlighted seat whenever `step` changes. */
  potFlow?: boolean;
  /** Show paid / pending / late dots on each seat. */
  showStatus?: boolean;
  /** Accessible summary. Defaults to "<name>'s turn". */
  label?: string;
  /** Hide the marker when nobody's turn is decided yet (e.g. before the first auction). */
  marker?: boolean;
  className?: string;
}

const VIEW = 400;
const C = VIEW / 2;
const R = 150;

const statusLabel: Record<SeatStatus, string> = { paid: "paid", pending: "not paid yet", late: "late" };

export function TurnRing({ members, step, center, potFlow, showStatus, label, marker = true, className }: TurnRingProps) {
  const n = Math.max(members.length, 1);
  const seat = ((step % n) + n) % n;
  const slice = 360 / n;
  // Avatar size shrinks as seats get closer together, capped for small circles.
  const avatarR = Math.min(34, ((2 * Math.PI * R) / n) * 0.3);
  const current = members[seat];
  const target = polar(C, C, R, seat * slice);

  const summary =
    label ??
    `Savings circle with ${members.length} members.` +
      (marker ? ` It's ${current?.name ?? "nobody"}'s turn.` : "") +
      (showStatus
        ? " " + members.map((m) => `${m.name}: ${statusLabel[m.status ?? "pending"]}`).join(", ") + "."
        : "");

  return (
    <div className={cn("relative aspect-square w-full", className)}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={summary} className="block size-full overflow-visible">
        {/* Track */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} strokeDasharray="2 7" strokeLinecap="round" />

        {/* Marker: rotates as a whole so it glides along the track between seats. */}
        <g className={styles.marker} style={{ transform: `rotate(${step * slice}deg)`, opacity: marker ? 1 : 0 }} aria-hidden>
          <path
            d={arcPath(C, C, R, -slice * 0.62, -avatarR * 0.9 * (180 / (Math.PI * R)))}
            fill="none"
            stroke="var(--marigold)"
            strokeWidth={5}
            strokeLinecap="round"
            className={styles.trail}
          />
          <circle cx={C} cy={C - R} r={avatarR + 9} fill="var(--marigold-soft)" className={styles.halo} />
          <circle cx={C} cy={C - R} r={avatarR + 7} fill="none" stroke="var(--marigold)" strokeWidth={4} />
          <circle cx={C} cy={C - R} r={avatarR + 9.5} fill="none" stroke="var(--marigold-ink)" strokeWidth={1} opacity={0.6} />
        </g>

        {/* Seats */}
        {members.map((m, i) => {
          const p = polar(C, C, R, i * slice);
          const tone = avatarTone(m.name);
          const active = marker && i === seat;
          const dot = polar(p.x, p.y, avatarR * 0.92, 135);
          return (
            <g key={`${m.name}-${i}`} className={cn(styles.seat, active && styles.seatActive)} style={{ transformOrigin: `${p.x}px ${p.y}px` }} aria-hidden>
              <circle cx={p.x} cy={p.y} r={avatarR} fill={`var(--av-${tone})`} stroke="var(--paper)" strokeWidth={3} />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#2b211a"
                fontSize={avatarR * 0.62}
                fontWeight={600}
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {initials(m.name)}
              </text>
              {showStatus && (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={Math.max(6, avatarR * 0.24)}
                  fill={m.status === "paid" ? "var(--success)" : m.status === "late" ? "var(--warning)" : "var(--paper-raised)"}
                  stroke={m.status === "pending" || !m.status ? "var(--ink-faint)" : "var(--paper)"}
                  strokeWidth={m.status === "pending" || !m.status ? 2 : 3}
                />
              )}
            </g>
          );
        })}

        {/* Pot flowing from the centre to whoever's turn it is, landing on top of their seat.
            Keyed on step so it replays each round. */}
        {potFlow && step > 0 && (
          <g
            key={step}
            className={styles.coin}
            style={{ "--tx": `${target.x - C}px`, "--ty": `${target.y - C}px` } as CSSProperties}
            aria-hidden
          >
            <circle cx={C} cy={C} r={11} fill="var(--marigold)" stroke="var(--marigold-ink)" strokeWidth={1.5} />
            <circle cx={C} cy={C} r={5} fill="none" stroke="var(--on-marigold)" strokeWidth={1.2} opacity={0.55} />
          </g>
        )}
      </svg>

      {center && (
        <div className="pointer-events-none absolute inset-[28%] flex flex-col items-center justify-center text-center">
          {center}
        </div>
      )}
    </div>
  );
}
