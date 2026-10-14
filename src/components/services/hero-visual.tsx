import { SERVICE_ICONS } from "@/lib/domain/services";
import { ServiceIcon } from "./service-icon";

// Nodes sit on a ring around the hub; positions are percentages of the square canvas.
const NODES = [
  { icon: SERVICE_ICONS[0], x: 50, y: 10 },
  { icon: SERVICE_ICONS[1], x: 88, y: 36 },
  { icon: SERVICE_ICONS[2], x: 74, y: 82 },
  { icon: SERVICE_ICONS[3], x: 26, y: 82 },
  { icon: SERVICE_ICONS[4], x: 12, y: 36 },
] as const;

/** Five service areas wired to one hub. Static: the structure is the message, not motion. */
export function HeroVisual({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative mx-auto aspect-square w-full max-w-sm rounded-lg border border-border bg-surface"
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full">
        {NODES.map((n) => (
          <line
            key={n.icon}
            x1="50"
            y1="50"
            x2={n.x}
            y2={n.y}
            stroke="var(--border-strong)"
            strokeWidth="0.6"
            strokeDasharray="2 2"
          />
        ))}
        <circle cx="50" cy="50" r="9" fill="var(--primary)" />
      </svg>
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-primary-foreground"
      >
        S
      </span>
      {NODES.map((n) => (
        <span
          key={n.icon}
          aria-hidden="true"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
          className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border-strong bg-background text-primary"
        >
          <ServiceIcon name={n.icon} className="size-5" />
        </span>
      ))}
    </div>
  );
}
