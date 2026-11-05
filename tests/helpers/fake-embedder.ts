import { createHash } from "node:crypto";
import type { EmbedderOverride } from "@/lib/ai/embeddings";
import { EMBEDDING_DIMENSIONS } from "@/lib/domain/memory";

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

const normalise = (v: number[]) => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

/** A bag-of-words vector: texts that share words are close, texts that share none are far. */
export function wordVector(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const w of words(text))
    v[createHash("sha256").update(w).digest().readUInt16BE(0) % EMBEDDING_DIMENSIONS] += 1;
  return normalise(v);
}

/** A unit vector on one axis: every text mapped to the same concept is identical, different concepts are orthogonal. */
export const conceptVector = (concept: number): number[] => {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[concept] = 1;
  return v;
};

export interface FakeEmbedderOptions {
  /** Texts that contain a key (case-insensitive) get that concept's vector; the rest get word vectors. */
  concepts?: Record<string, number>;
  onCall?: (texts: readonly string[]) => void;
  fail?: boolean;
}

export function fakeEmbedder(modelId: string, options: FakeEmbedderOptions = {}): EmbedderOverride {
  const entries = Object.entries(options.concepts ?? {});
  return {
    modelId,
    async embed(texts) {
      options.onCall?.(texts);
      if (options.fail) throw new Error("provider_down");
      return texts.map((text) => {
        const hit = entries.find(([key]) => text.toLowerCase().includes(key.toLowerCase()));
        return hit ? conceptVector(hit[1]) : wordVector(text);
      });
    },
  };
}
