import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Dev-only outbox that DevEmailService writes to instead of sending real email. */
export const devEmailOutbox = pgTable("dev_email_outbox", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
