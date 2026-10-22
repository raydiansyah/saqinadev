import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DeliveryStep } from "@/lib/domain/delivery";
import { users } from "./auth";
import { projects } from "./projects";

/**
 * The team's answers to "is it built, reviewed, deployed?". One row per project and step: the
 * latest answer, who gave it and when. Whether it is still current is decided by comparing that
 * time with the last change to the project's tasks and milestones, never stored.
 */
export const deliveryChecks = pgTable(
  "delivery_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    step: text("step").$type<DeliveryStep>().notNull(),
    done: boolean("done").notNull(),
    answeredBy: text("answered_by").references(() => users.id, { onDelete: "set null" }),
    answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("delivery_checks_project_step_idx").on(t.projectId, t.step)],
);
