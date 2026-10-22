ALTER TABLE "skill_usages" ADD COLUMN "settled_by" text;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_settled_by_check" CHECK ("skill_usages"."settled_by" is null or "skill_usages"."settled_by" in ('user','agent','run'));
--> statement-breakpoint
-- Rows written before this column: say who settled them. A run id means the run's end did.
UPDATE "skill_usages" SET "settled_by" = CASE
  WHEN "outcome" IS NULL THEN NULL
  WHEN "run_id" IS NOT NULL THEN 'run'
  WHEN "agent_id" IS NOT NULL THEN 'agent'
  ELSE 'user' END
WHERE "settled_by" IS NULL AND "outcome" IS NOT NULL;
