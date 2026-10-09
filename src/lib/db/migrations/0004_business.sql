CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" bigint DEFAULT 0 NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid,
	"term_id" uuid,
	"number" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"issue_date" date,
	"due_date" date,
	"total" bigint DEFAULT 0 NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_counters" (
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "org_counters_organization_id_kind_year_pk" PRIMARY KEY("organization_id","kind","year")
);
--> statement-breakpoint
CREATE TABLE "payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"percent_bp" integer,
	"amount" bigint DEFAULT 0 NOT NULL,
	"due_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"paid_at" date NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"recorded_by" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"requirement_id" uuid,
	"client_visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_users" (
	"client_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_users_client_id_user_id_pk" PRIMARY KEY("client_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"default_currency" text DEFAULT 'IDR' NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ui_mode" text DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "value" bigint;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "portal_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "client_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "client_title" text;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_term_id_payment_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."payment_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invitations" ADD CONSTRAINT "client_invitations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invitations" ADD CONSTRAINT "client_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invitations" ADD CONSTRAINT "client_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_idx" ON "invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "invoices_project_idx" ON "invoices" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "payment_terms_project_idx" ON "payment_terms" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_project_idx" ON "payments" USING btree ("project_id","paid_at");--> statement-breakpoint
CREATE INDEX "scope_items_project_idx" ON "scope_items" USING btree ("project_id","category","position");--> statement-breakpoint
CREATE UNIQUE INDEX "client_invitations_token_idx" ON "client_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "client_invitations_client_idx" ON "client_invitations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_users_user_idx" ON "client_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
-- Backfill: one personal organization per existing user; their projects move into it.
INSERT INTO "organizations" ("name", "slug", "personal", "owner_id")
SELECT "name", 'personal-' || substr(md5("id"), 1, 12), true, "id" FROM "users";--> statement-breakpoint
INSERT INTO "organization_members" ("organization_id", "user_id", "role")
SELECT "id", "owner_id", 'owner' FROM "organizations";--> statement-breakpoint
UPDATE "projects" SET "organization_id" = o."id"
FROM "organizations" o WHERE o."owner_id" = "projects"."owner_id" AND o."personal" = true;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET NOT NULL;
