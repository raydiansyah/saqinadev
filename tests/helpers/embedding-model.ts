import { eq } from "drizzle-orm";
import { platformSettings } from "@/lib/ai/catalog";
import { db } from "@/lib/db/client";
import { aiModels, aiProviders, credentials, platformAiSettings } from "@/lib/db/schema";
import { storeCredential } from "@/lib/secrets/service";

/** Every row this helper creates carries this marker, so parallel test files cannot delete each other's. */
const MARKER = `Embed test ${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * An embedding model in the registry, chosen as the platform's, with no real provider behind it.
 * Pass `credentialBy` (a user id) to give the provider a stored key, so a call reaches the network.
 */
export async function installEmbeddingModel(
  options: { credentialBy?: string } = {},
): Promise<string> {
  const credentialId = options.credentialBy
    ? await storeCredential(db, {
        scope: "platform",
        kind: "ai_provider",
        label: MARKER,
        secret: "test-key-not-real",
        createdBy: options.credentialBy,
      })
    : null;
  const [provider] = await db
    .insert(aiProviders)
    .values({
      slug: `embed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: MARKER,
      type: "custom",
      adapter: "openai_compatible",
      baseUrl: "http://127.0.0.1:1",
      status: "connected",
      credentialId,
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
  await db
    .update(platformAiSettings)
    .set({ embeddingModelId: null })
    .where(eq(platformAiSettings.id, 1));
  await db.delete(aiProviders).where(eq(aiProviders.name, MARKER));
  await db.delete(credentials).where(eq(credentials.label, MARKER));
}
