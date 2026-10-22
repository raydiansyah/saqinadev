"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

type State = { status: "loading" } | { status: "ready"; svg: string } | { status: "error" };

let initialised = false;

/**
 * One Mermaid diagram from a ```mermaid block. The library loads only when a document actually
 * holds a diagram. Rendering runs with the "strict" security level and the result is shown as
 * an image, so a diagram written by someone else cannot run scripts; if the text is not valid Mermaid, the
 * source is shown instead of an empty box.
 */
export default function MermaidDiagram({ chart }: { chart: string }) {
  const t = useTranslations("documents.diagram");
  // Mermaid uses the id as a DOM id: strip the colons React puts in it.
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        if (!initialised) {
          // Plain SVG text, no HTML labels: an <img> shows them reliably, and they need no markup.
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "dark",
            htmlLabels: false,
          });
          initialised = true;
        }
        // Validate first: render() leaves an error element in the page when the text is invalid.
        await mermaid.parse(chart);
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setState({ status: "ready", svg });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (state.status === "error")
    return (
      <figure className="not-prose">
        <p role="alert" className="mb-2 text-sm text-warning">
          {t("invalid")}
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-surface p-3 text-sm">
          <code>{chart}</code>
        </pre>
      </figure>
    );
  if (state.status === "loading")
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  // An <img>, not inline HTML: an SVG shown this way cannot run scripts or load anything, so the
  // text of a diagram, which anyone who can edit a document writes, never becomes live markup.
  return (
    // biome-ignore lint/performance/noImgElement: a generated data URI, nothing to optimise
    <img
      alt={t("label")}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.svg)}`}
      className="mx-auto h-auto max-w-full rounded-md border border-border bg-surface p-3"
    />
  );
}
