import { pgTable, text, timestamp, numeric, boolean, unique, pgEnum } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { warehouses } from "./org";

/** Indian GST split: the whole rate as IGST (inter-state), or halved into CGST + SGST (intra-state). Shared by products (a default) and purchase items (decided per line). */
export const gstTypeEnum = pgEnum("gst_type", ["igst", "cgst_sgst"]);

/**
 * Simple lookup masters (spec §1/§20). Each is scoped to a business and
 * shares the same shape: id, businessId, name, optional short code, timestamps.
 * Kept as distinct tables (not collapsed into one generic table) per spec §58
 * — "do not collapse important relational concepts into random JSON."
 */

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const sections = pgTable(
  "sections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const subsections = pgTable(
  "subsections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sectionId: text("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.sectionId, table.name)]
);

export const brands = pgTable(
  "brands",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const units = pgTable(
  "units",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortCode: text("short_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const sizes = pgTable(
  "sizes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const colors = pgTable(
  "colors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hexCode: text("hex_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const racks = pgTable(
  "racks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.warehouseId, table.name)]
);

export const salespersons = pgTable("salespersons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const doctors = pgTable("doctors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  clinicName: text("clinic_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** GST rate presets (e.g. "GST 18%") that HSN codes and products reference. */
export const taxRates = pgTable(
  "tax_rates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    cessPercent: numeric("cess_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const hsnCodes = pgTable(
  "hsn_codes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description"),
    taxRateId: text("tax_rate_id").references(() => taxRates.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.code)]
);
