CREATE TABLE "platform_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"content" text DEFAULT '' NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"uses" jsonb DEFAULT '["agent_run","assistant"]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"installed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_skills_slug_unique" UNIQUE("slug"),
	CONSTRAINT "platform_skills_source_check" CHECK ("platform_skills"."source" in ('builtin','paste','github'))
);
--> statement-breakpoint
ALTER TABLE "mcp_connections" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD COLUMN "scope" text DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD COLUMN "preset" text;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD COLUMN "tool_catalog" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "name_source" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_skills" ADD CONSTRAINT "platform_skills_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_skills_enabled_idx" ON "platform_skills" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_platform_name_idx" ON "mcp_connections" USING btree ("name") WHERE "mcp_connections"."scope" = 'platform';--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_scope_check" CHECK (("mcp_connections"."scope" = 'project') = ("mcp_connections"."project_id" is not null));--> statement-breakpoint
-- Imported projects keep the repository name, as before this column existed.
UPDATE "projects" SET "name_source" = 'repository' WHERE "id" IN (SELECT "project_id" FROM "repository_connections" WHERE "doc_sync_mode" = 'pull_only');
