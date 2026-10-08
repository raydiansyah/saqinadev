CREATE TABLE "agent_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"assignment_id" uuid,
	"task_id" uuid,
	"conversation_id" uuid,
	"proposal_id" uuid,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"context_type" text DEFAULT 'project' NOT NULL,
	"context_id" text,
	"summary" text,
	"summary_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_id" uuid,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "agents_project_type_idx";--> statement-breakpoint
ALTER TABLE "project_settings" ADD COLUMN "approval_policy" text DEFAULT 'auto_low_risk' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "role" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "category" text DEFAULT 'write' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "risk_level" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "revision_note" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_assignment_id_agent_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."agent_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_project_idx" ON "agent_assignments" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_open_task_idx" ON "agent_assignments" USING btree ("task_id") WHERE "agent_assignments"."status" not in ('completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE INDEX "run_events_run_idx" ON "agent_run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_project_idx" ON "agent_runs" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_assignment_idx" ON "agent_runs" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "conversations_project_user_idx" ON "conversations" USING btree ("project_id","user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_idx" ON "messages" USING btree ("conversation_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_project_type_role_idx" ON "agents" USING btree ("project_id","type","role");