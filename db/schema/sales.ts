import { pgTable, text, timestamp, numeric, integer, pgEnum, unique, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { branches, counters, warehouses } from "./org";
import { customers } from "./parties";
import { salespersons } from "./masters";
import { products } from "./products";
import { users } from "./auth";

/**
 * Billing / Sales (POS) — spec Phase 3. One header per document, covering
 * every sale-side document type (sale, return, quotation, order, challan)
 * so they share numbering, line items and payment recording.
 */
export const saleDocTypeEnum = pgEnum("sale_doc_type", ["sale", "sale_return", "quotation", "estimate", "sale_order", "challan"]);
export const saleStatusEnum = pgEnum("sale_status", ["draft", "completed", "cancelled"]);
export const salePaymentMethodEnum = pgEnum("sale_payment_method", ["cash", "upi", "card", "credit"]);

export const sales = pgTable(
  "sales",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    branchId: text("branch_id").references(() => branches.id),
    counterId: text("counter_id").references(() => counters.id),
    warehouseId: text("warehouse_id").references(() => warehouses.id),

    docType: saleDocTypeEnum("doc_type").notNull().default("sale"),
    docNumber: text("doc_number").notNull(),
    status: saleStatusEnum("status").notNull().default("draft"),

    /**
     * The bill a `sale_return` is raised against, when the cashier picked one.
     * Lets the return reverse exactly the loyalty points the original sale
     * awarded instead of guessing from the refunded value.
     */
    originalSaleId: text("original_sale_id").references((): AnyPgColumn => sales.id, { onDelete: "set null" }),

    customerId: text("customer_id").references(() => customers.id),
    salespersonId: text("salesperson_id").references(() => salespersons.id),

    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    roundOff: numeric("round_off", { precision: 6, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),

    /**
     * Loyalty settles part of the bill without money changing hands, so it is
     * tracked separately from `amountPaid` — what the customer still owes is
     * total − amountPaid − redeemedValue.
     */
    redeemedPoints: integer("redeemed_points").notNull().default(0),
    redeemedValue: numeric("redeemed_value", { precision: 14, scale: 2 }).notNull().default("0"),

    /**
     * Why a bill-level discount was given, snapshotted rather than joined:
     * a tier can be renamed or deleted and a coupon can expire, but the bill
     * must keep explaining itself years later. The amounts themselves are
     * apportioned across the lines (see `saleItems.billDiscountAmount`) so
     * GST stays correct rate by rate.
     */
    loyaltyTierName: text("loyalty_tier_name"),
    tierDiscountPercent: numeric("tier_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    couponCode: text("coupon_code"),
    couponDiscountAmount: numeric("coupon_discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),

    notes: text("notes"),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    /** Set when the document is voided; the reversing ledger rows carry the detail. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: text("cancelled_by_user_id").references(() => users.id),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.docType, table.docNumber), index("sales_business_status_idx").on(table.businessId, table.status)]
);

export const saleItems = pgTable("sale_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  saleId: text("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id),

  // Snapshotted at sale time so historical bills stay stable even if the
  // product master is edited or removed later.
  itemCode: text("item_code").notNull(),
  name: text("name").notNull(),

  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  /**
   * This line's share of the bill-level discounts (loyalty tier, coupon),
   * apportioned pro-rata to the line's post-line-discount value. Taxable
   * value is unitPrice×qty − line discount − this, so each GST rate slab is
   * reduced by its own share rather than the whole bill's.
   */
  billDiscountAmount: numeric("bill_discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),

  sortOrder: integer("sort_order").notNull().default(0),
});

export const salePayments = pgTable("sale_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  saleId: text("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  method: salePaymentMethodEnum("method").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
