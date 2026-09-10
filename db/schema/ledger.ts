import { pgTable, text, timestamp, numeric, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { accounts } from "./accounts";
import { customers, suppliers } from "./parties";
import { users } from "./auth";

/**
 * Accounting — spec Phase 6. Classic double-entry: every financial event is
 * one `journalEntries` header plus two or more `journalLines` whose debits
 * equal their credits. Sales and purchases post here automatically when they
 * complete; the trial balance, P&L and balance sheet are all derived by
 * aggregating these lines, never by storing running totals.
 */
export const journalReferenceTypeEnum = pgEnum("journal_reference_type", ["sale", "purchase", "manual", "opening"]);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    entryNumber: text("entry_number").notNull(),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
    narration: text("narration").notNull(),

    referenceType: journalReferenceTypeEnum("reference_type").notNull().default("manual"),
    referenceId: text("reference_id"),

    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.businessId, table.entryNumber),
    index("journal_entries_business_date_idx").on(table.businessId, table.entryDate),
    index("journal_entries_reference_idx").on(table.referenceType, table.referenceId),
  ]
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    entryId: text("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => accounts.id),

    debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),

    /** Attribution for party ledgers — set on receivable/payable lines only. */
    customerId: text("customer_id").references(() => customers.id),
    supplierId: text("supplier_id").references(() => suppliers.id),

    notes: text("notes"),
  },
  (table) => [index("journal_lines_account_idx").on(table.accountId)]
);
