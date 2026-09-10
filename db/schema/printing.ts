import { pgTable, text, timestamp, boolean, jsonb, pgEnum, unique } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";

/**
 * Saved print designs — spec Phase 8.
 *
 * The design itself is stored as a document rather than shredded into rows.
 * That is deliberate and not the "collapse relational concepts into random
 * JSON" the spec warns about: a layout is genuinely a document, its shape
 * differs per kind, and nothing else in the system ever queries *inside* it —
 * it is read whole, drawn, and written whole. The parts that do need to be
 * queried (which business, which kind, which one is the default) are columns.
 *
 * `lib/print/templates.ts` owns the shape and validates it on the way in.
 */
export const printTemplateKindEnum = pgEnum("print_template_kind", ["label", "invoice"]);

export const printTemplates = pgTable(
  "print_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    kind: printTemplateKindEnum("kind").notNull(),
    name: text("name").notNull(),
    /** At most one per business per kind; enforced when saving, not by a constraint. */
    isDefault: boolean("is_default").notNull().default(false),
    design: jsonb("design").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.kind, table.name)]
);
