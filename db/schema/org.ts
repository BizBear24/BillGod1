import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { businesses } from "./tenancy";

export const companies = pgTable("companies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gstin: text("gstin"),
  businessType: text("business_type"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  phone: text("phone"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companiesRelations = relations(companies, ({ one, many }) => ({
  business: one(businesses, { fields: [companies.businessId], references: [businesses.id] }),
  branches: many(branches),
}));

export const branches = pgTable("branches", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  addressLine1: text("address_line1"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  phone: text("phone"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const branchesRelations = relations(branches, ({ one, many }) => ({
  company: one(companies, { fields: [branches.companyId], references: [companies.id] }),
  warehouses: many(warehouses),
  counters: many(counters),
}));

export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  branchId: text("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const warehousesRelations = relations(warehouses, ({ one }) => ({
  branch: one(branches, { fields: [warehouses.branchId], references: [branches.id] }),
}));

export const counters = pgTable("counters", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  branchId: text("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const countersRelations = relations(counters, ({ one }) => ({
  branch: one(branches, { fields: [counters.branchId], references: [branches.id] }),
}));
