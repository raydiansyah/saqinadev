CREATE TABLE "org_brand" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"brand_name" text,
	"legal_name" text,
	"tax_number" text,
	"address" text,
	"accent_color" text,
	"logo_data" "bytea",
	"logo_mime" text,
	"email_from_name" text,
	"reply_to" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_brand" ADD CONSTRAINT "org_brand_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_brand" ADD CONSTRAINT "org_brand_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;