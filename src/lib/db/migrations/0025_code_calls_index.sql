DROP INDEX "code_calls_name_idx";--> statement-breakpoint
CREATE INDEX "code_calls_name_idx" ON "code_calls" USING btree ("callee_name","file_id");