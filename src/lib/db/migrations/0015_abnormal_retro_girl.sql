CREATE TABLE "prd_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at_revision" integer NOT NULL,
	"last_seen_revision" integer NOT NULL,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"dismissed_by" text
);
--> statement-breakpoint
ALTER TABLE "prd_findings" ADD CONSTRAINT "prd_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prd_findings" ADD CONSTRAINT "prd_findings_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prd_findings_fingerprint_idx" ON "prd_findings" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "prd_findings_status_idx" ON "prd_findings" USING btree ("project_id","status");