/**
 * Slot for semantic search. Saqina has no embedding model wired in yet (no pgvector, and the AI
 * gateway has no embedding operation), so the only implementation reports itself unavailable.
 * Retrieval then says `semantic: "off"` instead of pretending, and lexical search carries on.
 */
export interface EmbeddingProvider {
  readonly available: boolean;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export const NoEmbeddings: EmbeddingProvider = {
  available: false,
  async embed() {
    throw new Error("embeddings_unavailable");
  },
};
