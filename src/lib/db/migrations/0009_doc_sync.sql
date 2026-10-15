CREATE TABLE "agent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"path" text NOT NULL,
	"remote_hash" text,
	"pushed_hash" text,
	"state" text DEFAULT 'synced' NOT NULL,
	"conflict_remote" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_links_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "project_sync_requests" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "doc_sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "docs_path" text DEFAULT 'docs' NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "webhook_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "docs_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "docs_sync_error" text;--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "docs_pr_number" integer;--> statement-breakpoint
ALTER TABLE "repository_connections" ADD COLUMN "docs_pr_url" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sync_requests" ADD CONSTRAINT "project_sync_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tokens_project_idx" ON "agent_tokens" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "document_links_project_idx" ON "document_links" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_webhook_credential_id_credentials_id_fk" FOREIGN KEY ("webhook_credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Hand-written: marks a synced project dirty whenever one of its documents changes, so every
-- write path (including status changes inside foreign transactions) is covered.
CREATE FUNCTION "request_doc_sync"() RETURNS trigger AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "repository_connections"
		WHERE "project_id" = NEW."project_id" AND "doc_sync_enabled"
	) THEN
		INSERT INTO "project_sync_requests" ("project_id", "requested_at", "attempts")
		VALUES (NEW."project_id", now(), 0)
		ON CONFLICT ("project_id") DO UPDATE SET "requested_at" = now();
	END IF;
	RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "documents_request_sync"
AFTER INSERT OR UPDATE OF "content", "status", "title" ON "documents"
FOR EACH ROW EXECUTE FUNCTION "request_doc_sync"();
