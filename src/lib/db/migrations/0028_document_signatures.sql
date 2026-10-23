CREATE TABLE "document_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"party" text NOT NULL,
	"signer_id" text,
	"signer_name" text NOT NULL,
	"content_hash" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signer_id_users_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_signatures_party_idx" ON "document_signatures" USING btree ("document_id","version","party");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_project_reference_idx" ON "documents" USING btree ("project_id","reference") WHERE "documents"."reference" is not null;