import Image from "next/image";
import type { CSSProperties } from "react";
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

/**
 * Five service areas wired to the Saqina hub. Every wire sends a packet to its node, the node
 * pulses when it lands, and the hub carries the saqina.dev mark. Motion lives in globals.css
 * (net-*) and stops under prefers-reduced-motion, leaving the same static diagram.
 */
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
            className="net-wire"
            x1="50"
            y1="50"
            x2={n.x}
            y2={n.y}
            stroke="var(--border-strong)"
            strokeWidth="0.6"
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={n.icon}
            className="net-packet"
            cx="50"
            cy="50"
            r="1.6"
            fill="var(--primary)"
            style={{ "--i": i, "--dx": n.x - 50, "--dy": n.y - 50 } as CSSProperties}
          />
        ))}
      </svg>
      {NODES.map((n, i) => (
        <span
          key={n.icon}
          aria-hidden="true"
          style={{ left: `${n.x}%`, top: `${n.y}%`, "--i": i } as CSSProperties}
          className="absolute size-11 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="net-ping absolute inset-0 rounded-full border border-primary" />
          <span className="net-node relative grid size-full place-items-center rounded-full border border-border-strong bg-background text-primary">
            <ServiceIcon name={n.icon} className="size-5" />
          </span>
        </span>
      ))}
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center"
      >
        <span className="net-halo absolute -inset-4 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_30%,transparent),transparent_68%)]" />
        <span className="net-hub relative grid size-full place-items-center rounded-full border border-primary/60 bg-background">
          <Image
            src="/brand/logo-mark-light.png"
            alt=""
            width={40}
            height={40}
            priority
            className="size-10"
          />
        </span>
      </span>
    </div>
  );
}
