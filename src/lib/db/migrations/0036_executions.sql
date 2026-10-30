CREATE TABLE "agent_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"forbidden" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_requirements" text DEFAULT '' NOT NULL,
	"expected_output" text DEFAULT '' NOT NULL,
	"definition_of_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_id" uuid,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handoff_targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"timeout_ms" integer DEFAULT 300000 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"task_id" uuid,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"type" text NOT NULL,
	"body" text NOT NULL,
	"artifact_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"reply_to_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"task_id" uuid,
	"run_id" uuid,
	"kind" text NOT NULL,
	"path" text,
	"commit_sha" text,
	"summary" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"mode" text NOT NULL,
	"request" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan_version" integer DEFAULT 1 NOT NULL,
	"branch" text,
	"base_sha" text,
	"agent_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_id_pk" PRIMARY KEY("task_id","depends_on_id"),
	CONSTRAINT "task_dependencies_not_self" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."depends_on_id")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "definition_id" uuid;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "execution_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "role_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "target_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "plan_version" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "agent_definition_versions" ADD CONSTRAINT "agent_definition_versions_definition_id_agent_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_definition_versions" ADD CONSTRAINT "agent_definition_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_artifacts" ADD CONSTRAINT "execution_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_artifacts" ADD CONSTRAINT "execution_artifacts_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_artifacts" ADD CONSTRAINT "execution_artifacts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_id_tasks_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_definition_versions_idx" ON "agent_definition_versions" USING btree ("definition_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_definitions_key_idx" ON "agent_definitions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_messages_key_idx" ON "agent_messages" USING btree ("execution_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_messages_execution_idx" ON "agent_messages" USING btree ("execution_id","created_at");--> statement-breakpoint
CREATE INDEX "execution_artifacts_execution_idx" ON "execution_artifacts" USING btree ("execution_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_events_seq_idx" ON "execution_events" USING btree ("execution_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_jobs_key_idx" ON "execution_jobs" USING btree ("execution_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "execution_jobs_due_idx" ON "execution_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "executions_project_idx" ON "executions" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "executions_status_idx" ON "executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_dependencies_on_idx" ON "task_dependencies" USING btree ("depends_on_id");--> statement-breakpoint
CREATE INDEX "runs_execution_idx" ON "agent_runs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "tasks_execution_idx" ON "tasks" USING btree ("execution_id");