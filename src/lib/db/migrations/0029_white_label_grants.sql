CREATE TABLE "white_label_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"reference" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"valid_until" text,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text
);
--> statement-breakpoint
ALTER TABLE "white_label_grants" ADD CONSTRAINT "white_label_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "white_label_grants" ADD CONSTRAINT "white_label_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "white_label_grants" ADD CONSTRAINT "white_label_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "white_label_grants_org_idx" ON "white_label_grants" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "white_label_grants_open_idx" ON "white_label_grants" USING btree ("organization_id") WHERE "white_label_grants"."revoked_at" is null;