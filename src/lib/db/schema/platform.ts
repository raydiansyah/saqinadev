import {
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });
const optionalProject = () =>
  uuid("project_id").references(() => projects.id, { onDelete: "cascade" });

/** Sensitive changes (white label, brand, account). Metadata is redacted. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: userRef("actor_id"),
    scope: text("scope").$type<"platform" | "project" | "organization">().notNull(),
    projectId: optionalProject(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_scope_idx").on(t.scope, t.projectId, t.createdAt.desc())],
);

/** Platform-wide switches managed by the Owner. One row (id = 1); absent means defaults. */
export const platformSettings = pgTable("platform_settings", {
  id: smallint("id").primaryKey().default(1),
  /** When false, only holders of a pending client invitation can create an account. */
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  updatedBy: userRef("updated_by"),
  updatedAt: updatedAt(),
});
