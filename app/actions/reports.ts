"use server";

import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  sales,
  saleItems,
  purchases,
  purchaseItems,
  customers,
  suppliers,
  salespersons,
  products,
  stockMovements,
} from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { toDateKey } from "@/lib/utils";
import { valueStock } from "@/lib/inventory/valuation";
import { listWarehousesForBusiness, listCountersForBusiness } from "./org";
import type { CreateSaleInput } from "@/lib/validation/sales";
import type { CreatePurchaseInput } from "@/lib/validation/purchases";

export type SaleDocType = CreateSaleInput["docType"];
export type PurchaseDocType = CreatePurchaseInput["docType"];

const round2 = (n: number) => Math.round(n * 100) / 100;

async function requireReports() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.REPORTS_VIEW)) throw new Error("FORBIDDEN");
  return membership;
}

/** Inclusive of the whole `to` day, so a same-day range still returns that day's documents. */
function parseRange(range: { from: string; to: string }) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T23:59:59.999`);
  return { from, to };
}

function groupSum<T>(rows: T[], keyOf: (row: T) => string, labelOf: (row: T) => string, valueOf: (row: T) => number) {
  const map = new Map<string, { key: string; label: string; total: number; count: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = map.get(key) ?? { key, label: labelOf(row), total: 0, count: 0 };
    current.total = round2(current.total + valueOf(row));
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/**
 * One document type's own register — a quotation report never has a stray
 * challan in it, because it is never asked for more than one docType at a
 * time. `sale_return`/`purchase_return` get their own tab too rather than
 * being netted against the forward document, so a return register reads as
 * a register of returns, not a negative adjustment buried in Sales.
 */
export async function getSalesDocReport(docType: SaleDocType, range: { from: string; to: string }) {
  const membership = await requireReports();
  const db = await getDb();
  const { from, to } = parseRange(range);

  const [warehouseRows, counterRows, rows] = await Promise.all([
    listWarehousesForBusiness(membership.businessId),
    listCountersForBusiness(membership.businessId),
    db
      .select({
        id: sales.id,
        docNumber: sales.docNumber,
        docType: sales.docType,
        createdAt: sales.createdAt,
        subtotal: sales.subtotal,
        discountAmount: sales.discountAmount,
        taxAmount: sales.taxAmount,
        totalAmount: sales.totalAmount,
        amountPaid: sales.amountPaid,
        warehouseId: sales.warehouseId,
        counterId: sales.counterId,
        customerName: customers.name,
        salespersonId: sales.salespersonId,
        salespersonName: salespersons.name,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .leftJoin(salespersons, eq(sales.salespersonId, salespersons.id))
      .where(
        and(
          eq(sales.businessId, membership.businessId),
          eq(sales.docType, docType),
          eq(sales.status, "completed"),
          gte(sales.createdAt, from),
          lte(sales.createdAt, to)
        )
      )
      .orderBy(desc(sales.createdAt)),
  ]);

  const warehouseLabel = new Map(warehouseRows.map((w) => [w.id, w.label]));
  const counterLabel = new Map(counterRows.map((c) => [c.id, c.label]));

  const summary = rows.reduce(
    (acc, r) => ({
      subtotal: round2(acc.subtotal + parseFloat(r.subtotal)),
      discount: round2(acc.discount + parseFloat(r.discountAmount)),
      tax: round2(acc.tax + parseFloat(r.taxAmount)),
      total: round2(acc.total + parseFloat(r.totalAmount)),
      paid: round2(acc.paid + parseFloat(r.amountPaid)),
      count: acc.count + 1,
    }),
    { subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, count: 0 }
  );

  return {
    rows: rows.map((r) => ({
      ...r,
      warehouseLabel: r.warehouseId ? warehouseLabel.get(r.warehouseId) ?? "—" : "—",
      counterLabel: r.counterId ? counterLabel.get(r.counterId) ?? "—" : "—",
    })),
    summary: { ...summary, due: round2(summary.total - summary.paid) },
    bySalesperson: groupSum(
      rows,
      (r) => r.salespersonId ?? "none",
      (r) => r.salespersonName ?? "Unassigned",
      (r) => parseFloat(r.totalAmount)
    ),
    byBranch: groupSum(
      rows,
      (r) => r.warehouseId ?? "none",
      (r) => (r.warehouseId ? warehouseLabel.get(r.warehouseId) ?? "—" : "Unassigned"),
      (r) => parseFloat(r.totalAmount)
    ),
    byCounter: groupSum(
      rows,
      (r) => r.counterId ?? "none",
      (r) => (r.counterId ? counterLabel.get(r.counterId) ?? "—" : "Unassigned"),
      (r) => parseFloat(r.totalAmount)
    ),
    byDay: groupSum(
      rows,
      (r) => toDateKey(new Date(r.createdAt)),
      (r) => toDateKey(new Date(r.createdAt)),
      (r) => parseFloat(r.totalAmount)
    ).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export async function getPurchaseDocReport(docType: PurchaseDocType, range: { from: string; to: string }) {
  const membership = await requireReports();
  const db = await getDb();
  const { from, to } = parseRange(range);

  const rows = await db
    .select({
      id: purchases.id,
      docNumber: purchases.docNumber,
      docType: purchases.docType,
      createdAt: purchases.createdAt,
      subtotal: purchases.subtotal,
      discountAmount: purchases.discountAmount,
      taxAmount: purchases.taxAmount,
      totalAmount: purchases.totalAmount,
      amountPaid: purchases.amountPaid,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      supplierInvoiceNumber: purchases.supplierInvoiceNumber,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(
      and(
        eq(purchases.businessId, membership.businessId),
        eq(purchases.docType, docType),
        eq(purchases.status, "completed"),
        gte(purchases.createdAt, from),
        lte(purchases.createdAt, to)
      )
    )
    .orderBy(desc(purchases.createdAt));

  const summary = rows.reduce(
    (acc, r) => ({
      subtotal: round2(acc.subtotal + parseFloat(r.subtotal)),
      discount: round2(acc.discount + parseFloat(r.discountAmount)),
      tax: round2(acc.tax + parseFloat(r.taxAmount)),
      total: round2(acc.total + parseFloat(r.totalAmount)),
      paid: round2(acc.paid + parseFloat(r.amountPaid)),
      count: acc.count + 1,
    }),
    { subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, count: 0 }
  );

  return {
    rows,
    summary: { ...summary, due: round2(summary.total - summary.paid) },
    bySupplier: groupSum(
      rows,
      (r) => r.supplierId,
      (r) => r.supplierName,
      (r) => parseFloat(r.totalAmount)
    ),
  };
}

/**
 * Current stock per product, valued from the movement ledger's own FIFO cost
 * layers rather than the product master's current purchase price — so a
 * supplier raising their price does not silently revalue stock bought before
 * the increase. Each product's remaining batches are returned alongside, and
 * the cost of everything that went out gives a real gross margin.
 */
export async function getStockReport() {
  const membership = await requireReports();
  const db = await getDb();
  const businessId = membership.businessId;

  const [productRows, warehouseRows] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, businessId)),
    listWarehousesForBusiness(businessId),
  ]);

  const warehouseIds = warehouseRows.map((w) => w.id);
  const movementRows = warehouseIds.length
    ? await db
        .select({
          id: stockMovements.id,
          productId: stockMovements.productId,
          warehouseId: stockMovements.warehouseId,
          quantity: stockMovements.quantity,
          unitCost: stockMovements.unitCost,
          batchNumber: stockMovements.batchNumber,
          createdAt: stockMovements.createdAt,
          type: stockMovements.type,
          referenceId: stockMovements.referenceId,
        })
        .from(stockMovements)
        .where(and(eq(stockMovements.businessId, businessId), inArray(stockMovements.warehouseId, warehouseIds)))
    : [];

  const fallbackCost = new Map(productRows.map((p) => [p.id, parseFloat(p.purchasePrice) || 0]));
  const valuations = valueStock(movementRows, fallbackCost);

  const rows = productRows
    .map((p) => {
      const valuation = valuations.get(p.id);
      const quantity = valuation?.quantity ?? 0;
      const listCost = parseFloat(p.purchasePrice) || 0;
      const retail = parseFloat(p.sellingPrice) || 0;
      return {
        id: p.id,
        itemCode: p.itemCode,
        name: p.name,
        quantity,
        /** What the stock actually on hand cost, per unit. */
        averageCost: valuation && quantity !== 0 ? valuation.averageCost : listCost,
        listPurchasePrice: listCost,
        sellingPrice: retail,
        stockValue: valuation?.value ?? 0,
        retailValue: round2(quantity * retail),
        cogs: valuation?.cogs ?? 0,
        shortStockQuantity: valuation?.shortStockQuantity ?? 0,
        batches: (valuation?.layers ?? []).map((l) => ({
          batchNumber: l.batchNumber,
          quantity: l.quantity,
          unitCost: l.unitCost,
          value: round2(l.quantity * l.unitCost),
        })),
      };
    })
    .sort((a, b) => b.stockValue - a.stockValue);

  return {
    rows,
    summary: {
      products: rows.length,
      units: round2(rows.reduce((s, r) => s + r.quantity, 0)),
      stockValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
      retailValue: round2(rows.reduce((s, r) => s + r.retailValue, 0)),
      /** Positive only when something was billed out before its purchase was entered. */
      negativeStockUnits: round2(rows.reduce((s, r) => s + r.shortStockQuantity, 0)),
    },
  };
}

/**
 * Rate-wise outward and inward tax summaries — the working numbers behind a
 * GSTR-1 / GSTR-3B filing. B2B vs B2C is split on whether the customer has a
 * GSTIN on file. These are summaries to reconcile against, not filing-format
 * returns: the government JSON schemas and GSTIN validation aren't implemented.
 */
export async function getGstReport(range: { from: string; to: string }) {
  const membership = await requireReports();
  const db = await getDb();
  const { from, to } = parseRange(range);
  const businessId = membership.businessId;

  const saleRows = await db
    .select({ id: sales.id, docType: sales.docType, customerGstin: customers.gstin })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.businessId, businessId), eq(sales.status, "completed"), gte(sales.createdAt, from), lte(sales.createdAt, to)));

  const purchaseRows = await db
    .select({ id: purchases.id, docType: purchases.docType })
    .from(purchases)
    .where(
      and(eq(purchases.businessId, businessId), eq(purchases.status, "completed"), gte(purchases.createdAt, from), lte(purchases.createdAt, to))
    );

  const saleIds = saleRows.filter((s) => s.docType === "sale" || s.docType === "sale_return").map((s) => s.id);
  const purchaseIds = purchaseRows.filter((p) => p.docType === "purchase" || p.docType === "purchase_return").map((p) => p.id);

  const [saleItemRows, purchaseItemRows] = await Promise.all([
    saleIds.length
      ? db
          .select({
            saleId: saleItems.saleId,
            taxRatePercent: saleItems.taxRatePercent,
            taxAmount: saleItems.taxAmount,
            lineTotal: saleItems.lineTotal,
          })
          .from(saleItems)
          .where(inArray(saleItems.saleId, saleIds))
      : Promise.resolve([]),
    purchaseIds.length
      ? db
          .select({
            purchaseId: purchaseItems.purchaseId,
            taxRatePercent: purchaseItems.taxRatePercent,
            taxAmount: purchaseItems.taxAmount,
            lineTotal: purchaseItems.lineTotal,
          })
          .from(purchaseItems)
          .where(inArray(purchaseItems.purchaseId, purchaseIds))
      : Promise.resolve([]),
  ]);

  const saleMeta = new Map(saleRows.map((s) => [s.id, s]));
  const purchaseMeta = new Map(purchaseRows.map((p) => [p.id, p]));

  type Bucket = { ratePercent: number; taxableValue: number; taxAmount: number; b2bTaxable: number; b2cTaxable: number; lineCount: number };
  const outward = new Map<number, Bucket>();
  const inward = new Map<number, Bucket>();

  for (const item of saleItemRows) {
    const meta = saleMeta.get(item.saleId);
    if (!meta) continue;
    const factor = meta.docType === "sale_return" ? -1 : 1;
    const rate = parseFloat(item.taxRatePercent);
    const tax = factor * parseFloat(item.taxAmount);
    const taxable = factor * (parseFloat(item.lineTotal) - parseFloat(item.taxAmount));
    const bucket = outward.get(rate) ?? { ratePercent: rate, taxableValue: 0, taxAmount: 0, b2bTaxable: 0, b2cTaxable: 0, lineCount: 0 };
    bucket.taxableValue = round2(bucket.taxableValue + taxable);
    bucket.taxAmount = round2(bucket.taxAmount + tax);
    if (meta.customerGstin) bucket.b2bTaxable = round2(bucket.b2bTaxable + taxable);
    else bucket.b2cTaxable = round2(bucket.b2cTaxable + taxable);
    bucket.lineCount += 1;
    outward.set(rate, bucket);
  }

  for (const item of purchaseItemRows) {
    const meta = purchaseMeta.get(item.purchaseId);
    if (!meta) continue;
    const factor = meta.docType === "purchase_return" ? -1 : 1;
    const rate = parseFloat(item.taxRatePercent);
    const tax = factor * parseFloat(item.taxAmount);
    const taxable = factor * (parseFloat(item.lineTotal) - parseFloat(item.taxAmount));
    const bucket = inward.get(rate) ?? { ratePercent: rate, taxableValue: 0, taxAmount: 0, b2bTaxable: 0, b2cTaxable: 0, lineCount: 0 };
    bucket.taxableValue = round2(bucket.taxableValue + taxable);
    bucket.taxAmount = round2(bucket.taxAmount + tax);
    bucket.lineCount += 1;
    inward.set(rate, bucket);
  }

  const outwardRows = [...outward.values()].sort((a, b) => a.ratePercent - b.ratePercent);
  const inwardRows = [...inward.values()].sort((a, b) => a.ratePercent - b.ratePercent);
  const outputTax = round2(outwardRows.reduce((s, r) => s + r.taxAmount, 0));
  const inputTax = round2(inwardRows.reduce((s, r) => s + r.taxAmount, 0));

  return {
    outward: outwardRows,
    inward: inwardRows,
    summary: {
      outwardTaxable: round2(outwardRows.reduce((s, r) => s + r.taxableValue, 0)),
      inwardTaxable: round2(inwardRows.reduce((s, r) => s + r.taxableValue, 0)),
      outputTax,
      inputTax,
      netPayable: round2(outputTax - inputTax),
    },
  };
}

/**
 * Turns any report table the UI is already showing into a real .xlsx file.
 *
 * The rows arrive from the client because that is exactly what the user can
 * see; the permission check still runs here, so this cannot be used to reach
 * data the caller has no right to. Returned base64 rather than a Blob because
 * server action results are JSON.
 */
export async function exportWorkbook(
  title: string,
  sheets: { name: string; headers: string[]; rows: (string | number | null)[][] }[]
): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  await requireReports();

  if (sheets.length === 0) return { ok: false, error: "Nothing to export." };
  const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows > 100_000) return { ok: false, error: "That is too much data for one workbook — narrow the date range." };

  try {
    const { buildWorkbook } = await import("@/lib/export/workbook");
    const buffer = await buildWorkbook(sheets, title);
    return { ok: true, base64: buffer.toString("base64") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the workbook." };
  }
}

/**
 * Gross profit for a period: revenue less what the goods sold actually cost,
 * taken from the FIFO cost layers rather than the product master's current
 * price. Returns are netted off both sides.
 *
 * "Gross" is meant literally — this is revenue minus cost of goods. Operating
 * expenses live in the journal and are not deducted here.
 */
export async function getGrossProfit(range: { from: string; to: string }) {
  const membership = await requireReports();
  const db = await getDb();
  const { from, to } = parseRange(range);
  const businessId = membership.businessId;

  const [warehouseRows, productRows] = await Promise.all([
    listWarehousesForBusiness(businessId),
    db.select({ id: products.id, purchasePrice: products.purchasePrice }).from(products).where(eq(products.businessId, businessId)),
  ]);
  const warehouseIds = warehouseRows.map((w) => w.id);

  // The whole ledger is replayed, because FIFO cost depends on everything that
  // came before — then only the movements inside the window are counted.
  const movementRows = warehouseIds.length
    ? await db
        .select({
          id: stockMovements.id,
          productId: stockMovements.productId,
          warehouseId: stockMovements.warehouseId,
          quantity: stockMovements.quantity,
          unitCost: stockMovements.unitCost,
          batchNumber: stockMovements.batchNumber,
          createdAt: stockMovements.createdAt,
          type: stockMovements.type,
          referenceId: stockMovements.referenceId,
        })
        .from(stockMovements)
        .where(and(eq(stockMovements.businessId, businessId), inArray(stockMovements.warehouseId, warehouseIds)))
    : [];

  const fallbackCost = new Map(productRows.map((p) => [p.id, parseFloat(p.purchasePrice) || 0]));
  const upToEnd = valueStock(
    movementRows.filter((m) => m.createdAt <= to),
    fallbackCost
  );
  const beforeStart = valueStock(
    movementRows.filter((m) => m.createdAt < from),
    fallbackCost
  );

  let cogs = 0;
  for (const [productId, valuation] of upToEnd) {
    cogs += valuation.cogs - (beforeStart.get(productId)?.cogs ?? 0);
  }
  cogs = round2(cogs);

  const saleRows = await db
    .select({ docType: sales.docType, subtotal: sales.subtotal, discountAmount: sales.discountAmount })
    .from(sales)
    .where(
      and(
        eq(sales.businessId, businessId),
        eq(sales.status, "completed"),
        gte(sales.createdAt, from),
        lte(sales.createdAt, to)
      )
    );

  // Revenue is taxable value, not the gross total — tax collected is the
  // government's money, never the shop's margin.
  const revenue = round2(
    saleRows
      .filter((r) => r.docType === "sale" || r.docType === "sale_return")
      .reduce(
        (sum, r) => sum + (r.docType === "sale_return" ? -1 : 1) * (parseFloat(r.subtotal) - parseFloat(r.discountAmount)),
        0
      )
  );

  return {
    revenue,
    cogs,
    grossProfit: round2(revenue - cogs),
    marginPercent: revenue !== 0 ? round2(((revenue - cogs) / revenue) * 100) : 0,
  };
}
