/**
 * Whether a fenced code block is a Mermaid diagram: ```mermaid. Pure, so the renderer and its
 * tests share one rule. Anything else stays an ordinary code block.
 */
export const MERMAID_LANGUAGE = /(^|\s)language-mermaid(\s|$)/;

export const isMermaidClass = (className: string | string[] | undefined): boolean =>
  MERMAID_LANGUAGE.test(Array.isArray(className) ? className.join(" ") : (className ?? ""));

/** The diagram text without the trailing newline react-markdown leaves on a fenced block. */
export const mermaidSource = (children: unknown): string =>
  (Array.isArray(children) ? children.join("") : String(children ?? "")).replace(/\n$/, "");
