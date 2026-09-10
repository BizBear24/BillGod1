import { pgTable, text, timestamp, numeric, boolean, pgEnum, unique } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";

export const accountGroupEnum = pgEnum("account_group", ["asset", "liability", "income", "expense", "equity"]);

/**
 * Chart of Accounts master (spec §20/§33). Full ledger/journal posting logic
 * lands in the Accounting phase — this establishes the account list itself,
 * since customers/suppliers/cash/bank accounts are referenced from day one.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    group: accountGroupEnum("group").notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    isSystemAccount: boolean("is_system_account").notNull().default(false),
    /**
     * Stable handle for the accounts the posting engine needs by name
     * ("cash", "sales_revenue", …). Null for user-created accounts, so
     * renaming a system account never breaks automatic journal entries.
     */
    systemKey: text("system_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name), unique().on(table.businessId, table.systemKey)]
);
