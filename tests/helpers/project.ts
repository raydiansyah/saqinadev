import type { Actor } from "@/lib/auth/actor";
import { completeInterview, saveAnswers } from "@/lib/interviews/service";
import { startProject } from "@/lib/projects/service";

/** A project with a completed interview, ready for workspace tests. */
export async function project(actor: Actor, idea: string) {
  const { slug } = await startProject(actor, { idea }, "en");
  await saveAnswers(actor, {
    slug,
    step: "review",
    confirm: ["projectType"],
    patch: {
      objective: "Sell products online.",
      audience: ["customers"],
      features: ["auth", "payment"],
      databaseNeed: "yes",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
      details: { platforms: ["web"], authMethods: ["email"], followUps: {}, constraints: "" },
    },
  });
  await completeInterview(actor, slug);
  return slug;
}
