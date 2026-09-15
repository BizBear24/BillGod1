"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { products, customers, suppliers, sales, saleItems, purchases, purchaseItems, stockMovements } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { buildWorkbook, type SheetSpec } from "@/lib/export/workbook";
import { listWarehousesForBusiness } from "./org";
import type { ActionResult } from "./auth";

const cell = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
};

const rowsFrom = <T extends Record<string, unknown>>(items: T[], keys: (keyof T)[]): (string | number | null)[][] =>
  items.map((item) => keys.map((k) => cell(item[k])));

/**
 * Dumps every business-critical table (masters, transactions, stock ledger)
 * into one workbook — a full backup a shop owner can keep off-platform, or
 * hand to an accountant. Gated to `business.manage` (owner-only by default)
 * since it's the entire operating history in one file, customer PII included.
 */
export async function exportAllData(): Promise<ActionResult & { base64?: string }> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) return { ok: false, error: "No active business." };
  if (!can(membership.role, PERMISSIONS.BUSINESS_MANAGE)) {
    return { ok: false, error: "Only the business owner can export all data." };
  }

  const db = await getDb();
  const businessId = membership.businessId;

  const [
    productRows,
    customerRows,
    supplierRows,
    warehouseRows,
    saleRows,
    saleItemRows,
    purchaseRows,
    purchaseItemRows,
    stockMovementRows,
  ] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, businessId)),
    db.select().from(customers).where(eq(customers.businessId, businessId)),
    db.select().from(suppliers).where(eq(suppliers.businessId, businessId)),
    listWarehousesForBusiness(businessId),
    db.select().from(sales).where(eq(sales.businessId, businessId)),
    db
      .select({ item: saleItems, docNumber: sales.docNumber })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(eq(sales.businessId, businessId)),
    db.select().from(purchases).where(eq(purchases.businessId, businessId)),
    db
      .select({ item: purchaseItems, docNumber: purchases.docNumber })
      .from(purchaseItems)
      .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
      .where(eq(purchases.businessId, businessId)),
    db.select().from(stockMovements).where(eq(stockMovements.businessId, businessId)),
  ]);

  const customerName = Object.fromEntries(customerRows.map((c) => [c.id, c.name]));
  const supplierName = Object.fromEntries(supplierRows.map((s) => [s.id, s.name]));
  const warehouseLabel = Object.fromEntries(warehouseRows.map((w) => [w.id, w.label]));
  const productLookup = Object.fromEntries(productRows.map((p) => [p.id, p]));

  const sheets: SheetSpec[] = [
    {
      name: "Products",
      headers: ["Item Code", "Name", "Barcode", "Purchase Price", "Selling Price", "MRP", "Wholesale Price", "Default Discount %", "Opening Stock", "Min Stock", "Reorder Level"],
      rows: rowsFrom(productRows, [
        "itemCode",
        "name",
        "barcode",
        "purchasePrice",
        "sellingPrice",
        "mrp",
        "wholesalePrice",
        "defaultDiscountPercent",
        "openingStock",
        "minStock",
        "reorderLevel",
      ]),
    },
    {
      name: "Customers",
      headers: ["Name", "Phone", "Email", "GSTIN", "Address", "City", "State", "Pincode", "Type", "Credit Limit", "Opening Balance", "Payment Terms (days)", "Loyalty Points"],
      rows: rowsFrom(customerRows, [
        "name",
        "phone",
        "email",
        "gstin",
        "addressLine1",
        "city",
        "state",
        "pincode",
        "customerType",
        "creditLimit",
        "openingBalance",
        "paymentTermsDays",
        "loyaltyPoints",
      ]),
    },
    {
      name: "Suppliers",
      headers: ["Name", "Phone", "Email", "GSTIN", "Address", "City", "State", "Pincode", "Opening Balance", "Payment Terms (days)"],
      rows: rowsFrom(supplierRows, ["name", "phone", "email", "gstin", "addressLine1", "city", "state", "pincode", "openingBalance", "paymentTermsDays"]),
    },
    {
      name: "Sales",
      headers: ["Doc Type", "Doc Number", "Status", "Customer", "Subtotal", "Discount", "Tax", "Total", "Amount Paid", "Bill Discount %", "Tier Discount %", "Coupon Code", "Notes", "Created At"],
      rows: saleRows.map((s) => [
        s.docType,
        s.docNumber,
        s.status,
        s.customerId ? customerName[s.customerId] ?? "" : "Walk-in",
        cell(s.subtotal),
        cell(s.discountAmount),
        cell(s.taxAmount),
        cell(s.totalAmount),
        cell(s.amountPaid),
        cell(s.billDiscountPercent),
        cell(s.tierDiscountPercent),
        cell(s.couponCode),
        cell(s.notes),
        cell(s.createdAt),
      ]),
    },
    {
      name: "Sale Items",
      headers: ["Doc Number", "Item Code", "Name", "Quantity", "Unit Price", "Discount %", "Tax Rate %", "Tax Amount", "Line Total"],
      rows: saleItemRows.map((r) => [
        r.docNumber,
        r.item.itemCode,
        r.item.name,
        cell(r.item.quantity),
        cell(r.item.unitPrice),
        cell(r.item.discountPercent),
        cell(r.item.taxRatePercent),
        cell(r.item.taxAmount),
        cell(r.item.lineTotal),
      ]),
    },
    {
      name: "Purchases",
      headers: ["Doc Type", "Doc Number", "Status", "Supplier", "Subtotal", "Discount", "Tax", "Total", "Amount Paid", "Notes", "Created At"],
      rows: purchaseRows.map((p) => [
        p.docType,
        p.docNumber,
        p.status,
        supplierName[p.supplierId] ?? "",
        cell(p.subtotal),
        cell(p.discountAmount),
        cell(p.taxAmount),
        cell(p.totalAmount),
        cell(p.amountPaid),
        cell(p.notes),
        cell(p.createdAt),
      ]),
    },
    {
      name: "Purchase Items",
      headers: ["Doc Number", "Item Code", "Name", "Quantity", "Unit Cost", "Discount %", "Tax Rate %", "Tax Amount", "Line Total", "Batch Number", "Expiry Date"],
      rows: purchaseItemRows.map((r) => [
        r.docNumber,
        r.item.itemCode,
        r.item.name,
        cell(r.item.quantity),
        cell(r.item.unitCost),
        cell(r.item.discountPercent),
        cell(r.item.taxRatePercent),
        cell(r.item.taxAmount),
        cell(r.item.lineTotal),
        cell(r.item.batchNumber),
        cell(r.item.expiryDate),
      ]),
    },
    {
      name: "Stock Movements",
      headers: ["Date", "Warehouse", "Item Code", "Name", "Type", "Quantity", "Unit Cost", "Batch Number", "Expiry Date", "Reference Type", "Notes"],
      rows: stockMovementRows.map((m) => [
        cell(m.createdAt),
        warehouseLabel[m.warehouseId] ?? "",
        productLookup[m.productId]?.itemCode ?? "",
        productLookup[m.productId]?.name ?? "",
        m.type,
        cell(m.quantity),
        cell(m.unitCost),
        cell(m.batchNumber),
        cell(m.expiryDate),
        m.referenceType,
        cell(m.notes),
      ]),
    },
  ];

  const buffer = await buildWorkbook(sheets, "BillGod full data export");
  return { ok: true, base64: buffer.toString("base64") };
}
