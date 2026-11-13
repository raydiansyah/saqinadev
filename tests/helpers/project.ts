import type { Actor } from "@/lib/auth/actor";
import { createProject } from "@/lib/projects/service";

/** A plain project for tests. The first words of `name` become the project name. */
export async function project(actor: Actor, name: string) {
  const { slug } = await createProject(actor, { name: name.slice(0, 80) }, "en");
  return slug;
}
