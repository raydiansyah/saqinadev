CREATE TABLE "meeting_note_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"classification" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"matched_type" text,
	"matched_id" uuid,
	"rationale" text DEFAULT '' NOT NULL,
	"proposal_id" uuid,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" text,
	"side" text NOT NULL,
	"title" text NOT NULL,
	"meeting_date" date NOT NULL,
	"attendees" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"client_confirmed_by" text,
	"client_confirmed_at" timestamp with time zone,
	"analyzed_at" timestamp with time zone,
	"analysis_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_note_items" ADD CONSTRAINT "meeting_note_items_note_id_meeting_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_client_confirmed_by_users_id_fk" FOREIGN KEY ("client_confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_note_items_note_idx" ON "meeting_note_items" USING btree ("note_id","position");--> statement-breakpoint
CREATE INDEX "meeting_notes_project_idx" ON "meeting_notes" USING btree ("project_id","status","created_at" DESC NULLS LAST);