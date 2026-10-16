ALTER TABLE "project_changes" ADD COLUMN "detail" jsonb;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "human_edited_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "memories_dedupe_idx" ON "memories" USING btree ("project_id","dedupe_key") WHERE "memories"."dedupe_key" is not null;