CREATE TABLE "wiki_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text DEFAULT '' NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"content" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', heading || ' ' || content)) STORED
);
--> statement-breakpoint
CREATE TABLE "wiki_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_ref" text NOT NULL,
	"target_source_id" uuid,
	"label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"source_version" integer,
	"status" text DEFAULT 'ready' NOT NULL,
	"error_code" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"last_indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_sources_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "wiki_sources_type_check" CHECK ("wiki_sources"."source_type" in ('document','repo_file')),
	CONSTRAINT "wiki_sources_status_check" CHECK ("wiki_sources"."status" in ('ready','failed'))
);
--> statement-breakpoint
ALTER TABLE "wiki_chunks" ADD CONSTRAINT "wiki_chunks_source_id_wiki_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."wiki_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_links" ADD CONSTRAINT "wiki_links_source_id_wiki_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."wiki_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_links" ADD CONSTRAINT "wiki_links_target_source_id_wiki_sources_id_fk" FOREIGN KEY ("target_source_id") REFERENCES "public"."wiki_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_sources" ADD CONSTRAINT "wiki_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_sources" ADD CONSTRAINT "wiki_sources_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_chunks_order_idx" ON "wiki_chunks" USING btree ("source_id","ordinal");--> statement-breakpoint
CREATE INDEX "wiki_chunks_search_idx" ON "wiki_chunks" USING gin ("search");--> statement-breakpoint
CREATE INDEX "wiki_links_source_idx" ON "wiki_links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "wiki_links_target_idx" ON "wiki_links" USING btree ("target_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_sources_ref_idx" ON "wiki_sources" USING btree ("project_id","source_type","source_ref");