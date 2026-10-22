CREATE TABLE "memory_acl" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_type" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"owner_id" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
	"content_hash" text NOT NULL,
	"dedupe_key" text,
	"supersedes_id" uuid,
	"conflict_with_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"last_indexed_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"asset_id" uuid,
	"selector" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" text DEFAULT 'always' NOT NULL,
	"task_types" text[],
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"input" jsonb NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_retrievals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"requester_kind" text NOT NULL,
	"agent_id" uuid,
	"query_hash" text NOT NULL,
	"result_count" integer NOT NULL,
	"asset_ids" jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"degraded" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"locator" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"edited_by" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "level" text DEFAULT 'L1' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "kind" text DEFAULT 'fact' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "confidence" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_acl" ADD CONSTRAINT "memory_acl_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_acl" ADD CONSTRAINT "memory_acl_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_bindings" ADD CONSTRAINT "memory_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_bindings" ADD CONSTRAINT "memory_bindings_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_bindings" ADD CONSTRAINT "memory_bindings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_jobs" ADD CONSTRAINT "memory_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_retrievals" ADD CONSTRAINT "memory_retrievals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sources" ADD CONSTRAINT "memory_sources_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_tombstones" ADD CONSTRAINT "memory_tombstones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_tombstones" ADD CONSTRAINT "memory_tombstones_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_versions" ADD CONSTRAINT "memory_versions_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_versions" ADD CONSTRAINT "memory_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_acl_principal_idx" ON "memory_acl" USING btree ("asset_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "memory_acl_lookup_idx" ON "memory_acl" USING btree ("principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "memory_assets_scope_idx" ON "memory_assets" USING btree ("project_id","status","visibility");--> statement-breakpoint
CREATE INDEX "memory_assets_owner_idx" ON "memory_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "memory_assets_search_idx" ON "memory_assets" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_assets_dedupe_idx" ON "memory_assets" USING btree ("project_id","dedupe_key") WHERE "memory_assets"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "memory_bindings_target_idx" ON "memory_bindings" USING btree ("project_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_jobs_key_idx" ON "memory_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "memory_jobs_due_idx" ON "memory_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "memory_jobs_project_idx" ON "memory_jobs" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "memory_retrievals_project_idx" ON "memory_retrievals" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "memory_sources_asset_idx" ON "memory_sources" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "memory_sources_ref_idx" ON "memory_sources" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_tombstones_key_idx" ON "memory_tombstones" USING btree ("project_id","key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_versions_asset_idx" ON "memory_versions" USING btree ("asset_id","version");--> statement-breakpoint
-- Backfill: every existing memory becomes an approved, project-visible L1 asset with a v1 version
-- and a source pointing at what it was written about. Nothing is dropped or rewritten.
UPDATE "memories" SET "asset_id" = gen_random_uuid() WHERE "asset_id" IS NULL;--> statement-breakpoint
UPDATE "memories" SET "confidence" = CASE "source"
  WHEN 'user' THEN 'confirmed' WHEN 'interview' THEN 'confirmed' WHEN 'recommendation' THEN 'confirmed'
  WHEN 'system' THEN 'derived' WHEN 'imported' THEN 'derived' ELSE 'extracted' END;--> statement-breakpoint
INSERT INTO "memory_assets" ("id","asset_type","organization_id","project_id","owner_id","visibility","status","version","title","search_text","content_hash","dedupe_key","created_at","updated_at")
SELECT m."asset_id",'chat',p."organization_id",m."project_id",m."created_by",'project','approved',1,m."title",m."title" || E'\n' || m."content",
  encode(sha256(convert_to(m."title" || E'\n' || m."content",'UTF8')),'hex'),m."dedupe_key",m."created_at",m."updated_at"
FROM "memories" m JOIN "projects" p ON p."id" = m."project_id";--> statement-breakpoint
INSERT INTO "memory_versions" ("asset_id","version","title","content","edited_by","reason")
SELECT "asset_id",1,"title","content","created_by",'backfill' FROM "memories";--> statement-breakpoint
INSERT INTO "memory_sources" ("asset_id","source_type","source_id")
SELECT "asset_id",'manual',"id"::text FROM "memories" WHERE "entity_type" IS NULL;--> statement-breakpoint
INSERT INTO "memory_sources" ("asset_id","source_type","source_id","locator")
SELECT "asset_id",CASE WHEN "entity_type" IN ('decision','document') THEN "entity_type" ELSE 'manual' END,COALESCE("entity_id","id"::text),jsonb_build_object('entity',"entity_type")
FROM "memories" WHERE "entity_type" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_asset_id_unique" UNIQUE("asset_id");