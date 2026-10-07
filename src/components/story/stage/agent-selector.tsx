"use client";

import { useId, useState } from "react";
import type { SiteContent } from "@/content/site";
import { cn } from "@/lib/utils";
import { StageFrame } from "./stage-frame";

const AGENTS = [
  "Claude",
  "Codex",
  "Cursor",
  "Kiro",
  "Hermes",
  "Antigravity",
  "OpenClaw",
  "Generic",
];

/** Chapter 04: switching agents changes only the agent identity, never the context. */
export function AgentSelector({ content }: { content: SiteContent["stage"]["agents"] }) {
  const display = (a: string) => (a === "Generic" ? content.generic : a);
  const [agent, setAgent] = useState("Claude");
  const [switches, setSwitches] = useState(0);
  const name = useId();

  const choose = (next: string) => {
    if (next === agent) return;
    setAgent(next);
    setSwitches((n) => n + 1);
  };

  return (
    <StageFrame label={content.file}>
      <fieldset>
        <legend className="mb-3 text-sm text-muted-foreground">{content.legend}</legend>
        <div className="flex flex-wrap gap-2">
          {AGENTS.map((a) => (
            <label
              key={a}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                a === agent
                  ? "border-primary text-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name={name}
                value={a}
                checked={a === agent}
                onChange={() => choose(a)}
                className="sr-only"
              />
              {display(a)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 rounded-md border border-border">
        <p className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">{content.yourAgent}</span>
          <span
            aria-live="polite"
            key={agent}
            className="font-medium [animation:node-morph_300ms_ease-out] motion-reduce:animate-none"
          >
            {display(agent)}
          </span>
        </p>
        <ul className="divide-y divide-border">
          {content.context.map((item) => (
            <li
              key={item}
              className="flex items-center justify-between px-4 py-2.5 font-mono text-[0.8125rem]"
            >
              {item}
              <span className="text-xs text-subtle-foreground">{content.unchanged}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        {content.switches}: {switches} · {content.contextChanges}:{" "}
        <span className="text-primary">0</span>
      </p>
    </StageFrame>
  );
}
