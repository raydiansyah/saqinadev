# Semantic search (phase F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project that opts in finds memory and wiki text by meaning, with access checked before ranking, and says honestly when semantic search is off, indexing or degraded.

**Architecture:** An `embedding` operation in the AI gateway (OpenAI-compatible and Gemini adapters) feeds a reconcile job that keeps one vector per eligible memory asset or wiki chunk in `memory_embeddings`. Retrieval embeds the question, takes the nearest vectors under the same `visibleWhere` filter as the full-text list, and fuses the three lists with the existing `rrf()`. Search per project is an exact scan; no vector index.

**Tech Stack:** PostgreSQL 14+ with the `vector` extension (Neon provides it), Drizzle ORM `vector` column and `cosineDistance`, Zod 4, Vitest. No new npm dependency.

Spec: [2026-11-03-semantic-search-design.md](../specs/2026-11-03-semantic-search-design.md). Risk lane: Red.

## Global Constraints

- Vectors are 1536 numbers (`EMBEDDING_DIMENSIONS`); every provider is asked for that size.
- At most 64 texts per embedding call; at most 256 texts embedded per job run; one text is cut at 6000 characters.
- The question is embedded with a 900 ms limit; the retrieval budget stays 1500 ms. A failure returns full-text results with `semantic: "degraded"`.
- Opt-in is per project, by a person who can `members:manage`, default off, with the consent version recorded in the audit log. Only assets with visibility `project` and status `approved` (and wiki chunks of such assets) are embedded.
- Access is checked before ranking: the vector query joins `visibleWhere`. A vector row never widens who can read an asset.
- Vectors and text are never logged and never returned to browsers, agents or MCP clients. Audit and log metadata carry ids and counts only.
- No test calls a real provider or the network. A fake embedder returns deterministic vectors.
- Migration 0039 is expand-only. Every new string exists in English and Indonesian with the same keys.
- Files stay under 400 lines. The project does not add `Co-Authored-By` trailers, and commits only when the owner asks: each "Commit" step below is run only with that go-ahead.
- Commands run from the repository root with `export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$PATH"`. Tests run with `pnpm exec vitest run <file>`. The local test database needs the `vector` extension available (Homebrew `pgvector`).

## Refinements to the spec (applied during planning; Task 9 updates the spec)

1. `memory_embeddings` has `asset_id` and `chunk_id` foreign keys (cascade) and a check that exactly one is set, instead of `source_type` plus `source_id`. Deleting a source deletes its vector with no extra code.
2. One reconcile job per project (`embed_project`) replaces one job per source. It embeds what is missing or changed and deletes what is no longer eligible, so no write path needs its own hook.
3. Only visibility `project` is embedded. `restricted` and `agent` assets are not, which is stricter than "not private".
4. The opt-in switch sits on the Memory overview, next to the status, not in project settings.
5. Retrieval reports `on`, `off` or `degraded`. `indexing` is shown only on the Memory overview.
6. Triggers for the reconcile job: the outbox consumer (`processProjectChanges`), the end of the `index_wiki` job, turning the switch on, changing the embedding model, and the maintenance cron as a safety net. A late reconcile only delays recall. It never widens access, because retrieval re-checks visibility on every query.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/domain/enums.ts`, `src/lib/domain/memory.ts` | Vocabulary: `embedding` operation, `embeddings` capability, `embed_project` job kind, `EMBEDDING_DIMENSIONS`, `SemanticState` |
| `src/lib/ai/provider.ts` | Optional `embed` on `AiProvider` |
| `src/lib/ai/model-capabilities.ts`, `src/lib/ai/model-resolver.ts` | Recognise embedding models; keep them out of chat chains and defaults |
| `src/lib/ai/adapters/openai.ts`, `gemini.ts` | `embed` implementations |
| `src/lib/db/schema/embeddings.ts` (new), `projects.ts`, `platform.ts`, migration `0039_semantic_search.sql` | Table and two columns |
| `src/lib/ai/embeddings.ts` (new) | `embedTexts`, `activeEmbeddingModelId`, `EmbeddingsUnavailable` |
| `src/lib/ai/control-plane.ts` | `setEmbeddingModel` |
| `src/lib/memory/embed/sources.ts`, `reconcile.ts`, `enqueue.ts`, `settings.ts` (new) | What is embeddable, the reconcile job, queuing, the project switch |
| `src/lib/memory/jobs.ts`, `src/lib/brain/process.ts`, `src/app/api/cron/maintenance/route.ts` | Run and trigger the job |
| `src/lib/memory/retrieval/vector.ts` (new), `engine.ts`; `src/lib/memory/wiki/retrieve.ts` | Vector lists and the semantic state |
| `src/components/platform/model-manager.tsx`, dashboard AI actions and page | Owner picks the embedding model |
| `src/components/memory/memory-overview.tsx`, `semantic-switch.tsx` (new), memory actions | Status and the consent switch |
| `tests/helpers/fake-embedder.ts`, `embedding-model.ts` (new) | Deterministic embedder; a model row and the platform setting |

---

### Task 1: Vocabulary, provider contract and capability inference

**Files:**
- Modify: `src/lib/domain/enums.ts`, `src/lib/domain/memory.ts`, `src/lib/ai/provider.ts`, `src/lib/ai/model-capabilities.ts`, `src/lib/ai/model-resolver.ts`, `src/lib/ai/control-plane.ts:545`
- Modify: `messages/platform.en.json`, `messages/platform.id.json` (capability label), `messages/memory-hub.en.json`, `messages/memory-hub.id.json` (job kind label)
- Test: `tests/ai/model-capabilities.test.ts`, `tests/ai/embedder-usable.test.ts` (new)

**Interfaces:**
- Produces: `EMBEDDING_DIMENSIONS = 1536`; `SemanticState = "on" | "off" | "indexing" | "degraded"`; `AiEmbedOptions { dimensions: number; signal?: AbortSignal }`; optional `AiProvider.embed?(texts: readonly string[], options: AiEmbedOptions): Promise<number[][]>`; `isEmbeddingModel(modelId: string): boolean`; `embedderUsable(m: CatalogModel): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai/model-capabilities.test.ts` and add `isEmbeddingModel` to its import from `@/lib/ai/model-capabilities`:

```ts
describe("embedding models", () => {
  it("are recognised and get only the embeddings capability", () => {
    expect(isEmbeddingModel("text-embedding-3-small")).toBe(true);
    expect(isEmbeddingModel("gemini-embedding-001")).toBe(true);
    expect(isEmbeddingModel("gpt-4o")).toBe(false);
    expect(inferCapabilities("openai", "text-embedding-3-small")).toEqual(["embeddings"]);
    expect(inferCapabilities("gemini", "gemini-embedding-001")).toEqual(["embeddings"]);
  });
});
```

Create `tests/ai/embedder-usable.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type CatalogModel, embedderUsable, modelUsable } from "@/lib/ai/model-resolver";

const model = (over: Partial<CatalogModel>): CatalogModel => ({
  id: "m1",
  providerId: "p1",
  modelId: "x",
  displayName: "X",
  capabilities: ["text"],
  status: "available",
  providerName: "P",
  providerType: "custom",
  providerAdapter: "openai_compatible",
  providerEnabled: true,
  providerStatus: "connected",
  ownerUserId: null,
  ...over,
});

