ALTER TABLE "executions" ADD COLUMN "parent_execution_id" uuid;--> statement-breakpoint
CREATE INDEX "executions_parent_idx" ON "executions" USING btree ("parent_execution_id");