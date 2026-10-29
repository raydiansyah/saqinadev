CREATE TABLE "project_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"credential_id" uuid,
	"vars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_services_kind_check" CHECK ("project_services"."kind" in ('database','auth'))
);
--> statement-breakpoint
ALTER TABLE "project_services" ADD CONSTRAINT "project_services_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_services" ADD CONSTRAINT "project_services_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_services_label_idx" ON "project_services" USING btree ("project_id","provider","label");--> statement-breakpoint
CREATE INDEX "project_services_project_idx" ON "project_services" USING btree ("project_id");