describe("embedding-only models", () => {
  it("never enter a chat chain or become a default", () => {
    expect(modelUsable(model({ capabilities: ["embeddings"] }))).toBe(false);
    expect(modelUsable(model({ capabilities: ["text", "embeddings"] }))).toBe(true);
  });

  it("are usable as embedders only when available, enabled and connected", () => {
    expect(embedderUsable(model({ capabilities: ["embeddings"] }))).toBe(true);
    expect(embedderUsable(model({ capabilities: ["text"] }))).toBe(false);
    expect(embedderUsable(model({ capabilities: ["embeddings"], status: "disabled" }))).toBe(false);
    expect(embedderUsable(model({ capabilities: ["embeddings"], providerEnabled: false }))).toBe(false);
    expect(embedderUsable(model({ capabilities: ["embeddings"], providerStatus: "error" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/ai/model-capabilities.test.ts tests/ai/embedder-usable.test.ts`
Expected: FAIL (`isEmbeddingModel` and `embedderUsable` are not exported).

- [ ] **Step 3: Implement**

In `src/lib/domain/enums.ts` add `"embeddings",` after `"long_context",` in `MODEL_CAPABILITIES`, and `"embedding",` after `"connection_test",` in `AI_OPERATIONS`.

In `src/lib/domain/memory.ts` add `"embed_project",` after `"index_code",` in `JOB_KINDS`, and at the end of the file:

```ts
/** Every vector has this many numbers: providers are asked for this size, so one column fits all models. */
export const EMBEDDING_DIMENSIONS = 1536;

/** What a retrieval or the overview says about semantic search. */
export const SEMANTIC_STATES = ["on", "off", "indexing", "degraded"] as const;
export type SemanticState = (typeof SEMANTIC_STATES)[number];
```

In `src/lib/ai/provider.ts` add after `AiUsage`:

```ts
export interface AiEmbedOptions {
  /** Size of each returned vector. The provider is asked for exactly this many numbers. */
  dimensions: number;
  signal?: AbortSignal;
}
```

and inside `interface AiProvider`, after `generateObject`:

```ts
  /** Vectors for `texts`, in the same order. Providers without embeddings leave this out. */
  embed?(texts: readonly string[], options: AiEmbedOptions): Promise<number[][]>;
```

In `src/lib/ai/model-capabilities.ts` add under `isChatModel`:

```ts
/** Ids of models that turn text into vectors. They are not chat models, but the owner may pick one as the embedder. */
export const isEmbeddingModel = (modelId: string) => /embed/i.test(modelId);
```

and as the first statement of `inferCapabilities` (after computing `id`):

```ts
  if (isEmbeddingModel(id)) return ["embeddings"];
```

In `src/lib/ai/control-plane.ts` change the fetch filter (`.filter(isChatModel)` near line 545) to `.filter((id) => isChatModel(id) || isEmbeddingModel(id))` and add `isEmbeddingModel` to the import from `./model-capabilities`. Leave `src/lib/ai/user-gateway.ts` as it is: a person's own gateway stays chat-only.

In `src/lib/ai/model-resolver.ts` replace `modelUsable` with:

```ts
const providerReady = (m: CatalogModel) =>
  m.status === "available" && m.providerEnabled && USABLE_PROVIDER.includes(m.providerStatus);

/** A model that only embeds cannot answer a chat, so it never enters a chat chain or becomes a default. */
const embeddingOnly = (m: CatalogModel) =>
  m.capabilities.includes("embeddings") && !m.capabilities.includes("text");

export function modelUsable(m: CatalogModel): boolean {
  return providerReady(m) && !embeddingOnly(m);
}

/** May be chosen as the platform's embedder. */
export function embedderUsable(m: CatalogModel): boolean {
  return providerReady(m) && m.capabilities.includes("embeddings");
}
```

Labels: in `messages/platform.en.json` add `"embeddings": "Embeddings"` after the `"long_context": "Long context"` line (line ~132) and `"embeddings": "Embedding"` after the Indonesian `long_context` line in `messages/platform.id.json`. In `messages/memory-hub.en.json` add `"embed_project": "Index for semantic search"` to the `jobs.kind` object (after `extract_chat`) and `"embed_project": "Indeks untuk pencarian semantik"` in the Indonesian file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/ai && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib messages tests/ai
git commit -m "feat: embedding vocabulary, provider contract and capability inference"
```

---

### Task 2: OpenAI-compatible and Gemini `embed`

**Files:**
- Modify: `src/lib/ai/adapters/openai.ts` (class `OpenAiClient`), `src/lib/ai/adapters/gemini.ts` (class `GeminiClient`)
- Test: `tests/ai/embed-adapters.test.ts` (new)

**Interfaces:**
- Consumes: `AiEmbedOptions`, `AiProviderError("bad_response")`, `request()` from `./http`.
- Produces: `client.embed(texts, { dimensions })` on the OpenAI and Gemini clients; returns vectors in input order, each exactly `dimensions` long, and sets `client.usage.input`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "@/lib/ai/adapters";
import { AiProviderError } from "@/lib/ai/adapters/http";

const vec = (n: number, v: number) => Array.from({ length: n }, () => v);

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function stubFetch(reply: (call: Call) => unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        url: String(url),
        body: JSON.parse(String(init.body)),
        headers: init.headers as Record<string, string>,
      };
      calls.push(call);
      return new Response(JSON.stringify(reply(call)), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const config = { baseUrl: null, configuration: {} };

describe("OpenAI-compatible embeddings", () => {
  it("asks for the fixed size and returns vectors in input order", async () => {
    const calls = stubFetch(() => ({
      data: [
        { index: 1, embedding: vec(4, 0.2) },
        { index: 0, embedding: vec(4, 0.1) },
      ],
      usage: { prompt_tokens: 12 },
    }));
    const client = ADAPTERS.openai.createClient(config, "sk-test", "text-embedding-3-small");
    const out = await client.embed?.(["a", "b"], { dimensions: 4 });
    expect(out).toEqual([vec(4, 0.1), vec(4, 0.2)]);
    expect(calls[0].url).toBe("https://api.openai.com/v1/embeddings");
    expect(calls[0].body).toMatchObject({
      model: "text-embedding-3-small",
      input: ["a", "b"],
      dimensions: 4,
    });
    expect(calls[0].headers.authorization).toBe("Bearer sk-test");
    expect(client.usage).toEqual({ input: 12, output: null });
  });

  it("rejects a wrong count or a wrong size instead of storing it", async () => {
    stubFetch(() => ({ data: [{ index: 0, embedding: vec(3, 0.1) }] }));
    const client = ADAPTERS.openai.createClient(config, "k", "m-embed");
    await expect(client.embed?.(["a", "b"], { dimensions: 3 })).rejects.toMatchObject({
      code: "bad_response",
    });
    await expect(client.embed?.(["a"], { dimensions: 4 })).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe("Gemini embeddings", () => {
  it("uses batchEmbedContents with the key in a header and the fixed size", async () => {
    const calls = stubFetch(() => ({ embeddings: [{ values: vec(4, 0.3) }, { values: vec(4, 0.4) }] }));
    const client = ADAPTERS.gemini.createClient(config, "g-key", "gemini-embedding-001");
    const out = await client.embed?.(["a", "b"], { dimensions: 4 });
    expect(out).toEqual([vec(4, 0.3), vec(4, 0.4)]);
    expect(calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
    );
    expect(calls[0].headers["x-goog-api-key"]).toBe("g-key");
    expect(calls[0].body).toMatchObject({
      requests: [
        { model: "models/gemini-embedding-001", content: { parts: [{ text: "a" }] }, outputDimensionality: 4 },
        { model: "models/gemini-embedding-001", content: { parts: [{ text: "b" }] }, outputDimensionality: 4 },
      ],
    });
  });
});

describe("providers without embeddings", () => {
  it("leave embed out, so the gateway reports them as unsupported", () => {
    expect(ADAPTERS.anthropic.createClient(config, "k", "claude-sonnet-5-5").embed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/ai/embed-adapters.test.ts`
Expected: FAIL (`client.embed` is undefined, so the first calls return `undefined`).

- [ ] **Step 3: Implement**

In `src/lib/ai/adapters/openai.ts` import `AiEmbedOptions` with the other provider types (`import type { AiEmbedOptions, AiProvider, AiRequest, AiUsage } from "../provider";`) and add this method to `OpenAiClient`, after `generateObject`:

```ts
  async embed(texts: readonly string[], options: AiEmbedOptions): Promise<number[][]> {
    const response = await request(`${this.base}/embeddings`, {
      method: "POST",
      adapter: this.config.adapter,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        dimensions: options.dimensions,
        encoding_format: "float",
      }),
      signal: options.signal,
    });
    const json = (await response.json()) as {
      data?: { index: number; embedding: number[] }[];
      usage?: { prompt_tokens?: number };
    };
    const rows = json.data;
    if (!Array.isArray(rows) || rows.length !== texts.length)
      throw new AiProviderError("bad_response");
    const vectors = [...rows].sort((a, b) => a.index - b.index).map((r) => r.embedding);
    // A server that ignores `dimensions` would corrupt the column: refuse instead of storing it.
    if (vectors.some((v) => !Array.isArray(v) || v.length !== options.dimensions))
      throw new AiProviderError("bad_response");
    if (json.usage) this.usage = { input: json.usage.prompt_tokens ?? null, output: null };
    return vectors;
  }
```

In `src/lib/ai/adapters/gemini.ts` import `AiEmbedOptions` (`import type { AiEmbedOptions, AiProvider, AiRequest, AiUsage } from "../provider";`) and add to `GeminiClient`, after `generateObject`:

```ts
  async embed(texts: readonly string[], options: AiEmbedOptions): Promise<number[][]> {
    const model = this.config.model;
    const response = await request(
      `${this.base}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`,
      {
        method: "POST",
        adapter: "gemini",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: options.dimensions,
          })),
        }),
        signal: options.signal,
      },
    );
    const json = (await response.json()) as { embeddings?: { values?: number[] }[] };
    const rows = json.embeddings;
    if (!Array.isArray(rows) || rows.length !== texts.length)
      throw new AiProviderError("bad_response");
    const vectors = rows.map((r) => r.values ?? []);
    if (vectors.some((v) => v.length !== options.dimensions))
      throw new AiProviderError("bad_response");
    return vectors;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/ai && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/adapters tests/ai/embed-adapters.test.ts
git commit -m "feat: embeddings in the OpenAI-compatible and Gemini adapters"
```

---

### Task 3: Schema and migration 0039

**Files:**
- Create: `src/lib/db/schema/embeddings.ts`, `src/lib/db/migrations/0039_semantic_search.sql` (generated, then edited)
- Modify: `src/lib/db/schema/index.ts`, `src/lib/db/schema/projects.ts`, `src/lib/db/schema/platform.ts`, `.github/workflows/ci.yml`, `docs/standards/testing.md`
- Test: `tests/integration/semantic-schema.test.ts` (new)

**Interfaces:**
- Produces: table `memory_embeddings` as `memoryEmbeddings`; column `projectSettings.semanticSearchEnabled` (boolean, default false); column `platformAiSettings.embeddingModelId` (uuid, nullable, references `ai_models` set null).

- [ ] **Step 1: Write the failing test**

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";

describe("semantic search schema", () => {
  it("has the vector extension, the table, its one-source check and the two settings columns", async () => {
    const ext = await db.execute(sql`select extname from pg_extension where extname = 'vector'`);
    expect(ext.rows).toHaveLength(1);
    const table = await db.execute(sql`select to_regclass('public.memory_embeddings') as t`);
    expect(table.rows[0]?.t).toBe("memory_embeddings");
    const check = await db.execute(
      sql`select conname from pg_constraint where conname = 'memory_embeddings_one_source'`,
    );
    expect(check.rows).toHaveLength(1);
    const columns = await db.execute(sql`
      select table_name, column_name from information_schema.columns
      where (table_name = 'project_settings' and column_name = 'semantic_search_enabled')
         or (table_name = 'platform_ai_settings' and column_name = 'embedding_model_id')`);
    expect(columns.rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/integration/semantic-schema.test.ts`
Expected: FAIL (no extension row).

- [ ] **Step 3: Implement the schema**

Create `src/lib/db/schema/embeddings.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@/lib/domain/memory";
import { memoryAssets } from "./memory";
import { aiModels } from "./platform";
import { projects } from "./projects";
import { wikiChunks } from "./wiki";

/**
 * One vector per embedded text. Exactly one of `asset_id` (chat memory) or `chunk_id` (a wiki
 * passage) is set, so deleting the source deletes its vector. `content_hash` is the hash of the
 * exact text that was embedded: a changed text no longer matches and is embedded again.
 */
export const memoryEmbeddings = pgTable(
  "memory_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => memoryAssets.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => wikiChunks.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => aiModels.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("memory_embeddings_asset_idx").on(t.assetId, t.modelId),
    uniqueIndex("memory_embeddings_chunk_idx").on(t.chunkId, t.modelId),
    index("memory_embeddings_project_idx").on(t.projectId, t.modelId),
    check("memory_embeddings_one_source", sql`(${t.assetId} is null) <> (${t.chunkId} is null)`),
  ],
);
```

Add `export * from "./embeddings";` to `src/lib/db/schema/index.ts`. In `src/lib/db/schema/projects.ts`, inside `projectSettings` after `approvalPolicy`, add:

```ts
  /** The project agreed that approved memory and wiki text may be sent to the embedding provider. */
  semanticSearchEnabled: boolean("semantic_search_enabled").notNull().default(false),
```

In `src/lib/db/schema/platform.ts`, inside `platformAiSettings` after `localCliEnabled`, add:

```ts
  /** The model that turns text into vectors for semantic search. Null: semantic search is off everywhere. */
  embeddingModelId: uuid("embedding_model_id").references(() => aiModels.id, {
    onDelete: "set null",
  }),
```

- [ ] **Step 4: Generate and edit the migration**

Run: `pnpm exec drizzle-kit generate --name semantic_search`
Expected: a new file `src/lib/db/migrations/0039_semantic_search.sql` and a journal entry. Open the file and insert this as its first line (drizzle-kit does not write it):

```sql
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
```

Check the file creates `memory_embeddings` with `"embedding" vector(1536) NOT NULL`, the check `memory_embeddings_one_source`, the three indexes, and the two `ALTER TABLE ... ADD COLUMN` statements (`semantic_search_enabled boolean DEFAULT false NOT NULL`, `embedding_model_id uuid` with its foreign key). Nothing may drop or rename an existing column.

Apply it to the test and the local UI databases:

```bash
T=$(grep -E '^DATABASE_URL_TEST=' .env.local | cut -d= -f2- | tr -d '"'); DATABASE_URL="$T" pnpm db:migrate
```

```bash
U=$(grep -E '^DATABASE_URL_TEST=' .env.local | cut -d= -f2- | tr -d '"' | sed -E 's#/saqinadev_test.*#/saqinadev_ui#'); DATABASE_URL="$U" pnpm db:migrate
```

Expected: `Migrations applied to saqinadev_test` and `Migrations applied to saqinadev_ui`.

CI: in `.github/workflows/ci.yml` change `image: postgres:17` to `image: pgvector/pgvector:pg17` (same environment variables and health command). In `docs/standards/testing.md` add one sentence where it describes the test database: "The test database needs the `vector` extension available (Homebrew `pgvector`; CI uses the `pgvector/pgvector` image)."

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/integration/semantic-schema.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db .github docs/standards/testing.md tests/integration/semantic-schema.test.ts
git commit -m "feat: memory_embeddings table, project opt-in and platform embedding model columns"
```

---

### Task 4: Embedding gateway, Owner setting and test helpers

**Files:**
- Create: `src/lib/ai/embeddings.ts`, `tests/helpers/fake-embedder.ts`, `tests/helpers/embedding-model.ts`
- Modify: `src/lib/ai/gateway.ts` (export `recordUsage`, loosen its model type), `src/lib/ai/control-plane.ts` (`setEmbeddingModel`), `src/app/[locale]/(app)/dashboard/ai/actions.ts`
- Test: `tests/integration/embeddings-gateway.test.ts` (new)

**Interfaces:**
- Consumes: `AiProvider.embed`, `ADAPTERS`, `withProviderSecret`, `platformSettings()`, `recordUsage`.
- Produces:
  - `embedTexts(input: { projectId: string | null; texts: readonly string[]; signal?: AbortSignal; override?: EmbedderOverride }): Promise<{ vectors: number[][]; modelId: string }>`
  - `activeEmbeddingModelId(): Promise<string | null>`
  - `class EmbeddingsUnavailable extends Error { reason: "no_model" | "unsupported" | "provider_unavailable" }`
  - `interface EmbedderOverride { modelId: string; embed(texts: readonly string[]): Promise<number[][]> }`
  - `setEmbeddingModel(actor: Actor, input: unknown): Promise<void>` (platform Owner only)
  - Test helpers: `fakeEmbedder(modelId, options?)`, `installEmbeddingModel(): Promise<string>`, `removeEmbeddingModel(): Promise<void>`

- [ ] **Step 1: Write the test helpers**

`tests/helpers/fake-embedder.ts`:

```ts
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
  for (const w of words(text)) v[createHash("sha256").update(w).digest().readUInt16BE(0) % EMBEDDING_DIMENSIONS] += 1;
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
```

`tests/helpers/embedding-model.ts`:

```ts
import { eq } from "drizzle-orm";
import { platformSettings } from "@/lib/ai/catalog";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders, platformAiSettings } from "@/lib/db/schema";

/** An embedding model in the registry, chosen as the platform's, with no real provider behind it. */
export async function installEmbeddingModel(): Promise<string> {
  const [provider] = await db
    .insert(aiProviders)
    .values({
      slug: `embed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Embed test",
      type: "custom",
      adapter: "openai_compatible",
      baseUrl: "http://127.0.0.1:1",
      status: "connected",
    })
    .returning();
  const [model] = await db
    .insert(aiModels)
    .values({
      providerId: provider.id,
      modelId: "test-embedding",
      displayName: "Test embedding",
      capabilities: ["embeddings"],
    })
    .returning();
  await platformSettings();
  await db
    .update(platformAiSettings)
    .set({ embeddingModelId: model.id })
    .where(eq(platformAiSettings.id, 1));
  return model.id;
}

/** The test database is shared: leave no embedding model behind for other tests. */
export async function removeEmbeddingModel(): Promise<void> {
  await platformSettings();
  await db.update(platformAiSettings).set({ embeddingModelId: null }).where(eq(platformAiSettings.id, 1));
  await db.delete(aiProviders).where(eq(aiProviders.name, "Embed test"));
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeEmbeddingModelId, EmbeddingsUnavailable, embedTexts } from "@/lib/ai/embeddings";
import { setEmbeddingModel } from "@/lib/ai/control-plane";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { aiModels, aiUsageRecords, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";
import { fakeEmbedder } from "../helpers/fake-embedder";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? `${e.code}:${Object.values(e.fields ?? {})[0] ?? ""}` : String(e);
  }
};

let owner: Actor;
let member: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, owner.id));
  member = await createUser("Member");
});
afterEach(removeEmbeddingModel);

describe("embedTexts", () => {
  it("says nothing can embed when no model is chosen", async () => {
    expect(await activeEmbeddingModelId()).toBeNull();
    await expect(embedTexts({ projectId: null, texts: ["a"] })).rejects.toMatchObject({
      reason: "no_model",
    });
    await expect(embedTexts({ projectId: null, texts: ["a"] })).rejects.toBeInstanceOf(
      EmbeddingsUnavailable,
    );
  });

  it("returns the vectors and the model that made them (injected embedder)", async () => {
    const modelId = await installEmbeddingModel();
    const out = await embedTexts({
      projectId: null,
      texts: ["one", "two"],
      override: fakeEmbedder(modelId),
    });
    expect(out.modelId).toBe(modelId);
    expect(out.vectors).toHaveLength(2);
    expect(out.vectors[0]).toHaveLength(1536);
  });

  it("records usage with the embedding operation and no text when the provider call fails", async () => {
    await installEmbeddingModel();
    // The registered provider points at a closed port: the call fails with a safe code.
    await expect(embedTexts({ projectId: null, texts: ["secret words"] })).rejects.toBeDefined();
    const usage = await db.select().from(aiUsageRecords);
    expect(usage.at(-1)).toMatchObject({ operation: "embedding", status: "failed" });
    expect(JSON.stringify(usage)).not.toContain("secret words");
  });
});

describe("setEmbeddingModel", () => {
  it("lets only the platform Owner choose, and only a model that embeds", async () => {
    const modelId = await installEmbeddingModel();
    await db.update(aiModels).set({ capabilities: ["text"] }).where(eq(aiModels.id, modelId));
    expect(await code(setEmbeddingModel(member, { modelId }))).toBe("NOT_FOUND:");
    expect(await code(setEmbeddingModel(owner, { modelId }))).toBe("VALIDATION_ERROR:unavailable");
    await db.update(aiModels).set({ capabilities: ["embeddings"] }).where(eq(aiModels.id, modelId));
    expect(await code(setEmbeddingModel(owner, { modelId }))).toBe("OK:");
    expect(await activeEmbeddingModelId()).toBe(modelId);
    await setEmbeddingModel(owner, { modelId: null });
    expect(await activeEmbeddingModelId()).toBeNull();
  });
});
```

Note on the second test: `installEmbeddingModel()` already sets the platform model. In the first `setEmbeddingModel` test the platform row is overwritten by the calls themselves.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run tests/integration/embeddings-gateway.test.ts`
Expected: FAIL (module `@/lib/ai/embeddings` does not exist).

- [ ] **Step 4: Implement**

In `src/lib/ai/gateway.ts` change `async function recordUsage(input: {` to `export async function recordUsage(input: {` and the field `model: CatalogModel | null;` to `model: Pick<CatalogModel, "id" | "providerId"> | null;`.

Create `src/lib/ai/embeddings.ts`:

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders } from "@/lib/db/schema";
import { EMBEDDING_DIMENSIONS } from "@/lib/domain/memory";
import { ADAPTERS } from "./adapters";
import { AiProviderError } from "./adapters/http";
import { platformSettings } from "./catalog";
import { recordUsage } from "./gateway";
import { type AiProvider, AiUnsupportedError } from "./provider";
import { usesNoKey, withProviderSecret } from "./provider-secret";

export type EmbeddingUnavailableReason = "no_model" | "unsupported" | "provider_unavailable";

/** Nothing can embed right now. The caller falls back to full-text search and says so. */
export class EmbeddingsUnavailable extends Error {
  constructor(readonly reason: EmbeddingUnavailableReason) {
    super(`embeddings_unavailable:${reason}`);
    this.name = "EmbeddingsUnavailable";
  }
}

/** Tests inject an embedder instead of a provider; `modelId` is a row of `ai_models`. */
export interface EmbedderOverride {
  modelId: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface EmbedResult {
  vectors: number[][];
  modelId: string;
}

const isAbort = (error: unknown) =>
  ["AbortError", "TimeoutError"].includes((error as Error)?.name ?? "");

export async function activeEmbeddingModelId(): Promise<string | null> {
  return (await platformSettings()).embeddingModelId ?? null;
}

/**
 * Turns texts into vectors with the platform's embedding model. It does not use the chat chain:
 * there is no fallback to another model (vectors of two models cannot be compared) and no
 * deterministic answer. Every real call is counted in usage, with no text.
 */
export async function embedTexts(input: {
  projectId: string | null;
  texts: readonly string[];
  signal?: AbortSignal;
  override?: EmbedderOverride;
}): Promise<EmbedResult> {
  if (input.override) {
    return { vectors: await input.override.embed(input.texts), modelId: input.override.modelId };
  }
  const modelId = await activeEmbeddingModelId();
  if (!modelId) throw new EmbeddingsUnavailable("no_model");
  const [row] = await db
    .select({ model: aiModels, provider: aiProviders })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
    .where(eq(aiModels.id, modelId));
  if (
    !row ||
    row.model.status !== "available" ||
    !row.provider.enabled ||
    !row.model.capabilities.includes("embeddings")
  )
    throw new EmbeddingsUnavailable("no_model");
  if (!row.provider.credentialId && !usesNoKey(row.provider.adapter))
    throw new EmbeddingsUnavailable("provider_unavailable");

  const started = performance.now();
  let client: AiProvider | null = null;
  try {
    const vectors = await withProviderSecret(row.provider, async (secret) => {
      const made = ADAPTERS[row.provider.adapter].createClient(
        { baseUrl: row.provider.baseUrl, configuration: row.provider.configuration },
        secret,
        row.model.modelId,
      );
      client = made;
      if (!made.embed) throw new AiUnsupportedError("embeddings");
      return made.embed(input.texts, { dimensions: EMBEDDING_DIMENSIONS, signal: input.signal });
    });
    await recordUsage({
      projectId: input.projectId,
      model: row.model,
      requestedId: modelId,
      fallbackUsed: false,
      operation: "embedding",
      client,
      started,
      status: "succeeded",
    });
    return { vectors, modelId };
  } catch (error) {
    if (error instanceof AiUnsupportedError) throw new EmbeddingsUnavailable("unsupported");
    const code = error instanceof AiProviderError ? error.code : isAbort(error) ? "aborted" : "failed";
    await recordUsage({
      projectId: input.projectId,
      model: row.model,
      requestedId: modelId,
      fallbackUsed: false,
      operation: "embedding",
      client,
      started,
      status: "failed",
      errorCode: code,
    });
    if (isAbort(error) || error instanceof AiProviderError) throw error;
    throw new EmbeddingsUnavailable("provider_unavailable");
  }
}
```

In `src/lib/ai/control-plane.ts`, import `embedderUsable` from `./model-resolver` (extend the existing import) and add after `setDefaults`:

```ts
/** The one model that turns text into vectors. Only a model that declares `embeddings` and is usable. */
export async function setEmbeddingModel(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { modelId } = parse(z.object({ modelId: z.uuid().nullable() }), input);
  if (modelId) {
    const catalog = await loadCatalog();
    if (!catalog.some((m) => m.id === modelId && embedderUsable(m)))
      throw new AppError("VALIDATION_ERROR", "Model unavailable", { modelId: "unavailable" });
  }
  await db.transaction(async (tx) => {
    await platformSettings(tx);
    await tx
      .update(platformAiSettings)
      .set({ embeddingModelId: modelId, updatedBy: actor.id })
      .where(eq(platformAiSettings.id, 1));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "model.embedding_changed",
      entityType: "platform",
      metadata: { embeddingModelId: modelId },
    });
  });
}
```

In `src/app/[locale]/(app)/dashboard/ai/actions.ts` add `setEmbeddingModel,` to the import from `@/lib/ai/control-plane` and, after the `setDefaultsAction` line:

```ts
export const setEmbeddingModelAction = wrap("model.embedding", setEmbeddingModel);
```

(Task 5 extends this action to requeue the projects.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/integration/embeddings-gateway.test.ts tests/ai && pnpm exec tsc --noEmit`
Expected: PASS. The usage test depends on the closed port `127.0.0.1:1` giving a network error; if it ever hangs, the 45 s provider timeout applies, so it must finish well inside the test timeout.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai "src/app/[locale]/(app)/dashboard/ai/actions.ts" tests/helpers tests/integration/embeddings-gateway.test.ts
git commit -m "feat: embedding gateway entry point and the Owner's embedding model"
```

---

### Task 5: The reconcile job, the project switch and the triggers

**Files:**
- Create: `src/lib/memory/embed/sources.ts`, `src/lib/memory/embed/reconcile.ts`, `src/lib/memory/embed/enqueue.ts`, `src/lib/memory/embed/settings.ts`
- Modify: `src/lib/memory/jobs.ts`, `src/lib/brain/process.ts`, `src/app/api/cron/maintenance/route.ts`, `src/app/[locale]/(app)/dashboard/ai/actions.ts`
- Test: `tests/integration/memory-embed-job.test.ts` (new)

**Interfaces:**
- Consumes: `embedTexts`, `EmbedderOverride`, `activeEmbeddingModelId`, `memoryEmbeddings`, `projectSettings`, `enqueue` from `../queue`.
- Produces:
  - `listEmbeddableSources(projectId): Promise<EmbedSource[]>` with `EmbedSource = { kind: "asset" | "chunk"; id: string; text: string; hash: string }`
  - `countEmbeddable(projectId): Promise<number>`, `countEmbedded(projectId, modelId): Promise<number>`
  - `reconcileProject(projectId, options?: { override?: EmbedderOverride; signal?: AbortSignal }): Promise<{ embedded: number; removed: number; remaining: number; skipped?: "no_model" }>`
  - `enqueueEmbedProject(executor, projectId): Promise<boolean>`; `requeueAllEmbeddings(): Promise<number>`
  - `setSemanticSearch(actor, slug, input: { enabled: boolean; consent?: string }): Promise<{ enabled: boolean }>`; `CONSENT_VERSION = "2026-11-03"`
  - `processMemoryJobs({ ..., embedder?: EmbedderOverride })`

- [ ] **Step 1: Write the failing test**

```ts
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { processProjectChanges } from "@/lib/brain/process";
import { db } from "@/lib/db/client";
import { auditEvents, memoryAssets, memoryEmbeddings, memoryJobs, projectSettings } from "@/lib/db/schema";
import { USER_TRACE } from "@/lib/events/types";
import { AppError } from "@/lib/errors";
import { enqueueEmbedProject } from "@/lib/memory/embed/enqueue";
import { reconcileProject } from "@/lib/memory/embed/reconcile";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { processMemoryJobs } from "@/lib/memory/jobs";
import { createMemoryTx } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

let alice: Actor; // owner of the project
let bob: Actor; // editor: may not switch semantic search on
let slug: string;
let projectId: string;
let modelId: string;

const accessOf = (a: Actor) => loadProjectAccess(a, { slug }, "project:read");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? `${e.code}:${Object.values(e.fields ?? {})[0] ?? ""}` : String(e);
  }
};

async function make(title: string, content: string, visibility: "project" | "private" = "project") {
  const access = await accessOf(alice);
  return db.transaction((tx) =>
    createMemoryTx(tx, access, { title, content, category: "product", importance: "normal" }, USER_TRACE, {
      visibility,
    }),
  );
}
const vectors = () => db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  slug = await project(alice, "A web shop with login and payments for my bakery.");
  projectId = (await accessOf(alice)).project.id;
  modelId = await installEmbeddingModel();
});
afterEach(removeEmbeddingModel);

describe("turning semantic search on", () => {
  it("needs consent, a model and the right to manage members, and writes an audit event", async () => {
    expect(await code(setSemanticSearch(alice, slug, { enabled: true }))).toBe("VALIDATION_ERROR:required");
    await removeEmbeddingModel();
    expect(await code(setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION }))).toBe(
      "VALIDATION_ERROR:noModel",
    );
    modelId = await installEmbeddingModel();
    expect(await code(setSemanticSearch(bob, slug, { enabled: true, consent: CONSENT_VERSION }))).toBe("NOT_FOUND:");
    expect(await code(setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION }))).toBe("OK:");
    const [settings] = await db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId));
    expect(settings.semanticSearchEnabled).toBe(true);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.projectId, projectId), eq(auditEvents.type, "memory.semantic_enabled")));
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ consentVersion: CONSENT_VERSION });
  });
});

describe("the reconcile job", () => {
  beforeEach(async () => {
    await setSemanticSearch(alice, slug, { enabled: true, consent: CONSENT_VERSION });
  });

  it("embeds project memory, never a private one, and does nothing the second time", async () => {
    const calls: string[][] = [];
    const embedder = fakeEmbedder(modelId, { onCall: (t) => calls.push([...t]) });
    await make("Hosting", "The client covers the Vercel bill");
    const secret = await make("Private note", "price negotiation with the vendor", "private");

    await processMemoryJobs({ embedder });
    const rows = await vectors();
    expect(rows).toHaveLength(1);
    expect(rows.some((r) => r.assetId === secret.id)).toBe(false);
    expect(calls).toHaveLength(1);

    await enqueueEmbedProject(db, projectId);
    await processMemoryJobs({ embedder });
    expect(calls).toHaveLength(1); // nothing changed, nothing was sent
  });

  it("replaces a changed text and removes what is no longer eligible", async () => {
    const embedder = fakeEmbedder(modelId);
    const memo = await make("Hosting", "The client covers the Vercel bill");
    await processMemoryJobs({ embedder });
    const [before] = await vectors();

    await db.update(memoryAssets).set({ visibility: "private" }).where(eq(memoryAssets.id, memo.id));
    await reconcileProject(projectId, { override: embedder });
    expect(await vectors()).toHaveLength(0);

    await db.update(memoryAssets).set({ visibility: "project" }).where(eq(memoryAssets.id, memo.id));
    await reconcileProject(projectId, { override: embedder });
    const [after] = await vectors();
    expect(after.id).not.toBe(before.id);
  });

  it("keeps the old rows when the provider fails, and the job ends retryable without text", async () => {
    await make("Hosting", "The client covers the Vercel bill");
    await processMemoryJobs({ embedder: fakeEmbedder(modelId, { fail: true }) });
    const [job] = await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"));
    expect(job.status).toBe("failed_retryable");
    expect(job.errorCode).toBe("job_failed");
    expect(JSON.stringify(job)).not.toContain("Vercel");
  });

  it("is queued by the outbox consumer, only for a project that opted in", async () => {
    await db.delete(memoryJobs).where(eq(memoryJobs.projectId, projectId));
    await make("Hosting", "The client covers the Vercel bill");
    await processProjectChanges(projectId);
    const queued = await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"));
    expect(queued).toHaveLength(1);

    await setSemanticSearch(alice, slug, { enabled: false });
    expect(await vectors()).toHaveLength(0);
    await db.delete(memoryJobs).where(eq(memoryJobs.projectId, projectId));
    await enqueueEmbedProject(db, projectId);
    expect(await db.select().from(memoryJobs).where(eq(memoryJobs.kind, "embed_project"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/integration/memory-embed-job.test.ts`
Expected: FAIL (modules under `src/lib/memory/embed` do not exist).

- [ ] **Step 3: Implement the sources**

`src/lib/memory/embed/sources.ts`:

```ts
import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memories, memoryAssets, memoryEmbeddings, wikiChunks, wikiSources } from "@/lib/db/schema";
import { notExpired } from "../scope";

/** One text is cut here: embedding models have an input limit, and the start of a memory carries its meaning. */
export const MAX_EMBED_CHARS = 6000;

export interface EmbedSource {
  kind: "asset" | "chunk";
  id: string;
  text: string;
  /** Hash of the exact text that is embedded. */
  hash: string;
}

export const embedHash = (text: string) => createHash("sha256").update(text).digest("hex");
const cut = (text: string) => text.slice(0, MAX_EMBED_CHARS);

/** Approved assets the whole project may read. Private, restricted and agent-only ones are never sent. */
const assetFilter = (projectId: string, type: "chat" | "wiki") =>
  and(
    eq(memoryAssets.projectId, projectId),
    eq(memoryAssets.assetType, type),
    eq(memoryAssets.status, "approved"),
    eq(memoryAssets.visibility, "project"),
    notExpired(),
  );

export async function listEmbeddableSources(projectId: string): Promise<EmbedSource[]> {
  const chat = await db
    .select({ id: memoryAssets.id, title: memoryAssets.title, content: memories.content })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(assetFilter(projectId, "chat"));
  const wiki = await db
    .select({ id: wikiChunks.id, heading: wikiChunks.heading, content: wikiChunks.content })
    .from(wikiChunks)
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .where(and(assetFilter(projectId, "wiki"), eq(wikiSources.status, "ready")));
  const asset = chat.map((r): EmbedSource => {
    const text = cut(`${r.title}\n${r.content}`);
    return { kind: "asset", id: r.id, text, hash: embedHash(text) };
  });
  const chunk = wiki.map((r): EmbedSource => {
    const text = cut(`${r.heading}\n${r.content}`);
    return { kind: "chunk", id: r.id, text, hash: embedHash(text) };
  });
  return [...asset, ...chunk];
}

/** How many texts could be embedded, without loading them. */
export async function countEmbeddable(projectId: string): Promise<number> {
  const [chat] = await db
    .select({ n: count() })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(assetFilter(projectId, "chat"));
  const [wiki] = await db
    .select({ n: count() })
    .from(wikiChunks)
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .where(and(assetFilter(projectId, "wiki"), eq(wikiSources.status, "ready")));
  return (chat?.n ?? 0) + (wiki?.n ?? 0);
}

export async function countEmbedded(projectId: string, modelId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(memoryEmbeddings)
    .where(and(eq(memoryEmbeddings.projectId, projectId), eq(memoryEmbeddings.modelId, modelId)));
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Implement the reconcile, the queue and the switch**

`src/lib/memory/embed/reconcile.ts`:

```ts
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { activeEmbeddingModelId, type EmbedderOverride, embedTexts } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import { memoryEmbeddings, projectSettings } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { type EmbedSource, listEmbeddableSources } from "./sources";

/** Texts per provider call, and per job run. A project with more is finished by a follow-up job. */
export const EMBED_BATCH = 64;
export const EMBED_PER_RUN = 256;

export interface ReconcileResult {
  embedded: number;
  removed: number;
  /** Texts still waiting after this run. */
  remaining: number;
  skipped?: "no_model";
}

const keyOf = (kind: "asset" | "chunk", id: string) => `${kind}:${id}`;

/**
 * Makes the stored vectors match what may be embedded now: adds missing ones, replaces those whose
 * text changed, deletes those of another model, of a source that is gone or no longer eligible
 * (made private, archived, expired). Idempotent: a second run with nothing changed calls no provider.
 */
export async function reconcileProject(
  projectId: string,
  options: { override?: EmbedderOverride; signal?: AbortSignal } = {},
): Promise<ReconcileResult> {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) {
    const gone = await db.delete(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId)).returning({ id: memoryEmbeddings.id });
    return { embedded: 0, removed: gone.length, remaining: 0 };
  }
  const modelId = options.override?.modelId ?? (await activeEmbeddingModelId());
  if (!modelId) return { embedded: 0, removed: 0, remaining: 0, skipped: "no_model" };

  const sources = await listEmbeddableSources(projectId);
  const existing = await db
    .select({
      id: memoryEmbeddings.id,
      assetId: memoryEmbeddings.assetId,
      chunkId: memoryEmbeddings.chunkId,
      modelId: memoryEmbeddings.modelId,
      contentHash: memoryEmbeddings.contentHash,
    })
    .from(memoryEmbeddings)
    .where(eq(memoryEmbeddings.projectId, projectId));

  const wanted = new Set(sources.map((s) => keyOf(s.kind, s.id)));
  const sourceKey = (e: (typeof existing)[number]) =>
    e.assetId ? keyOf("asset", e.assetId) : keyOf("chunk", e.chunkId as string);
  const stale = existing.filter((e) => e.modelId !== modelId || !wanted.has(sourceKey(e)));
  if (stale.length > 0)
    await db.delete(memoryEmbeddings).where(inArray(memoryEmbeddings.id, stale.map((e) => e.id)));

  const have = new Map(
    existing.filter((e) => e.modelId === modelId).map((e) => [sourceKey(e), e.contentHash] as const),
  );
  const todo = sources.filter((s) => have.get(keyOf(s.kind, s.id)) !== s.hash);
  const slice = todo.slice(0, EMBED_PER_RUN);

  let embedded = 0;
  for (let i = 0; i < slice.length; i += EMBED_BATCH) {
    const batch = slice.slice(i, i + EMBED_BATCH);
    const out = await embedTexts({
      projectId,
      texts: batch.map((b) => b.text),
      signal: options.signal,
      override: options.override,
    });
    await store(projectId, out.modelId, batch, out.vectors);
    embedded += batch.length;
  }
  log.info("memory.embed.reconciled", { projectId, embedded, removed: stale.length, remaining: todo.length - slice.length });
  return { embedded, removed: stale.length, remaining: todo.length - slice.length };
}

async function store(projectId: string, modelId: string, batch: EmbedSource[], vectors: number[][]) {
  await db.transaction(async (tx) => {
    for (const [index, source] of batch.entries()) {
      // A changed text replaces its vector; the unique index would refuse a second one.
      await tx
        .delete(memoryEmbeddings)
        .where(
          and(
            eq(memoryEmbeddings.modelId, modelId),
            source.kind === "asset" ? eq(memoryEmbeddings.assetId, source.id) : eq(memoryEmbeddings.chunkId, source.id),
          ),
        );
      await tx.insert(memoryEmbeddings).values({
        projectId,
        modelId,
        contentHash: source.hash,
        embedding: vectors[index],
        assetId: source.kind === "asset" ? source.id : null,
        chunkId: source.kind === "chunk" ? source.id : null,
      });
    }
  });
}
```

`src/lib/memory/embed/enqueue.ts`:

```ts
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { memoryJobs, projectSettings } from "@/lib/db/schema";
import { enqueue } from "../queue";

/**
 * Asks for a reconcile. Only for a project that opted in, and at most one waiting job: a change that
 * arrives while one is queued adds nothing, because that job reads the project when it runs. A job
 * that is already running does not count, so a change during a run queues the next one.
 */
export async function enqueueEmbedProject(executor: Executor, projectId: string): Promise<boolean> {
  const [settings] = await executor
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) return false;
  const [open] = await executor
    .select({ id: memoryJobs.id })
    .from(memoryJobs)
    .where(
      and(
        eq(memoryJobs.projectId, projectId),
        eq(memoryJobs.kind, "embed_project"),
        inArray(memoryJobs.status, ["queued", "failed_retryable"]),
      ),
    )
    .limit(1);
  if (open) return false;
  return enqueue(executor, {
    projectId,
    kind: "embed_project",
    key: `embed:${projectId}:${Date.now()}`,
    data: { projectId },
  });
}

/** A new embedding model makes every stored vector stale: queue every project that opted in. */
export async function requeueAllEmbeddings(limit = 500): Promise<number> {
  const rows = await db
    .select({ projectId: projectSettings.projectId })
    .from(projectSettings)
    .where(eq(projectSettings.semanticSearchEnabled, true))
    .limit(limit);
  let queued = 0;
  for (const r of rows) if (await enqueueEmbedProject(db, r.projectId)) queued++;
  return queued;
}
```

`src/lib/memory/embed/settings.ts`:

```ts
import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { activeEmbeddingModelId } from "@/lib/ai/embeddings";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memoryEmbeddings, projectSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { enqueueEmbedProject } from "./enqueue";

/** The version of the consent text shown in the switch. Change it when the wording changes. */
export const CONSENT_VERSION = "2026-11-03";

const input = z.object({ enabled: z.boolean(), consent: z.string().optional() });

/** A project admin turns semantic search on (with consent) or off (which deletes the vectors). */
export async function setSemanticSearch(actor: Actor, slug: string, raw: unknown): Promise<{ enabled: boolean }> {
  const data = parse(input, raw);
  const access = await loadProjectAccess(actor, { slug }, "members:manage");
  const projectId = access.project.id;
  if (data.enabled && data.consent !== CONSENT_VERSION)
    throw new AppError("VALIDATION_ERROR", "Consent is required", { consent: "required" });
  if (data.enabled && !(await activeEmbeddingModelId()))
    throw new AppError("VALIDATION_ERROR", "No embedding model", { semantic: "noModel" });
  await db.transaction(async (tx) => {
    await tx
      .insert(projectSettings)
      .values({ projectId, semanticSearchEnabled: data.enabled })
      .onConflictDoUpdate({ target: projectSettings.projectId, set: { semanticSearchEnabled: data.enabled } });
    if (!data.enabled) await tx.delete(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectId));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId,
      type: data.enabled ? "memory.semantic_enabled" : "memory.semantic_disabled",
      entityType: "project",
      entityId: projectId,
      metadata: { consentVersion: data.enabled ? CONSENT_VERSION : null },
    });
  });
  if (data.enabled) await enqueueEmbedProject(db, projectId);
  return { enabled: data.enabled };
}
```

- [ ] **Step 5: Run the job and add the triggers**

In `src/lib/memory/jobs.ts`:
- Add imports: `import type { EmbedderOverride } from "@/lib/ai/embeddings";`, `import { enqueueEmbedProject } from "./embed/enqueue";`, `import { reconcileProject } from "./embed/reconcile";`.
- Extend the options of `processMemoryJobs`: `options: { limit?: number; provider?: AiProvider; codeAdapter?: SyncAdapter; embedder?: EmbedderOverride } = {}`.
- In the `for (const job of claimed.rows)` loop, after the `index_code` line add:

```ts
      if (job.kind === "embed_project") {
        const result = await reconcileProject(job.projectId, { override: options.embedder });
        // A large project is finished by a follow-up job instead of one long run.
        if (result.remaining > 0) await enqueueEmbedProject(db, job.projectId);
      }
```

- In the `index_wiki` branch, after the `if (sync.failed > 0) throw ...` line, add `await enqueueEmbedProject(db, job.projectId);` so new wiki passages get vectors.

In `src/lib/brain/process.ts`, inside the transaction after the `enqueueWikiSync` block add:

```ts
    // Memory or wiki text may have changed: keep the vectors in step (only if the project opted in).
    await enqueueEmbedProject(tx, projectId);
```

and add `import { enqueueEmbedProject } from "@/lib/memory/embed/enqueue";` to its imports.

In `src/app/api/cron/maintenance/route.ts` import `requeueAllEmbeddings` from `@/lib/memory/embed/enqueue` and add `embedRequeued: await requeueAllEmbeddings(),` to the response object next to `memoryJobs`. (The safety net: once a day every opted-in project is reconciled.)

In `src/app/[locale]/(app)/dashboard/ai/actions.ts` replace the Task 4 line with:

```ts
export const setEmbeddingModelAction = wrap("model.embedding", async (actor, input) => {
  await setEmbeddingModel(actor, input);
  await requeueAllEmbeddings();
});
```

and import `requeueAllEmbeddings` from `@/lib/memory/embed/enqueue`.

Run: `pnpm exec vitest run tests/integration/memory-embed-job.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: reconcile job, project switch and triggers for semantic search"
```

---

### Task 6: Vector lists in retrieval and the semantic state

**Files:**
- Create: `src/lib/memory/retrieval/vector.ts`
- Modify: `src/lib/memory/retrieval/engine.ts`, `src/lib/memory/wiki/retrieve.ts`, `src/lib/memory/queries.ts` (`Overview.semantic`), `src/lib/tools/catalog.ts:105` (description), `src/lib/tools/handlers.ts` (no code change: the field flows through, verify types)
- Test: `tests/integration/memory-semantic.test.ts` (new), `tests/memory/retrieval-pure.test.ts` (one test)

**Interfaces:**
- Consumes: `embedTexts`, `activeEmbeddingModelId`, `EmbedderOverride`, `memoryEmbeddings`, `cosineDistance` from `drizzle-orm`, `countEmbeddable`, `countEmbedded`.
- Produces:
  - `RetrievalResult.semantic: "on" | "off" | "degraded"`; `WikiResult.semantic` likewise.
  - `RetrieveOptions.embedder?: EmbedderOverride`; `retrieveWiki(..., { query, budget, embedder })`.
  - `semanticModelFor(projectId): Promise<string | null>` (model id when the project opted in and a model exists)
  - `embedQuery(projectId, query, embedder?): Promise<number[]>`
  - `MAX_COSINE_DISTANCE = 0.6` (to tune with the real model before release), `VECTOR_LIMIT = 30`, `QUERY_EMBED_MS = 900`
  - `getSemanticOverview(projectId): Promise<{ state: "on" | "off" | "indexing"; indexed: number; total: number; modelConfigured: boolean; enabled: boolean }>`

- [ ] **Step 1: Write the failing tests**

`tests/integration/memory-semantic.test.ts` (reuse the setup of `tests/integration/memory-governance.test.ts` lines 51-125: users alice/bob/carol/eve, `accessOf`, `make`, `asUser`, `asAgent`; this test needs only alice, bob, eve):

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memoryEmbeddings, projectMembers } from "@/lib/db/schema";
import { USER_TRACE } from "@/lib/events/types";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { processMemoryJobs } from "@/lib/memory/jobs";
import type { Principal } from "@/lib/memory/policy";
import { getOverview } from "@/lib/memory/queries";
import { retrieveMemory } from "@/lib/memory/retrieval/engine";
import { createMemoryTx } from "@/lib/memory/service";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

let alice: Actor;
let bob: Actor;
let eve: Actor;
let slugA: string;
let slugB: string;
let projectA: string;
let projectB: string;
let modelId: string;

const asUser = (a: Actor, role: "owner" | "editor" = "editor"): Principal => ({ kind: "user", userId: a.id, role });
const accessOf = (a: Actor, slug: string) => loadProjectAccess(a, { slug }, "project:read");
const titles = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);

async function make(a: Actor, slug: string, title: string, content: string, visibility: "project" | "private" = "project") {
  const access = await accessOf(a, slug);
  return db.transaction((tx) =>
    createMemoryTx(tx, access, { title, content, category: "product", importance: "normal" }, USER_TRACE, { visibility }),
  );
}

// "who pays for infrastructure costs" and the hosting note mean the same thing and share no word.
const CONCEPTS = { "infrastructure costs": 7, "vercel bill": 7, "tax rules": 9 };
let embedder = fakeEmbedder("");

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  eve = await createUser("Eve");
  slugA = await project(alice, "A web shop with login and payments for my bakery.");
  slugB = await project(eve, "A recipe sharing app for home cooks and friends.");
  projectA = (await accessOf(alice, slugA)).project.id;
  projectB = (await accessOf(eve, slugB)).project.id;
  await db.insert(projectMembers).values({ projectId: projectA, userId: bob.id, role: "editor" });
  modelId = await installEmbeddingModel();
  embedder = fakeEmbedder(modelId, { concepts: CONCEPTS });
});
afterEach(removeEmbeddingModel);

const enable = async (a: Actor, slug: string) => {
  await setSemanticSearch(a, slug, { enabled: true, consent: CONSENT_VERSION });
  await processMemoryJobs({ embedder });
};

describe("semantic retrieval", () => {
  it("finds a memory by meaning when no word matches, and says semantic is on", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await make(alice, slugA, "Colours", "Brand blue and warm white");
    await enable(alice, slugA);
    const result = await retrieveMemory(asUser(bob), projectA, { query: "who pays for infrastructure costs", embedder });
    expect(result.semantic).toBe("on");
    expect(titles(result)[0]).toBe("Hosting");
    expect(titles(result)).not.toContain("Colours");
  });

  it("says off and still answers by words when the project did not opt in", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    const result = await retrieveMemory(asUser(bob), projectA, { query: "Vercel bill", embedder });
    expect(result.semantic).toBe("off");
    expect(titles(result)).toEqual(["Hosting"]);
  });

  it("falls back to words and says degraded when the provider fails", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    const down = fakeEmbedder(modelId, { concepts: CONCEPTS, fail: true });
    const result = await retrieveMemory(asUser(bob), projectA, { query: "Vercel bill", embedder: down });
    expect(result.semantic).toBe("degraded");
    expect(titles(result)).toEqual(["Hosting"]);
  });

  it("never returns another project's memory, even with the identical meaning", async () => {
    await make(alice, slugA, "Hosting A", "The client covers the Vercel bill");
    await make(eve, slugB, "Hosting B", "Customers pay the Vercel bill themselves");
    await enable(alice, slugA);
    await enable(eve, slugB);
    const a = await retrieveMemory(asUser(bob), projectA, { query: "who pays for infrastructure costs", embedder });
    expect(titles(a)).toEqual(["Hosting A"]);
    const b = await retrieveMemory(asUser(eve, "owner"), projectB, { query: "who pays for infrastructure costs", embedder });
    expect(titles(b)).toEqual(["Hosting B"]);
  });

  it("does not find a private memory by meaning, because it was never embedded", async () => {
    await make(alice, slugA, "Vendor price", "The Vercel bill we negotiated", "private");
    await enable(alice, slugA);
    expect(await db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.projectId, projectA))).toHaveLength(0);
    const result = await retrieveMemory(asUser(alice, "owner"), projectA, { query: "who pays for infrastructure costs", embedder });
    expect(titles(result)).not.toContain("Vendor price");
  });

  it("applies the access filter to the vector list: an agent without memory access gets nothing", async () => {
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await enable(alice, slugA);
    const agent: Principal = { kind: "agent", agentId: "00000000-0000-4000-8000-000000000001", creatorId: alice.id, canReadMemory: false };
    const result = await retrieveMemory(agent, projectA, { query: "who pays for infrastructure costs", embedder });
    expect(result.items).toEqual([]);
  });
});

describe("the overview", () => {
  it("shows off, then indexing, then on", async () => {
    const access = await accessOf(alice, slugA);
    expect((await getOverview(access)).semantic.state).toBe("off");
    await make(alice, slugA, "Hosting", "The client covers the Vercel bill");
    await setSemanticSearch(alice, slugA, { enabled: true, consent: CONSENT_VERSION });
    expect((await getOverview(access)).semantic).toMatchObject({ state: "indexing", indexed: 0, total: 1 });
    await processMemoryJobs({ embedder });
    expect((await getOverview(access)).semantic).toMatchObject({ state: "on", indexed: 1, total: 1 });
  });
});
```

Add to `tests/memory/retrieval-pure.test.ts` (import `rrf` is already there):

```ts
it("fuses a vector list with the text lists: an item found only by meaning still ranks", () => {
  const fused = rrf([["a", "b"], [], ["z", "a"]]);
  expect(fused.get("z")).toBeGreaterThan(0);
  expect([...fused].sort((x, y) => y[1] - x[1])[0][0]).toBe("a");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/integration/memory-semantic.test.ts`
Expected: FAIL (`embedder` is not a retrieve option, `semantic` is always `"off"`, `getOverview().semantic` is a string).

- [ ] **Step 3: Implement `vector.ts`**

```ts
import "server-only";
import { and, cosineDistance, eq, type SQL, sql } from "drizzle-orm";
import { activeEmbeddingModelId, type EmbedderOverride, embedTexts } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import { memories, memoryAssets, memoryEmbeddings, projectSettings, wikiChunks, wikiSources } from "@/lib/db/schema";
import { countEmbeddable, countEmbedded } from "../embed/sources";

/** Nearest vectors taken per list, before fusion. */
export const VECTOR_LIMIT = 30;
/**
 * A vector farther than this (cosine distance) is not "similar", so it is not a candidate: the nearest
 * neighbour of an unrelated question is never allowed to push out the text matches. Tune with the
 * real model on real memories before release; the fake embedder in tests uses unit vectors.
 */
export const MAX_COSINE_DISTANCE = 0.6;
/** The question is embedded within this time; the retrieval budget as a whole is 1500 ms. */
export const QUERY_EMBED_MS = 900;

/** The embedding model's id when this project opted in and a model exists; otherwise null (semantic is off). */
export async function semanticModelFor(projectId: string, override?: EmbedderOverride): Promise<string | null> {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) return null;
  return override?.modelId ?? (await activeEmbeddingModelId());
}

/** Embeds the question. Throws when the provider cannot answer in time; the caller degrades. */
export async function embedQuery(projectId: string, query: string, override?: EmbedderOverride): Promise<number[]> {
  const out = await embedTexts({
    projectId,
    texts: [query],
    signal: AbortSignal.timeout(QUERY_EMBED_MS),
    override,
  });
  return out.vectors[0];
}

/** Ids of the nearest assets, under the caller's access filter (`base`). */
export async function nearestAssets(base: SQL | undefined, projectId: string, modelId: string, vector: number[]): Promise<string[]> {
  const distance = cosineDistance(memoryEmbeddings.embedding, vector);
  const rows = await db
    .select({ id: memoryAssets.id })
    .from(memoryEmbeddings)
    .innerJoin(memoryAssets, eq(memoryAssets.id, memoryEmbeddings.assetId))
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(and(base, eq(memoryEmbeddings.projectId, projectId), eq(memoryEmbeddings.modelId, modelId), sql`${distance} < ${MAX_COSINE_DISTANCE}`))
    .orderBy(distance)
    .limit(VECTOR_LIMIT);
  return rows.map((r) => r.id);
}

/** Ids of the nearest wiki chunks, under the caller's access filter (`base`). */
export async function nearestChunks(base: SQL | undefined, projectId: string, modelId: string, vector: number[]): Promise<string[]> {
  const distance = cosineDistance(memoryEmbeddings.embedding, vector);
  const rows = await db
    .select({ id: wikiChunks.id })
    .from(memoryEmbeddings)
    .innerJoin(wikiChunks, eq(wikiChunks.id, memoryEmbeddings.chunkId))
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .where(and(base, eq(memoryEmbeddings.projectId, projectId), eq(memoryEmbeddings.modelId, modelId), sql`${distance} < ${MAX_COSINE_DISTANCE}`))
    .orderBy(distance)
    .limit(VECTOR_LIMIT);
  return rows.map((r) => r.id);
}

/** What the Memory overview says: off, indexing (part of the project is embedded) or on. */
export async function getSemanticOverview(projectId: string) {
  const [settings] = await db
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  const modelId = await activeEmbeddingModelId();
  const enabled = Boolean(settings?.on);
  if (!enabled || !modelId) return { state: "off" as const, enabled, modelConfigured: Boolean(modelId), indexed: 0, total: 0 };
  const [total, indexed] = await Promise.all([countEmbeddable(projectId), countEmbedded(projectId, modelId)]);
  return { state: indexed < total ? ("indexing" as const) : ("on" as const), enabled, modelConfigured: true, indexed, total };
}
```

- [ ] **Step 4: Wire the engine**

In `src/lib/memory/retrieval/engine.ts`:
- Import `type EmbedderOverride` from `@/lib/ai/embeddings`, `type SemanticState` from `@/lib/domain/memory`, and `{ embedQuery, nearestAssets, semanticModelFor }` from `./vector`.
- `RetrieveOptions` gains `/** Tests inject an embedder; production uses the platform's model. */ embedder?: EmbedderOverride;`.
- `RetrievalResult.semantic` becomes `semantic: Exclude<SemanticState, "indexing">;` and the comment becomes `/** off: full text and exact match only; on: also by meaning; degraded: by meaning was wanted but failed. */`.
- `retrieveMemory` returns `{ items: outcome.items, semantic: outcome.semantic }` on success and `semantic: "off"` on timeout and on error (as now). Change `Promise.race([run(...), timeout])` handling: `run` returns `{ items, semantic }`; `recordTelemetry(principal, projectId, query, outcome.items, …)`.
- In `run`, replace the empty vector slot. Declare `let semantic: "on" | "off" | "degraded" = "off";` before the `if (query)` block, and replace `// Slot for the vector list ... lists.push([]);` with:

```ts
    const modelId = await semanticModelFor(projectId, options.embedder);
    if (modelId) {
      try {
        const vector = await embedQuery(projectId, query, options.embedder);
        lists.push(await nearestAssets(base, projectId, modelId, vector));
        semantic = "on";
      } catch (error) {
        // Not the error itself: it can quote the query. The text lists above still answer.
        log.warn("memory.semantic.degraded", { projectId, error: error instanceof Error ? error.name : "error" });
        semantic = "degraded";
      }
    }
```

- Make `run` return `{ items: RetrievedItem[]; semantic }`: every early `return []` becomes `return { items: [], semantic }` and the final `return fitted.map(...)` becomes `return { items: fitted.map(...), semantic }` (move the `semantic` declaration above the first early return, at the top of `run`).

In `src/lib/memory/wiki/retrieve.ts` apply the same: `retrieveWiki(principal, projectId, options: { query: string; budget?: Partial<Budget>; embedder?: EmbedderOverride })`; `WikiResult.semantic: "on" | "off" | "degraded"`; `run` returns `{ passages, semantic }`; after the exact-token list add the same `semanticModelFor` / `embedQuery` block using `nearestChunks(base, projectId, modelId, vector)` and `lists.push(...)`. The `base` filter and `from()` are reused unchanged.

In `src/lib/memory/queries.ts` replace the `Overview.semantic: "off"` type with:

```ts
  /** State of semantic search for this project. */
  semantic: Awaited<ReturnType<typeof getSemanticOverview>>;
```

import `getSemanticOverview` from `./retrieval/vector`, and in `getOverview` replace `semantic: "off",` with `semantic: await getSemanticOverview(access.project.id),`.

In `src/lib/tools/catalog.ts` (line ~105) change "Full text search only; no semantic …" to: "Full text and exact match, plus search by meaning when the project turned it on; the result says `semantic`: on, off or degraded." Read the surrounding string first to keep its quoting.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/integration/memory-semantic.test.ts tests/memory tests/integration/memory-governance.test.ts tests/integration/memory-wiki.test.ts && pnpm exec tsc --noEmit`
Expected: PASS. Existing assertions about `semantic: "off"` keep passing because no project opted in.

- [ ] **Step 6: Add the wiki test and run it**

Append to `tests/integration/memory-wiki.test.ts` (it already has `addDoc`, `syncWikiFromDocuments`, `asUser`, `projectA`; add imports for `installEmbeddingModel`, `removeEmbeddingModel`, `fakeEmbedder`, `setSemanticSearch`, `CONSENT_VERSION`, `processMemoryJobs` as needed and an `afterEach(removeEmbeddingModel)`):

```ts
describe("wiki by meaning", () => {
  it("finds a passage by meaning for a project that opted in, and not for one that did not", async () => {
    await addDoc("billing", "# Billing\n\n## Refunds\n\nRefunds return to the original method within 7 days.\n");
    await syncWikiFromDocuments(projectA);
    const modelId = await installEmbeddingModel();
    const embedder = fakeEmbedder(modelId, { concepts: { "money back": 3, "refunds return": 3 } });
    expect((await retrieveWiki(asUser(alice), projectA, { query: "how long for money back", embedder })).semantic).toBe("off");
    await setSemanticSearch(alice, slugA, { enabled: true, consent: CONSENT_VERSION });
    await processMemoryJobs({ embedder });
    const result = await retrieveWiki(asUser(alice), projectA, { query: "how long for money back", embedder });
    expect(result.semantic).toBe("on");
    expect(result.passages[0]?.heading).toBe("Billing › Refunds");
  });
});
```

Run: `pnpm exec vitest run tests/integration/memory-wiki.test.ts`
Expected: PASS. (If the heading text differs, assert the actual heading path produced by `indexWikiSource` for that document; the point of the test is rank one and `semantic: "on"`.)

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: vector lists in memory and wiki retrieval, with an honest semantic state"
```

---

### Task 7: The Owner picks the embedding model

**Files:**
- Modify: `src/components/platform/model-manager.tsx`, `src/app/[locale]/(app)/dashboard/ai/models/page.tsx`, `messages/platform.en.json`, `messages/platform.id.json`
- Test: `tests/integration/embeddings-gateway.test.ts` (already covers the action's rules); verify the UI in the browser

**Interfaces:**
- Consumes: `setEmbeddingModelAction` (Task 5), models with capability `embeddings`.
- Produces: an "Embedding model" section on AI & Models, with a select and the cost and privacy note.

- [ ] **Step 1: Pass the stored value to the component**

Open `src/app/[locale]/(app)/dashboard/ai/models/page.tsx`, find where `defaultModelId` and `fallbackModelId` are passed to `ModelManager` (from the platform settings row) and add `embeddingModelId={settings.embeddingModelId ?? null}` beside them. In `src/components/platform/model-manager.tsx` add `embeddingModelId: string | null` to the props type and destructuring next to `fallbackModelId`, and import `setEmbeddingModelAction` with `setDefaultsAction` from the actions module.

- [ ] **Step 2: Add the section**

In `model-manager.tsx`, after the closing `</section>` of the defaults section and before `{fetching ? (`, add:

```tsx
      <section aria-labelledby={`${id}-embedding`} className="rounded-lg border border-border p-5">
        <h2 id={`${id}-embedding`} className="font-semibold">
          {t("embedding.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("embedding.body")}</p>
        <form
          key={embeddingModelId ?? "none"}
          className="mt-4 grid gap-4 sm:grid-cols-2"
          action={(form) =>
            run(() => setEmbeddingModelAction({ modelId: String(form.get("embedding") ?? "") || null }))
          }
        >
          <Select
            id={`${id}-embedding-select`}
            name="embedding"
            label={t("embedding.label")}
            defaultValue={embeddingModelId ?? ""}
          >
            <option value="">{t("noneOption")}</option>
            {models
              .filter((m) => m.capabilities.includes("embeddings") && usable(m))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.providerName} / {m.displayName}
                </option>
              ))}
          </Select>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("embedding.save")}
            </Button>
          </div>
        </form>
      </section>
```

`usable` is the existing helper that the model list already calls (`usable(m)`); if it excludes embedding-only models (it uses `modelUsable`), replace it here with a local predicate `m.status === "available"` so an embedding-only model is selectable. Check the names `models`, `usable`, `t` against the surrounding code and adjust to the component's own variable names.

Messages: in `messages/platform.en.json` add to the same object that holds `"defaults"` and `"saveDefaults"` for the models page:

```json
"embedding": {
  "title": "Embedding model",
  "body": "Turns text into vectors for semantic search. Project text that a project agreed to share is sent to this provider, and every call is counted in usage. Anthropic has no embedding model; use an OpenAI-compatible or Gemini one.",
  "label": "Embedding model",
  "save": "Save embedding model"
}
```

and in `messages/platform.id.json`:

```json
"embedding": {
  "title": "Model embedding",
  "body": "Mengubah teks menjadi vektor untuk pencarian semantik. Teks proyek yang disetujui untuk dibagikan dikirim ke penyedia ini, dan setiap panggilan tercatat di pemakaian. Anthropic tidak punya model embedding; pakai yang kompatibel OpenAI atau Gemini.",
  "label": "Model embedding",
  "save": "Simpan model embedding"
}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && ./node_modules/.bin/biome check src messages tests`
Expected: no type errors; only the two existing Biome warnings.

Browser (local database `saqinadev_ui`, `next start` as in the browser verification recipe): sign in as the demo owner, open AI & Models, connect a provider with an OpenAI-compatible base URL, fetch models (an `embed` model now appears with the Embeddings capability), choose it under Embedding model, save, reload and see it selected. A model without the capability is not offered.

- [ ] **Step 4: Commit**

```bash
git add src messages
git commit -m "feat: the Owner chooses the embedding model"
```

---

### Task 8: Memory overview status and the consent switch

**Files:**
- Create: `src/components/memory/semantic-switch.tsx`
- Modify: `src/components/memory/memory-overview.tsx`, `src/app/[locale]/(app)/project/[slug]/memory/actions.ts`, `src/app/[locale]/(app)/project/[slug]/memory/wiki/page.tsx` (the `t("semantic")` line), `messages/memory-hub.en.json`, `messages/memory-hub.id.json`

**Interfaces:**
- Consumes: `Overview.semantic` (Task 6), `setSemanticSearch`, `CONSENT_VERSION`.
- Produces: `setSemanticSearchAction(slug, enabled)`; the overview shows the state; admins see the switch with the consent dialog.

- [ ] **Step 1: The action**

In `src/app/[locale]/(app)/project/[slug]/memory/actions.ts` add the import `import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";` and at the end:

```ts
/** Turns semantic search on (after the consent dialog) or off. The vectors are deleted when it goes off. */
export async function setSemanticSearchAction(slug: string, enabled: boolean) {
  return runAction("memory.semantic", { slug }, async () => {
    const result = await setSemanticSearch(await requireActor(), slug, {
      enabled,
      consent: enabled ? CONSENT_VERSION : undefined,
    });
    refresh();
    return result;
  });
}
```

(`runAction`, `requireActor` and `refresh` are already imported or defined in this file.)

- [ ] **Step 2: The switch**

`src/components/memory/semantic-switch.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { setSemanticSearchAction } from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";

/** Turns semantic search on (with a consent dialog) or off. Only admins see it. */
export function SemanticSwitch({
  slug,
  enabled,
  modelConfigured,
}: {
  slug: string;
  enabled: boolean;
  modelConfigured: boolean;
}) {
  const t = useTranslations("memory.semanticSearch");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();

  if (!enabled && !modelConfigured) return <p className="text-sm text-muted-foreground">{t("noModel")}</p>;
  return (
    <div>
      <Button size="sm" variant={enabled ? "outline" : "default"} disabled={pending} onClick={() => setOpen(true)}>
        {enabled ? t("disable") : t("enable")}
      </Button>
      <FormError error={error} />
      <ConfirmDialog
        open={open}
        title={enabled ? t("disableTitle") : t("consentTitle")}
        body={<p>{enabled ? t("disableBody") : t("consentBody")}</p>}
        confirmLabel={enabled ? t("disable") : t("consentConfirm")}
        pending={pending}
        onConfirm={() =>
          run(
            () => setSemanticSearchAction(slug, !enabled),
            () => setOpen(false),
          )
        }
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
```

Check `ConfirmDialog`'s props against `src/components/app/confirm-dialog.tsx` (it is used in `repository-panel.tsx` with `open`, `title`, `body`, `confirmLabel`, `pending`, `onConfirm`, `onClose`; `confirmText` is optional). `useRun` returns `{ pending, error, run }` as in `repository-panel.tsx`.

- [ ] **Step 3: The overview**

In `src/components/memory/memory-overview.tsx` import `SemanticSwitch` and replace the semantic `div`:

```tsx
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t("stats.semantic")}</dt>
          <dd>
            {overview.semantic.state === "indexing"
              ? t("semanticSearch.indexing", { done: overview.semantic.indexed, total: overview.semantic.total })
              : overview.semantic.state === "on"
                ? t("semanticSearch.on")
                : overview.semantic.modelConfigured
                  ? t("semanticSearch.off")
                  : t("semanticSearch.noModel")}
          </dd>
        </div>
```

and, below the `<dl>` for admins:

```tsx
      {admin ? (
        <SemanticSwitch slug={slug} enabled={overview.semantic.enabled} modelConfigured={overview.semantic.modelConfigured} />
      ) : null}
```

Remove the now-unused `semanticOff` key from both message files only if nothing else uses it (`grep -rn semanticOff src`). In `src/app/[locale]/(app)/project/[slug]/memory/wiki/page.tsx` the line `t("semantic")` shows a fixed "off" sentence: replace it with `t("semanticSearch.hint")` and add the key below.

- [ ] **Step 4: Messages**

Add to the `memory` object in `messages/memory-hub.en.json`:

```json
"semanticSearch": {
  "on": "On. Memory and wiki are also searched by meaning.",
  "indexing": "On, indexing: {done} of {total} items are ready. Until then words and exact matches carry the search.",
  "off": "Off. Memory is searched by words and exact matches.",
  "noModel": "Off. The platform owner has not chosen an embedding model yet.",
  "hint": "Searched by words and exact matches, and by meaning when the project turned that on.",
  "enable": "Turn on semantic search",
  "disable": "Turn off semantic search",
  "consentTitle": "Send project text to an embedding provider?",
  "consentBody": "Approved memories and wiki passages that the whole project can read are sent to the platform's embedding provider so they can be searched by meaning. Private items are never sent. You can turn this off at any time; the stored vectors are then deleted.",
  "consentConfirm": "Turn on",
  "disableTitle": "Turn off semantic search?",
  "disableBody": "The stored vectors of this project are deleted and search goes back to words and exact matches."
}
```

and the same keys in `messages/memory-hub.id.json`:

```json
"semanticSearch": {
  "on": "Aktif. Memory dan wiki juga dicari berdasarkan makna.",
  "indexing": "Aktif, sedang diindeks: {done} dari {total} item siap. Sampai selesai, kata dan pencocokan persis yang menjalankan pencarian.",
  "off": "Mati. Memory dicari lewat kata dan pencocokan persis.",
  "noModel": "Mati. Pemilik platform belum memilih model embedding.",
  "hint": "Dicari lewat kata dan pencocokan persis, dan berdasarkan makna bila proyek mengaktifkannya.",
  "enable": "Aktifkan pencarian semantik",
  "disable": "Matikan pencarian semantik",
  "consentTitle": "Kirim teks proyek ke penyedia embedding?",
  "consentBody": "Memory dan potongan wiki yang disetujui dan bisa dibaca seluruh proyek dikirim ke penyedia embedding platform agar bisa dicari berdasarkan makna. Item privat tidak pernah dikirim. Anda bisa mematikannya kapan saja; vektor yang tersimpan lalu dihapus.",
  "consentConfirm": "Aktifkan",
  "disableTitle": "Matikan pencarian semantik?",
  "disableBody": "Vektor proyek ini dihapus dan pencarian kembali ke kata dan pencocokan persis."
}
```

The namespace is `memory` (the overview already calls `getTranslations("memory")`); keep the nesting identical in both files. A test already checks that both languages have the same keys.

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/messages tests/integration/memory-semantic.test.ts`
(If the messages test lives elsewhere, run the whole `tests/` pattern that mentions "messages": `pnpm exec vitest run -t "messages"`.)
Expected: PASS.

Browser: in the local UI database as the demo owner, open Memory. With no embedding model the overview says "Off. The platform owner has not chosen an embedding model yet." and the switch is replaced by the same note. After choosing a model (Task 7), the switch appears; the consent dialog shows the text, "Turn on" starts indexing ("On, indexing: x of y"), and turning it off shows the dialog and returns to "Off". Check 320 px and 1280 px for horizontal scroll, keyboard focus in the dialog, and both languages.

- [ ] **Step 6: Commit**

```bash
git add src messages
git commit -m "feat: semantic search status and consent switch on the Memory overview"
```

---

### Task 9: Documents

**Files:**
- Create: `docs/adr/0024-semantic-search.md`
- Modify: `docs/PRD.md` (A8), `docs/adr/0004-project-memory.md` (the "Semantic search (phase F)" limitation, line ~210), `README.md`, `docs/runbook.md`, `docs/superpowers/specs/2026-11-03-semantic-search-design.md` (the six refinements), the owner guide that describes the Memory page (`src/content/docs/owner/en/*.md` and `.../id/*.md`; find it with `grep -ln "Memory" src/content/docs/owner/en/*.md`)

**Interfaces:** none (documents).

- [ ] **Step 1: ADR 0024**

Write `docs/adr/0024-semantic-search.md` in the style of ADR 0020: Status accepted (date of the merge), Risk lane Red. Context: lexical retrieval only, `semantic: off`. Decision: the reconcile job and its triggers; the `memory_embeddings` table with exact per-project search; opt-in per project with a recorded consent version; only `project` visibility is embedded; OpenAI-compatible and Gemini through the gateway with no fallback between models; the three-list fusion and the `on`, `off`, `degraded` states. Alternatives: vector columns on the source tables (hard to swap models), an external vector database (second source of truth and a copy of the access rules), HNSW now (recall loss under strict filters). Consequences: cost and latency of one embedding call per query, 900 ms limit and the degraded path, the daily cron as a safety net, a model change re-embeds everything, the consent text needs the owner's wording review, `MAX_COSINE_DISTANCE` needs tuning with the real model, HNSW is the next step when one project passes tens of thousands of rows.

- [ ] **Step 2: PRD, README, ADR 0004, runbook, spec**

- `docs/PRD.md`: change A8 from Planned to Built for "Semantic (vector) search" and keep wiki, skills and code-graph assets as they are (read the A8 row first; split it so the part that is built says Built and any remaining part stays Planned). Add a row under 5.6 (the next free number; at execution time that was A19): "A19 | A project opts in to semantic search (admin, consent recorded, default off); approved memory and wiki text that the whole project can read is embedded by the platform's embedding model and searched by meaning together with words and exact matches; private items are never sent; the result says on, off or degraded ([ADR 0024](../../adr/0024-semantic-search.md)) | Built". Remove "When semantic search becomes worth the pgvector and embedding cost (A8)" from the open questions.
- `README.md`: in the Documentation list replace "(semantic search is off, and the UI says so)" with "(also by meaning for a project that opted in, ADR 0024; the UI says on, off or degraded)". In Prerequisites add: "PostgreSQL 14+ with the `vector` extension available (pgvector), which the migrations create".
- `docs/adr/0004-project-memory.md`: replace the "Semantic search (phase F)" limitation paragraph with a pointer: "Semantic search was added in [ADR 0024](../../adr/0024-semantic-search.md)." (from `docs/adr/0004-project-memory.md` itself the link is `0024-semantic-search.md`)
- `docs/runbook.md`: under "Deploy" add: "Migration 0039 runs `CREATE EXTENSION vector`. On Neon the project owner role may create it; check with `select * from pg_extension where extname = 'vector'` after the migration." and a short "Semantic search" section: how to turn the platform model off (AI & Models, Embedding model: none) and that turning a project's switch off deletes its vectors.
- Spec: edit the spec so it matches the plan's six refinements (table names `asset_id` and `chunk_id`, the `embed_project` job, only `project` visibility, the switch on the Memory overview, the three retrieval states, the trigger list).

- [ ] **Step 3: The owner guide**

In the owner guide that describes Memory (English and Indonesian, same change), add a short section "Semantic search" with: what it does (finds by meaning), that it is off until a project admin turns it on, what is sent (approved memory and wiki text the whole project can read, never private items), where the owner picks the model (AI & Models, Embedding model), what the three states mean, and that turning it off deletes the vectors. Follow the guide's existing heading and tone. Screenshots: take them from the local UI database after Task 8 and copy the PNGs into `src/content/docs/assets/owner/` as the documentation standard requires (hand the `cp` commands to the owner if the sandbox refuses the copy). Run `pnpm exec vitest run tests/docs` afterwards.

- [ ] **Step 4: Verify and commit**

Run: `./node_modules/.bin/biome check . && pnpm exec vitest run tests/docs`
Expected: only the two existing Biome warnings; docs tests pass.

```bash
git add docs README.md src/content
git commit -m "docs: ADR 0024, PRD, README, runbook and owner guide for semantic search"
```

---

### Task 10: Verification and review

**Files:** none (checks).

- [ ] **Step 1: The full gates**

```bash
pnpm exec tsc --noEmit && ./node_modules/.bin/biome check . && pnpm exec vitest run
```

Expected: no type errors; only the two existing Biome warnings; every test passes. Then `pnpm build` (use the local UI database environment from the browser verification recipe). Expected: success.

- [ ] **Step 2: Adversarial review (Red lane)**

A separate reviewer, told to assume the author is wrong, reads the diff for: (a) any path where a vector or its text reaches a response, a log or an audit row; (b) any query on `memory_embeddings` that is not limited by project and by `visibleWhere`; (c) any place that embeds a `private`, `restricted` or `agent` asset; (d) the consent check (can `enabled: true` be set without the consent version or without `members:manage`?); (e) the migration (expand-only, idempotent extension, no data loss); (f) timeouts (does the question embedding ever block retrieval past its 1500 ms budget?); (g) cost control (batch size, per-run cap, rate limits on the embedding call). Record the findings in the pull request.

- [ ] **Step 3: Try it on Neon safely**

Run `pnpm db:migrate:neon --backup` (the snapshot is the restore point) in a real terminal tab, then in production: create or choose an embedding model on AI & Models, turn semantic search on for one test project, check the overview reaches "On", and run a question that shares no words with a memory. Tune `MAX_COSINE_DISTANCE` from what you see, and have the owner review the consent wording in both languages.

- [ ] **Step 4: Report**

Update the pull request text with the lane (Red), the tool and model that wrote it (AI-written, owner-reviewed), the adversarial review result, and the open items (distance threshold tuned, consent wording reviewed). No `Co-Authored-By` trailer.

---

## Self-review (against the spec)

Spec coverage: scope memory and wiki (Tasks 5, 6); separate table and exact search (3, 6); OpenAI-compatible and Gemini (2); opt-in per project with audit and no private items (5, 8); gateway operation and capability (1, 4); write path, idempotent, batched, backfill on switch and model change (5); read path with the question embedded under a limit, `visibleWhere`, `rrf` and the three states (6); UI for the Owner and the project (7, 8); security (the checks in 5, 6 and the review in 10); tests (each task, no network); migration and CI image (3); docs and ADR (9); out-of-scope items are not planned.

Placeholders: none left; the two places that depend on code I did not open (the `usable` helper name in `model-manager.tsx`, the `ConfirmDialog` props, the heading text in the wiki test) are marked with an explicit check to run in the step itself.

Type consistency: `EmbedderOverride`, `embedTexts`, `activeEmbeddingModelId`, `reconcileProject`, `enqueueEmbedProject`, `requeueAllEmbeddings`, `setSemanticSearch`, `CONSENT_VERSION`, `semanticModelFor`, `embedQuery`, `nearestAssets`, `nearestChunks`, `getSemanticOverview`, `SemanticState`, `EMBEDDING_DIMENSIONS` and `setEmbeddingModel` are named the same in every task that uses them.
