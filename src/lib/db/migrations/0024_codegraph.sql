CREATE TABLE "code_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"caller_symbol_id" uuid,
	"callee_name" text NOT NULL,
	"qualifier" text,
	"line" integer NOT NULL,
	"resolved_symbol_id" uuid,
	"resolution" text DEFAULT 'name_only' NOT NULL,
	CONSTRAINT "code_calls_resolution_check" CHECK ("code_calls"."resolution" in ('resolved','name_only'))
);
--> statement-breakpoint
CREATE TABLE "code_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_id" uuid NOT NULL,
	"path" text NOT NULL,
	"language" text NOT NULL,
	"blob_sha" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"line_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "code_files_status_check" CHECK ("code_files"."status" in ('pending','parsed','skipped','failed'))
);
--> statement-breakpoint
CREATE TABLE "code_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"specifier" text NOT NULL,
	"kind" text NOT NULL,
	"bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved_file_id" uuid,
	"line" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_indexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"commit_sha" text NOT NULL,
	"status" text DEFAULT 'indexing' NOT NULL,
	"parser" text NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"symbol_count" integer DEFAULT 0 NOT NULL,
	"aliases" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_indexes_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "code_indexes_status_check" CHECK ("code_indexes"."status" in ('indexing','ready','failed'))
);
--> statement-breakpoint
CREATE TABLE "code_symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"exported" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"parent_id" uuid
);
--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_caller_symbol_id_code_symbols_id_fk" FOREIGN KEY ("caller_symbol_id") REFERENCES "public"."code_symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_resolved_symbol_id_code_symbols_id_fk" FOREIGN KEY ("resolved_symbol_id") REFERENCES "public"."code_symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_files" ADD CONSTRAINT "code_files_index_id_code_indexes_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."code_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_resolved_file_id_code_files_id_fk" FOREIGN KEY ("resolved_file_id") REFERENCES "public"."code_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_indexes" ADD CONSTRAINT "code_indexes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_indexes" ADD CONSTRAINT "code_indexes_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_index_id_code_indexes_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."code_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."code_symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_calls_target_idx" ON "code_calls" USING btree ("resolved_symbol_id");--> statement-breakpoint
CREATE INDEX "code_calls_name_idx" ON "code_calls" USING btree ("callee_name");--> statement-breakpoint
CREATE INDEX "code_calls_file_idx" ON "code_calls" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_files_path_idx" ON "code_files" USING btree ("index_id","path");--> statement-breakpoint
CREATE INDEX "code_files_status_idx" ON "code_files" USING btree ("index_id","status");--> statement-breakpoint
CREATE INDEX "code_imports_file_idx" ON "code_imports" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "code_imports_target_idx" ON "code_imports" USING btree ("resolved_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_indexes_branch_idx" ON "code_indexes" USING btree ("project_id","branch");--> statement-breakpoint
CREATE INDEX "code_symbols_name_idx" ON "code_symbols" USING btree ("index_id","name");--> statement-breakpoint
CREATE INDEX "code_symbols_file_idx" ON "code_symbols" USING btree ("file_id");