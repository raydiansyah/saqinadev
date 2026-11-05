CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "memory_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid,
	"chunk_id" uuid,
	"model_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_embeddings_one_source" CHECK (("memory_embeddings"."asset_id" is null) <> ("memory_embeddings"."chunk_id" is null))
);
--> statement-breakpoint
ALTER TABLE "platform_ai_settings" ADD COLUMN "embedding_model_id" uuid;--> statement-breakpoint
ALTER TABLE "project_settings" ADD COLUMN "semantic_search_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_asset_id_memory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."memory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_chunk_id_wiki_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."wiki_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_embeddings_asset_idx" ON "memory_embeddings" USING btree ("asset_id","model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_embeddings_chunk_idx" ON "memory_embeddings" USING btree ("chunk_id","model_id");--> statement-breakpoint
CREATE INDEX "memory_embeddings_project_idx" ON "memory_embeddings" USING btree ("project_id","model_id");--> statement-breakpoint
ALTER TABLE "platform_ai_settings" ADD CONSTRAINT "platform_ai_settings_embedding_model_id_ai_models_id_fk" FOREIGN KEY ("embedding_model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;