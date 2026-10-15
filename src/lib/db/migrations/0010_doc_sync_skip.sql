-- The sync engine's own writes (pulling a repository change into a document) set
-- docsync.skip for their transaction, so they do not flag the project dirty again.
CREATE OR REPLACE FUNCTION "request_doc_sync"() RETURNS trigger AS $$
BEGIN
	IF current_setting('docsync.skip', true) = 'on' THEN
		RETURN NEW;
	END IF;
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
