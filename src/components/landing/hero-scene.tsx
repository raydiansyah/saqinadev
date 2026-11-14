"use client";

import Image from "next/image";
import { type CSSProperties, type PointerEvent, useRef } from "react";
import type { SiteContent } from "@/content/site";
import { LANDING_ASSETS } from "@/content/site/assets";
import { cn } from "@/lib/utils";

type Cards = SiteContent["hero"]["cards"];

/** Where each floating card sits around the object, and how far it floats toward the viewer. */
const AROUND = [
  "left-0 top-[8%]",
  "right-0 top-[22%]",
  "left-[4%] bottom-[24%]",
  "right-[2%] bottom-[8%]",
  "left-[30%] -bottom-[2%]",
];

function Card({
  card,
  className,
  style,
}: {
  card: Cards[number];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "scene-card absolute rounded-lg border border-border-strong bg-surface/85 px-3.5 py-2.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-sm",
        className,
      )}
      style={style}
    >
      <p className="font-mono text-[0.625rem] uppercase tracking-wide text-primary">{card.label}</p>
      <p className="mt-0.5 truncate text-[0.8125rem]">{card.value}</p>
    </div>
  );
}

/**
 * Hero 3D scene. The generated glass "project hub" turns toward the pointer while project
 * cards float around it at different depths. Without the asset, the cards form the object.
 */
export function HeroScene({ cards }: { cards: Cards }) {
  const stack = useRef<HTMLDivElement>(null);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !stack.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    stack.current.style.setProperty("--ry", `${x * 18}deg`);
    stack.current.style.setProperty("--rx", `${-y * 14}deg`);
  };
  const onLeave = () => {
    stack.current?.style.removeProperty("--ry");
    stack.current?.style.removeProperty("--rx");
  };

  const asset = LANDING_ASSETS.hero;
  return (
    <div
      aria-hidden="true"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="scene intro relative mx-auto aspect-square w-full max-w-lg"
      style={{ "--d": "400ms" } as CSSProperties}
    >
      <div className="absolute inset-[20%] rounded-full bg-primary/15 blur-3xl" />
      {asset ? (
        <div
          ref={stack}
          className="scene-stack absolute inset-0"
          style={{ "--rx": "0deg", "--ry": "0deg" } as CSSProperties}
        >
          <Image
            src={asset}
            alt=""
            width={1024}
            height={1024}
            priority
            sizes="(min-width: 1024px) 512px, 90vw"
            // The render has a black background; screen blending drops it on the dark page.
            className="absolute inset-[6%] h-[88%] w-[88%] object-contain mix-blend-screen [mask-image:radial-gradient(closest-side,black_70%,transparent)]"
          />
          {cards.slice(0, AROUND.length).map((card, i) => (
            <Card
              key={card.label}
              card={card}
              className={cn("w-[42%] max-w-52", AROUND[i], i > 2 && "hidden sm:block")}
              style={
                {
                  "--z": `${60 + (i % 3) * 30}px`,
                  "--float-delay": `${i * 500}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : (
        <div ref={stack} className="scene-stack absolute inset-x-[14%] inset-y-[19%]">
          {cards.map((card, i) => (
            <Card
              key={card.label}
              card={card}
              className="inset-x-0"
              style={
                {
                  top: `${i * 17}%`,
                  "--z": `${(cards.length - i) * 22}px`,
                  "--float-delay": `${i * 400}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
