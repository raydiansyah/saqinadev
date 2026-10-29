ALTER TABLE "ai_providers" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_providers_owner_idx" ON "ai_providers" USING btree ("owner_user_id");