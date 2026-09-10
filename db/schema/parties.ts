import { pgTable, text, timestamp, numeric, boolean, pgEnum, unique } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";

export const customerTypeEnum = pgEnum("customer_type", ["retail", "wholesale", "b2b"]);

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    customerType: customerTypeEnum("customer_type").notNull().default("retail"),
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).notNull().default("0"),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    paymentTermsDays: numeric("payment_terms_days", { precision: 5, scale: 0 }).notNull().default("0"),
    loyaltyPoints: numeric("loyalty_points", { precision: 12, scale: 2 }).notNull().default("0"),
    /**
     * The code this customer gives to friends. Generated on first use rather
     * than at signup, so existing customers get one the moment it is needed.
     */
    referralCode: text("referral_code"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.phone), unique().on(table.businessId, table.referralCode)]
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    paymentTermsDays: numeric("payment_terms_days", { precision: 5, scale: 0 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.phone)]
);
