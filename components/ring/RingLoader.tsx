import { cn } from "@/lib/cn";
import { polar } from "./geometry";
import styles from "./ring.module.css";

/** Loading state: a warm light passing seat to seat. Use for waits, not for page content (use Skeleton). */
export function RingLoader({
  size = 24,
  label = "Loading",
  decorative,
  className,
}: {
  size?: number;
  label?: string;
  /** Hidden from assistive tech, when the surrounding control already announces the wait. */
  decorative?: boolean;
  className?: string;
}) {
  const seats = 6;
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...a11y} className={cn("shrink-0", className)}>
      <g>
        {Array.from({ length: seats }, (_, i) => {
          const p = polar(12, 12, 8.5, (i * 360) / seats);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2.2}
              className={styles.loaderSeat}
              style={{ animationDelay: `${(i * 1.2) / seats}s` }}
            />
          );
        })}
      </g>
    </svg>
  );
}
