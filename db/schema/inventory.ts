import { pgTable, text, timestamp, numeric, date, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { warehouses } from "./org";
import { products } from "./products";
import { users } from "./auth";

/**
 * Inventory — spec Phase 5. `stockMovements` is the single source of truth
 * for stock: every sale, purchase, transfer and adjustment posts signed
 * quantity rows here rather than mutating a "current stock" column, so the
 * running balance (sum of quantity per product+warehouse) can never drift
 * from the events that produced it.
 */
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "purchase_in",
  "purchase_return_out",
  "sale_out",
  "sale_return_in",
  "transfer_in",
  "transfer_out",
  "adjustment_in",
  "adjustment_out",
  // Voiding a completed document does not delete its movements — it appends
  // the opposite ones, so the ledger still explains how stock got where it is.
  "cancel_in",
  "cancel_out",
]);

export const stockReferenceTypeEnum = pgEnum("stock_reference_type", ["sale", "purchase", "transfer", "adjustment"]);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    productId: text("product_id").notNull().references(() => products.id),

    type: stockMovementTypeEnum("type").notNull(),
    // Signed: positive increases stock, negative decreases it. Summing this
    // column per product+warehouse gives the current stock level directly.
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),

    batchNumber: text("batch_number"),
    expiryDate: date("expiry_date"),

    referenceType: stockReferenceTypeEnum("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    notes: text("notes"),

    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_business_product_wh_idx").on(table.businessId, table.productId, table.warehouseId),
    index("stock_movements_reference_idx").on(table.referenceType, table.referenceId),
  ]
);

export const stockTransferStatusEnum = pgEnum("stock_transfer_status", ["draft", "completed", "cancelled"]);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    docNumber: text("doc_number").notNull(),
    status: stockTransferStatusEnum("status").notNull().default("completed"),

    fromWarehouseId: text("from_warehouse_id").notNull().references(() => warehouses.id),
    toWarehouseId: text("to_warehouse_id").notNull().references(() => warehouses.id),

    notes: text("notes"),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.docNumber)]
);

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferId: text("transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id),
  itemCode: text("item_code").notNull(),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  batchNumber: text("batch_number"),
});

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),
    docNumber: text("doc_number").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.docNumber)]
);

export const stockAdjustmentItems = pgTable("stock_adjustment_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  adjustmentId: text("adjustment_id").notNull().references(() => stockAdjustments.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id),
  itemCode: text("item_code").notNull(),
  name: text("name").notNull(),
  // Signed: positive = stock found/added, negative = stock lost/damaged/removed.
  quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }).notNull(),
  batchNumber: text("batch_number"),
});

/**
 * Serial number tracking — spec Phase 5.
 *
 * Follows the same rule as stock, money and points: this is a ledger of
 * movements, not a status column. A serial is "in stock" when its rows net to
 * one unit in, and "sold" when they net to zero — so a unit that is sold,
 * returned and sold again tells its whole story instead of overwriting it.
 *
 * The same serial can legitimately reappear (a return, a re-issue), so
 * uniqueness is enforced against what is *currently* in stock at write time
 * rather than by a database constraint.
 */
export const serialDirectionEnum = pgEnum("serial_direction", ["in", "out"]);

export const serialMovements = pgTable(
  "serial_movements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id").notNull().references(() => warehouses.id),

    /** Stored upper-cased and trimmed so scans and typing agree. */
    serial: text("serial").notNull(),
    direction: serialDirectionEnum("direction").notNull(),

    referenceType: stockReferenceTypeEnum("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    /** The document number, snapshotted so the serial history reads without joins. */
    referenceLabel: text("reference_label"),
    notes: text("notes"),

    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("serial_movements_lookup_idx").on(table.businessId, table.productId, table.serial),
    index("serial_movements_reference_idx").on(table.referenceType, table.referenceId),
  ]
);
