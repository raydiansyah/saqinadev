CREATE TABLE "ai_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"previous_slugs" text[] DEFAULT '{}' NOT NULL,
	"internal_name" text NOT NULL,
	"category" text NOT NULL,
	"icon" text DEFAULT 'puzzle' NOT NULL,
	"image_url" text,
	"title" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"short_description" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"description" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"timeline" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"price_label" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"cta_label" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"meta_title" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '{"en":"","id":""}'::jsonb NOT NULL,
	"problems" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"use_cases" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"included" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"excluded" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"faqs" jsonb DEFAULT '{"en":[],"id":[]}'::jsonb NOT NULL,
	"related_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_type" text DEFAULT 'contact' NOT NULL,
	"price_amount" bigint,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"show_price" boolean DEFAULT false NOT NULL,
	"cta_type" text DEFAULT 'discuss' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_coming_soon" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid,
	"service_slug" text,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"message" text NOT NULL,
	"consent" boolean NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"client_id" uuid,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_services" ADD CONSTRAINT "ai_services_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_inquiries" ADD CONSTRAINT "service_inquiries_service_id_ai_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."ai_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_inquiries" ADD CONSTRAINT "service_inquiries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_services_slug_idx" ON "ai_services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ai_services_public_idx" ON "ai_services" USING btree ("is_published","is_public","archived_at","display_order");--> statement-breakpoint
CREATE INDEX "service_inquiries_status_idx" ON "service_inquiries" USING btree ("status","created_at" DESC NULLS LAST);