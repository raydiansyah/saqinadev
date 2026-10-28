CREATE TABLE "conversation_agent_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"proposal_id" uuid,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "parent_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "forked_from_message_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "chapter_title" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "rewound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_agent_reads" ADD CONSTRAINT "conversation_agent_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_agent_reads" ADD CONSTRAINT "conversation_agent_reads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_changes" ADD CONSTRAINT "conversation_changes_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_agent_reads_idx" ON "conversation_agent_reads" USING btree ("conversation_id","agent_id");--> statement-breakpoint
CREATE INDEX "conversation_changes_conversation_idx" ON "conversation_changes" USING btree ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_parent_conversation_id_conversations_id_fk" FOREIGN KEY ("parent_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_pinned_idx" ON "messages" USING btree ("conversation_id","created_at") WHERE "messages"."pinned_at" is not null;