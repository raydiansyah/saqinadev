import { SkillManager } from "@/components/platform/skill-manager";
import { requireActorPage } from "@/lib/auth/server";
import { listPlatformSkills } from "@/lib/skills/service";

export default async function SkillsPage() {
  const actor = await requireActorPage("/dashboard/ai/skills");
  return <SkillManager skills={await listPlatformSkills(actor)} />;
}
