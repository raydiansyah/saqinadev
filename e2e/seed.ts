/**
 * Prepares the end-to-end database: migrated, emptied, with an owner who is also a project member
 * and a second person who is not an owner, one project with a local git repository, and the dev AI
 * mock set up as the platform's model. Prints the project slug and repository path as JSON.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createModel, createProvider, setDefaults } from "../src/lib/ai/control-plane";
import { auth } from "../src/lib/auth/config";
import { db } from "../src/lib/db/client";
import { accounts, users } from "../src/lib/db/schema";
import { connectRepository } from "../src/lib/git/service";
import { completeInterview, saveAnswers } from "../src/lib/interviews/service";
import { ensurePersonalOrg } from "../src/lib/organizations/service";
import { startProject } from "../src/lib/projects/service";

const PASSWORD = "E2e-Passw0rd-2026!";

async function account(email: string, name: string, platformRole: "owner" | "user") {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(PASSWORD);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email, name, emailVerified: true, platformRole });
    await tx.insert(accounts).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: hash,
    });
    await ensurePersonalOrg(id, tx);
  });
  return { id, name, email, image: null };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("_e2e")) throw new Error("Refusing to empty a database whose name has no _e2e");
  await db.execute(
    sql`truncate table users, projects, rate_limits, verifications, webhook_deliveries, agent_definitions, platform_settings, ai_providers, platform_ai_settings cascade`,
  );

  const owner = await account("owner@example.test", "Saqina Owner", "owner");
  await account("member@example.test", "Plain Member", "user");

  const { id: providerId } = await createProvider(owner, {
    name: "Dev mock",
    type: "custom",
    adapter: "openai_compatible",
    baseUrl: `http://127.0.0.1:${process.env.E2E_AI_PORT ?? 4101}/v1`,
    secret: "dev-mock-key-0000",
  });
  const caps = ["text", "structured_output", "streaming", "tool_calling", "coding"];
  const model = await createModel(owner, {
    providerId,
    modelId: "saqina-dev-mock",
    displayName: "Dev mock",
    capabilities: caps,
  });
  await setDefaults(owner, { defaultModelId: model.id, fallbackModelId: null });

  const repo = mkdtempSync(join(tmpdir(), "saqina-e2e-repo-"));
  const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" });
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "# Candle shop\n");
  git("add", ".");
  git("-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "-q", "-m", "init");

  const { slug } = await startProject(
    owner,
    { idea: "An online shop selling handmade candles to local customers" },
    "en",
  );
  await saveAnswers(owner, {
    slug,
    step: "review",
    confirm: ["projectType"],
    patch: {
      objective: "Sell candles online.",
      audience: ["customers"],
      features: ["auth", "payment"],
      databaseNeed: "yes",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      details: { platforms: ["web"], authMethods: ["email"], followUps: {}, constraints: "" },
    },
  });
  await completeInterview(owner, slug);
  await connectRepository(owner, slug, { provider: "custom_local", fullName: repo });
  console.log(JSON.stringify({ slug, repo, password: PASSWORD }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
