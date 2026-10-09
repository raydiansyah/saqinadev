"use client";

import { useEffect, useState } from "react";

/** Types one example question at a time, like someone asking Saqina. Static with reduced motion. */
export function PromptCycle({ prompts }: { prompts: string[] }) {
  const [index, setIndex] = useState(0);
  const [chars, setChars] = useState(prompts[0]?.length ?? 0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let n = 0;
    let timer = 0;
    const tick = () => {
      const text = prompts[i];
      if (n < text.length) {
        n += 1;
        setChars(n);
        timer = window.setTimeout(tick, 45);
      } else {
        timer = window.setTimeout(() => {
          i = (i + 1) % prompts.length;
          n = 0;
          setIndex(i);
          setChars(0);
          tick();
        }, 1800);
      }
    };
    setChars(0);
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [prompts]);

  return (
    <p className="min-h-12 font-mono text-sm">
      <span className="text-primary">&gt; </span>
      {prompts[index].slice(0, chars)}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary"
      />
    </p>
  );
}
