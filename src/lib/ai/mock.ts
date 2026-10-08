import { type AiProvider, type AiRequest, AiUnsupportedError } from "./provider";

/** Splits text into sentence-sized chunks so the UI streams the same way it would with a model. */
function chunks(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [text];
}

/**
 * Deterministic provider used when no model is configured, and in tests. It never invents
 * content: it returns the application's own draft, which is built from project data.
 */
export class MockAiProvider implements AiProvider {
  readonly config = { provider: "mock" as const, model: "rules" };
  readonly deterministic = true;

  async generate(request: AiRequest): Promise<string> {
    return request.draft;
  }

  async *stream(request: AiRequest): AsyncIterable<string> {
    for (const part of chunks(request.draft)) {
      if (request.signal?.aborted) return;
      yield part;
    }
  }

  async generateObject<T>(): Promise<T> {
    throw new AiUnsupportedError("Structured generation");
  }
}
