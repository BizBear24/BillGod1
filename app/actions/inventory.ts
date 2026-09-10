"use server";

import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  stockMovements,
  stockTransfers,
  stockTransferItems,
  stockAdjustments,
  stockAdjustmentItems,
  serialMovements,
  products,
  warehouses,
} from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { listWarehousesForBusiness } from "./org";
import { createTransferSchema, createAdjustmentSchema } from "@/lib/validation/inventory";
import type { ActionResult } from "./auth";

async function requireInventoryGate(permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, permission)) {
    return { ok: false as const, error: "You don't have permission to do that." };
  }
  return { ok: true as const, sessionUser, membership };
}

/** Stock levels (per warehouse and total) for every product, built by summing the movement ledger. */
export async function getInventoryPageData() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [warehouseRows, productRows] = await Promise.all([
    listWarehousesForBusiness(businessId),
    db.select().from(products).where(eq(products.businessId, businessId)),
  ]);

  const warehouseIds = warehouseRows.map((w) => w.id);
  const stockRows = warehouseIds.length
    ? await db
        .select({
          productId: stockMovements.productId,
          warehouseId: stockMovements.warehouseId,
          total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)`,
        })
        .from(stockMovements)
        .where(and(eq(stockMovements.businessId, businessId), inArray(stockMovements.warehouseId, warehouseIds)))
        .groupBy(stockMovements.productId, stockMovements.warehouseId)
    : [];

  const stockByProduct: Record<string, { total: number; byWarehouse: Record<string, number> }> = {};
  for (const row of stockRows) {
    const qty = parseFloat(row.total);
    if (!stockByProduct[row.productId]) stockByProduct[row.productId] = { total: 0, byWarehouse: {} };
    stockByProduct[row.productId].byWarehouse[row.warehouseId] = qty;
    stockByProduct[row.productId].total += qty;
  }

  return {
    warehouses: warehouseRows,
    products: productRows,
    stockByProduct,
    canManage: can(membership.role, PERMISSIONS.INVENTORY_MANAGE),
  };
}

export async function getStockLedger(filters: { productId?: string; warehouseId?: string; limit?: number } = {}) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const conditions = [eq(stockMovements.businessId, membership.businessId)];
  if (filters.productId) conditions.push(eq(stockMovements.productId, filters.productId));
  if (filters.warehouseId) conditions.push(eq(stockMovements.warehouseId, filters.warehouseId));

  return db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      batchNumber: stockMovements.batchNumber,
      expiryDate: stockMovements.expiryDate,
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      createdAt: stockMovements.createdAt,
      productName: products.name,
      itemCode: products.itemCode,
      warehouseName: warehouses.name,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt))
    .limit(filters.limit ?? 200);
}

export async function createTransfer(input: unknown): Promise<ActionResult & { transferId?: string; docNumber?: string }> {
  const gate = await requireInventoryGate(PERMISSIONS.INVENTORY_MANAGE);
  if (!gate.ok) return gate;

  const parsed = createTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  const warehouseRows = await listWarehousesForBusiness(businessId);
  const warehouseIds = new Set(warehouseRows.map((w) => w.id));
  if (!warehouseIds.has(parsed.data.fromWarehouseId) || !warehouseIds.has(parsed.data.toWarehouseId)) {
    return { ok: false, error: "Warehouse not found." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(stockTransfers).where(eq(stockTransfers.businessId, businessId));
      const docNumber = `TRF-${String(count + 1).padStart(6, "0")}`;

      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          businessId,
          docNumber,
          status: "completed",
          fromWarehouseId: parsed.data.fromWarehouseId,
          toWarehouseId: parsed.data.toWarehouseId,
          notes: parsed.data.notes || null,
          createdByUserId: gate.sessionUser.userId,
        })
        .returning();

      await tx.insert(stockTransferItems).values(
        parsed.data.items.map((item) => ({
          transferId: transfer.id,
          productId: item.productId,
          itemCode: item.itemCode,
          name: item.name,
          quantity: String(item.quantity),
          batchNumber: item.batchNumber || null,
        }))
      );

      await tx.insert(stockMovements).values(
        parsed.data.items.flatMap((item) => [
          {
            businessId,
            warehouseId: parsed.data.fromWarehouseId,
            productId: item.productId,
            type: "transfer_out" as const,
            quantity: String(-item.quantity),
            batchNumber: item.batchNumber || null,
            referenceType: "transfer" as const,
            referenceId: transfer.id,
            createdByUserId: gate.sessionUser.userId,
          },
          {
            businessId,
            warehouseId: parsed.data.toWarehouseId,
            productId: item.productId,
            type: "transfer_in" as const,
            quantity: String(item.quantity),
            batchNumber: item.batchNumber || null,
            referenceType: "transfer" as const,
            referenceId: transfer.id,
            createdByUserId: gate.sessionUser.userId,
          },
        ])
      );

      return transfer;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "stock_transfer.created",
      entityType: "stock_transfer",
      entityId: result.id,
      after: { docNumber: result.docNumber },
    });

    return { ok: true, transferId: result.id, docNumber: result.docNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the transfer." };
  }
}

export async function createAdjustment(input: unknown): Promise<ActionResult & { adjustmentId?: string; docNumber?: string }> {
  const gate = await requireInventoryGate(PERMISSIONS.INVENTORY_MANAGE);
  if (!gate.ok) return gate;

  const parsed = createAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  const warehouseRows = await listWarehousesForBusiness(businessId);
  if (!warehouseRows.some((w) => w.id === parsed.data.warehouseId)) {
    return { ok: false, error: "Warehouse not found." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(stockAdjustments).where(eq(stockAdjustments.businessId, businessId));
      const docNumber = `ADJ-${String(count + 1).padStart(6, "0")}`;

      const [adjustment] = await tx
        .insert(stockAdjustments)
        .values({
          businessId,
          warehouseId: parsed.data.warehouseId,
          docNumber,
          reason: parsed.data.reason,
          notes: parsed.data.notes || null,
          createdByUserId: gate.sessionUser.userId,
        })
        .returning();

      await tx.insert(stockAdjustmentItems).values(
        parsed.data.items.map((item) => ({
          adjustmentId: adjustment.id,
          productId: item.productId,
          itemCode: item.itemCode,
          name: item.name,
          quantityDelta: String(item.quantityDelta),
          batchNumber: item.batchNumber || null,
        }))
      );

      await tx.insert(stockMovements).values(
        parsed.data.items.map((item) => {
          const type: "adjustment_in" | "adjustment_out" = item.quantityDelta > 0 ? "adjustment_in" : "adjustment_out";
          return {
            businessId,
            warehouseId: parsed.data.warehouseId,
            productId: item.productId,
            type,
            quantity: String(item.quantityDelta),
            batchNumber: item.batchNumber || null,
            referenceType: "adjustment" as const,
            referenceId: adjustment.id,
            notes: parsed.data.reason,
            createdByUserId: gate.sessionUser.userId,
          };
        })
      );

      return adjustment;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "stock_adjustment.created",
      entityType: "stock_adjustment",
      entityId: result.id,
      after: { docNumber: result.docNumber, reason: result.reason },
    });

    return { ok: true, adjustmentId: result.id, docNumber: result.docNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the adjustment." };
  }
}

export async function listTransfers(limit = 50) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  return db
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.businessId, membership.businessId))
    .orderBy(desc(stockTransfers.createdAt))
    .limit(limit);
}

export async function listAdjustments(limit = 50) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  return db
    .select()
    .from(stockAdjustments)
    .where(eq(stockAdjustments.businessId, membership.businessId))
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(limit);
}

/** Products at or below their reorder level (current stock summed across all warehouses). */
export async function getLowStockReport() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const productRows = await db.select().from(products).where(and(eq(products.businessId, businessId), eq(products.isActive, true)));
  const stockRows = await db
    .select({ productId: stockMovements.productId, total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
    .from(stockMovements)
    .where(eq(stockMovements.businessId, businessId))
    .groupBy(stockMovements.productId);
  const stockByProduct = Object.fromEntries(stockRows.map((r) => [r.productId, parseFloat(r.total)]));

  return productRows
    .map((p) => ({ product: p, currentStock: stockByProduct[p.id] ?? 0 }))
    .filter((row) => {
      const threshold = parseFloat(row.product.reorderLevel) || parseFloat(row.product.minStock) || 0;
      return threshold > 0 && row.currentStock <= threshold;
    })
    .sort((a, b) => a.currentStock - b.currentStock);
}

/** Products holding stock with no outbound movement in the given window. */
export async function getDeadStockReport(days = 60) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const productRows = await db.select().from(products).where(and(eq(products.businessId, businessId), eq(products.isActive, true)));
  const [stockRows, recentOutRows] = await Promise.all([
    db
      .select({ productId: stockMovements.productId, total: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)` })
      .from(stockMovements)
      .where(eq(stockMovements.businessId, businessId))
      .groupBy(stockMovements.productId),
    db
      .select({ productId: stockMovements.productId })
      .from(stockMovements)
      .where(and(eq(stockMovements.businessId, businessId), eq(stockMovements.type, "sale_out"), gte(stockMovements.createdAt, cutoff)))
      .groupBy(stockMovements.productId),
  ]);
  const stockByProduct = Object.fromEntries(stockRows.map((r) => [r.productId, parseFloat(r.total)]));
  const recentlySold = new Set(recentOutRows.map((r) => r.productId));

  return productRows
    .map((p) => ({ product: p, currentStock: stockByProduct[p.id] ?? 0 }))
    .filter((row) => row.currentStock > 0 && !recentlySold.has(row.product.id))
    .sort((a, b) => b.currentStock - a.currentStock);
}

