-- One use per skill, agent and run: keep the first, drop repeats the old code could have written.
DELETE FROM "skill_usages" a USING "skill_usages" b
WHERE a."run_id" IS NOT NULL AND a."run_id" = b."run_id" AND a."asset_id" = b."asset_id"
  AND a."agent_id" IS NOT DISTINCT FROM b."agent_id" AND a."created_at" > b."created_at";--> statement-breakpoint
CREATE UNIQUE INDEX "skill_usages_run_agent_idx" ON "skill_usages" USING btree ("asset_id","run_id","agent_id") WHERE "skill_usages"."run_id" is not null;