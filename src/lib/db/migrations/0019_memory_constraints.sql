-- Clear pointers that already dangle, so the new foreign keys can be added.
UPDATE "memory_assets" SET "supersedes_id" = NULL WHERE "supersedes_id" IS NOT NULL AND "supersedes_id" NOT IN (SELECT "id" FROM "memory_assets");--> statement-breakpoint
UPDATE "memory_assets" SET "conflict_with_id" = NULL WHERE "conflict_with_id" IS NOT NULL AND "conflict_with_id" NOT IN (SELECT "id" FROM "memory_assets");--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."memory_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_conflict_fk" FOREIGN KEY ("conflict_with_id") REFERENCES "public"."memory_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_type_check" CHECK ("memory_assets"."asset_type" in ('chat','skill','wiki','code'));--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_visibility_check" CHECK ("memory_assets"."visibility" in ('private','project','organization','restricted','agent'));--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_status_check" CHECK ("memory_assets"."status" in ('candidate','pending_review','approved','rejected','superseded','archived'));
--> statement-breakpoint
-- A chat payload and its registry row must belong to the same project.
CREATE FUNCTION memories_project_matches_asset() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memory_assets a WHERE a.id = NEW.asset_id AND a.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'memory and its asset must be in the same project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER memories_project_matches_asset BEFORE INSERT OR UPDATE OF project_id, asset_id ON "memories"
FOR EACH ROW EXECUTE FUNCTION memories_project_matches_asset();