/** Products ranked by units sold within the window — highest first (fast movers), zero-sold last (slow movers). */
export async function getFastSlowMovingReport(days = 30) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const productRows = await db.select().from(products).where(and(eq(products.businessId, businessId), eq(products.isActive, true)));
  const soldRows = await db
    .select({ productId: stockMovements.productId, total: sql<string>`coalesce(sum(-${stockMovements.quantity}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.businessId, businessId), eq(stockMovements.type, "sale_out"), gte(stockMovements.createdAt, cutoff)))
    .groupBy(stockMovements.productId);
  const soldByProduct = Object.fromEntries(soldRows.map((r) => [r.productId, parseFloat(r.total)]));

  return productRows
    .map((p) => ({ product: p, unitsSold: soldByProduct[p.id] ?? 0 }))
    .sort((a, b) => b.unitsSold - a.unitsSold);
}

/**
 * Every serial-tracked unit and where it stands right now.
 *
 * Status is derived from the movement ledger, not stored: a serial whose rows
 * net to one unit in is on the shelf, and one that nets to zero has left. The
 * most recent movement supplies the document it moved on.
 */
export async function getSerialRegister(limit = 500) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.INVENTORY_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const rows = await db
    .select({
      productId: serialMovements.productId,
      productName: products.name,
      itemCode: products.itemCode,
      serial: serialMovements.serial,
      direction: serialMovements.direction,
      referenceLabel: serialMovements.referenceLabel,
      referenceType: serialMovements.referenceType,
      notes: serialMovements.notes,
      createdAt: serialMovements.createdAt,
    })
    .from(serialMovements)
    .innerJoin(products, eq(serialMovements.productId, products.id))
    .where(eq(serialMovements.businessId, businessId))
    .orderBy(serialMovements.createdAt);

  type Entry = {
    key: string;
    productId: string;
    itemCode: string;
    productName: string;
    serial: string;
    balance: number;
    lastDocument: string | null;
    lastMovedAt: Date;
    movements: number;
  };

  const byUnit = new Map<string, Entry>();
  for (const row of rows) {
    const key = `${row.productId} ${row.serial}`;
    const entry =
      byUnit.get(key) ??
      ({
        key,
        productId: row.productId,
        itemCode: row.itemCode,
        productName: row.productName,
        serial: row.serial,
        balance: 0,
        lastDocument: null,
        lastMovedAt: row.createdAt,
        movements: 0,
      } satisfies Entry);
    entry.balance += row.direction === "in" ? 1 : -1;
    entry.lastDocument = row.notes ? `${row.referenceLabel ?? row.referenceType} (${row.notes})` : row.referenceLabel;
    entry.lastMovedAt = row.createdAt;
    entry.movements += 1;
    byUnit.set(key, entry);
  }

  const register = [...byUnit.values()]
    .map((entry) => ({ ...entry, status: entry.balance > 0 ? ("in_stock" as const) : ("sold" as const) }))
    .sort((a, b) => b.lastMovedAt.getTime() - a.lastMovedAt.getTime())
    .slice(0, limit);

  return {
    rows: register,
    summary: {
      tracked: byUnit.size,
      inStock: [...byUnit.values()].filter((e) => e.balance > 0).length,
    },
  };
}
