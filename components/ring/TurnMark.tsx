import { cn } from "@/lib/cn";
import { polar } from "./geometry";

/**
 * The Turn logo: six seats on a ring, one of them lit. The lit seat sits at 2 o'clock,
 * mid-journey, so the mark reads as "moving" even when static. Mirrors public/icon.svg.
 */
export function TurnMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  const seats = 6;
  const lit = 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx={16} cy={16} r={11} fill="none" stroke="var(--teal)" strokeWidth={1.6} opacity={0.35} />
      {Array.from({ length: seats }, (_, i) => {
        const p = polar(16, 16, 11, (i * 360) / seats);
        return i === lit ? (
          <circle key={i} cx={p.x} cy={p.y} r={4.6} fill="var(--marigold)" stroke="var(--paper)" strokeWidth={1.5} />
        ) : (
          <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="var(--teal)" />
        );
      })}
    </svg>
  );
}

export function TurnLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <TurnMark size={30} />
      {/* lang="en": the wordmark stays in Fraunces whatever the UI language. */}
      <span lang="en" className="font-display text-[1.45rem] leading-none font-semibold tracking-tight" style={{ fontVariationSettings: '"SOFT" 100, "opsz" 48' }}>
        Turn
      </span>
    </span>
  );
}
