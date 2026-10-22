/** Plain-text form fields to the lists a skill stores. Pure; the server validates the result. */

export const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** "Title: detail" per line; a line without a colon is a title with no detail. */
export function parseSteps(text: string): { title: string; detail: string }[] {
  return lines(text).map((l) => {
    const i = l.indexOf(":");
    return i > 0
      ? { title: l.slice(0, i).trim(), detail: l.slice(i + 1).trim() }
      : { title: l, detail: "" };
  });
}

export const stepsText = (steps: { title: string; detail: string }[]) =>
  steps.map((s) => (s.detail ? `${s.title}: ${s.detail}` : s.title)).join("\n");
