CREATE TABLE "skill_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid,
	"user_id" text,
	"run_id" uuid,
	"skill_version" integer NOT NULL,
	"outcome" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_usages_outcome_check" CHECK ("skill_usages"."outcome" is null or "skill_usages"."outcome" in ('success','partial','failure'))
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"use_case" text DEFAULT '' NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"origin_ref" text,
	"evaluation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "skills_origin_check" CHECK ("skills"."origin" in ('manual','run'))
);
--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usages" ADD CONSTRAINT "skill_usages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_usages_asset_idx" ON "skill_usages" USING btree ("asset_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "skill_usages_run_idx" ON "skill_usages" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_origin_idx" ON "skills" USING btree ("project_id","origin_ref") WHERE "skills"."origin_ref" is not null;--> statement-breakpoint
CREATE INDEX "skills_project_idx" ON "skills" USING btree ("project_id");