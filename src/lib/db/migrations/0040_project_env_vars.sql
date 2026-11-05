CREATE TABLE "project_env_vars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"secret" boolean DEFAULT true NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"filled" jsonb DEFAULT '{"production":false,"preview":false,"development":false}'::jsonb NOT NULL,
	"credential_id" uuid,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_env_vars" ADD CONSTRAINT "project_env_vars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_env_vars" ADD CONSTRAINT "project_env_vars_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_env_vars_name_idx" ON "project_env_vars" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "project_env_vars_project_idx" ON "project_env_vars" USING btree ("project_id");