CREATE TABLE "doc_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"hash" text NOT NULL,
	"role" text NOT NULL,
	"classified_by" text NOT NULL,
	"confidence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_index" ADD CONSTRAINT "doc_index_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_index_path_idx" ON "doc_index" USING btree ("project_id","path");--> statement-breakpoint
CREATE INDEX "doc_index_role_idx" ON "doc_index" USING btree ("project_id","role");