import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters shared by every server instance (serverless instances do not share
 * memory, so an in-process limiter would reset on each cold start). Rows are pruned by the
 * maintenance cron.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_window_start_idx").on(t.windowStart)],
);
