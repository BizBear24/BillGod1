import { pgTable, text, timestamp, numeric, integer, date, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { branches, warehouses } from "./org";
import { suppliers } from "./parties";
import { products } from "./products";
import { users } from "./auth";

/**
 * Purchase-side documents — spec Phase 4. Mirrors the sales module's shape
 * (header + items + payments) so the two sides of the ledger stay symmetric;
 * batch/expiry/serial are captured per line at receipt but not yet tracked
 * as running inventory (that ledger is the Inventory phase's job).
 */
export const purchaseDocTypeEnum = pgEnum("purchase_doc_type", ["purchase_order", "purchase", "purchase_return"]);
export const purchaseStatusEnum = pgEnum("purchase_status", ["draft", "completed", "cancelled"]);
export const purchasePaymentMethodEnum = pgEnum("purchase_payment_method", ["cash", "upi", "card", "credit"]);

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    branchId: text("branch_id").references(() => branches.id),
    warehouseId: text("warehouse_id").references(() => warehouses.id),

    docType: purchaseDocTypeEnum("doc_type").notNull().default("purchase"),
    docNumber: text("doc_number").notNull(),
    status: purchaseStatusEnum("status").notNull().default("draft"),

    supplierId: text("supplier_id").notNull().references(() => suppliers.id),
    supplierInvoiceNumber: text("supplier_invoice_number"),

    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),

    notes: text("notes"),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    /** Set when the document is voided; the reversing ledger rows carry the detail. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: text("cancelled_by_user_id").references(() => users.id),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.businessId, table.docType, table.docNumber),
    index("purchases_business_status_idx").on(table.businessId, table.status),
  ]
);

export const purchaseItems = pgTable("purchase_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id),

  itemCode: text("item_code").notNull(),
  name: text("name").notNull(),

  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),

  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date"),
  serialNumbers: text("serial_numbers"),

  sortOrder: integer("sort_order").notNull().default(0),
});

export const purchasePayments = pgTable("purchase_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  method: purchasePaymentMethodEnum("method").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
