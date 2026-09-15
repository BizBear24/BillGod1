import { pgTable, text, timestamp, numeric, integer, boolean, unique } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { categories, sections, subsections, brands, units, sizes, colors, hsnCodes, taxRates, gstTypeEnum } from "./masters";
import { users } from "./auth";

/**
 * One row per Excel/CSV import run. Exists so "I imported junk" has an undo:
 * every product a run *creates* is tagged with its batch id (see
 * `products.importBatchId` below), and deleting the batch sweeps them back
 * out. Products the same run only *updated* are deliberately left untagged —
 * they existed before the import, so removing them would destroy real data,
 * not junk.
 */
export const productImportBatches = pgTable("product_import_batches", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    itemCode: text("item_code").notNull(),
    name: text("name").notNull(),
    description: text("description"),

    categoryId: text("category_id").references(() => categories.id),
    sectionId: text("section_id").references(() => sections.id),
    subsectionId: text("subsection_id").references(() => subsections.id),
    brandId: text("brand_id").references(() => brands.id),
    unitId: text("unit_id").references(() => units.id),
    sizeId: text("size_id").references(() => sizes.id),
    colorId: text("color_id").references(() => colors.id),
    hsnId: text("hsn_id").references(() => hsnCodes.id),
    taxRateId: text("tax_rate_id").references(() => taxRates.id),
    /** IGST vs CGST+SGST for this product's tax rate — a rate like 18% can be either, depending on the transaction, so this (not the tax rate) is where the choice lives. */
    gstType: gstTypeEnum("gst_type").notNull().default("cgst_sgst"),

    barcode: text("barcode"),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull().default("0"),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }).notNull().default("0"),
    mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull().default("0"),
    wholesalePrice: numeric("wholesale_price", { precision: 12, scale: 2 }),
    /** A standing discount this product always gets at billing time — prefills a cart line's own Disc %, which the cashier can still override per sale. */
    defaultDiscountPercent: numeric("default_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),

    openingStock: numeric("opening_stock", { precision: 14, scale: 3 }).notNull().default("0"),
    minStock: numeric("min_stock", { precision: 14, scale: 3 }).notNull().default("0"),
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }).notNull().default("0"),

    trackBatch: boolean("track_batch").notNull().default(false),
    trackExpiry: boolean("track_expiry").notNull().default(false),
    trackSerial: boolean("track_serial").notNull().default(false),

    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),

    /** Set only when this row was *created* by an import run — never on an update, and never cleared by later manual edits. */
    importBatchId: text("import_batch_id").references(() => productImportBatches.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.itemCode)]
);

/**
 * A product's photo, kept out of the `products` row on purpose: Billing,
 * Purchase and most other screens select every product wholesale on every
 * load, and an inline image column would ride along with all of them even
 * when nothing on screen shows a picture. Splitting it into its own table
 * means only the product master's photo tool and the catalogue builder ever
 * pay for the bytes.
 */
export const productImages = pgTable("product_images", {
  productId: text("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  /** A compressed data: URI (resized client-side before upload) — small enough that a plain column is fine. */
  dataUrl: text("data_url").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Products can carry more than one scannable barcode (spec §19/§39). */
export const productBarcodes = pgTable(
  "product_barcodes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    barcode: text("barcode").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.barcode)]
);
