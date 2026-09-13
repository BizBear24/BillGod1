"use server";

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { purchases, purchaseItems, purchasePayments, products, suppliers, taxRates, stockMovements, hsnCodes, businesses } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { listWarehousesForBusiness } from "./org";
import { postPurchaseJournal, reverseJournalFor } from "@/lib/accounting/posting";
import { parseSerials, recordSerialMovements, reverseSerialMovements } from "@/lib/inventory/serials";
import { createPurchaseSchema, type CreatePurchaseInput } from "@/lib/validation/purchases";
import type { ActionResult } from "./auth";

const DOC_PREFIX: Record<CreatePurchaseInput["docType"], string> = {
  purchase_order: "PO",
  purchase: "PUR",
  purchase_return: "PRET",
};

/** Which doc types move physical stock, and in which direction, once completed. */
const STOCK_IMPACT: Partial<Record<CreatePurchaseInput["docType"], "in" | "out">> = {
  purchase: "in",
  purchase_return: "out",
};

async function requirePurchaseGate(permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, permission)) {
    return { ok: false as const, error: "You don't have permission to do that." };
  }
  return { ok: true as const, sessionUser, membership };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeTotals(items: CreatePurchaseInput["items"]) {
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;
  const lines = items.map((item) => {
    const lineSubtotal = item.quantity * item.unitCost;
    const lineDiscount = lineSubtotal * ((item.discountPercent ?? 0) / 100);
    const taxable = lineSubtotal - lineDiscount;
    const lineTax = taxable * ((item.taxRatePercent ?? 0) / 100);
    const lineTotal = round2(taxable + lineTax);

    subtotal += lineSubtotal;
    discountAmount += lineDiscount;
    taxAmount += lineTax;

    return {
      productId: item.productId,
      itemCode: item.itemCode,
      name: item.name,
      quantity: String(item.quantity),
      unitCost: String(item.unitCost),
      discountPercent: String(item.discountPercent ?? 0),
      taxRatePercent: String(item.taxRatePercent ?? 0),
      taxAmount: String(round2(lineTax)),
      lineTotal: String(lineTotal),
      batchNumber: item.batchNumber || null,
      expiryDate: item.expiryDate || null,
      serialNumbers: item.serialNumbers || null,
    };
  });

  const totalAmount = round2(subtotal - discountAmount + taxAmount);
  return {
    lines,
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxAmount: round2(taxAmount),
    totalAmount,
  };
}

/** Creates a new purchase order/purchase/return, or overwrites a still-draft one (hold & resume). */
export async function savePurchase(
  purchaseId: string | null,
  input: unknown
): Promise<ActionResult & { purchaseId?: string; docNumber?: string }> {
  const gate = await requirePurchaseGate(PERMISSIONS.PURCHASE_MANAGE);
  if (!gate.ok) return gate;

  const parsed = createPurchaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.id, parsed.data.supplierId), eq(suppliers.businessId, businessId))).limit(1);
  if (!supplier) return { ok: false, error: "Supplier not found." };

  // A return can be raised against a specific purchase, which is what lets it
  // be validated against what was actually received on that document.
  let original: typeof purchases.$inferSelect | null = null;
  if (parsed.data.originalPurchaseId) {
    if (parsed.data.docType !== "purchase_return") return { ok: false, error: "Only a purchase return can be raised against another purchase." };
    const [row] = await db
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, parsed.data.originalPurchaseId), eq(purchases.businessId, businessId)))
      .limit(1);
    if (!row) return { ok: false, error: "The purchase being returned against was not found." };
    if (row.docType !== "purchase") return { ok: false, error: "Returns can only be raised against a purchase." };
    if (row.status !== "completed") return { ok: false, error: "That purchase is not completed, so nothing can be returned against it." };
    if (row.supplierId !== parsed.data.supplierId) return { ok: false, error: "The return's supplier must match the original purchase's supplier." };
    original = row;
  }

  const { lines, subtotal, discountAmount, taxAmount, totalAmount } = computeTotals(parsed.data.items);
  const amountPaid = round2((parsed.data.payments ?? []).reduce((sum, p) => sum + p.amount, 0));
  const status = parsed.data.isDraft ? "draft" : "completed";

  const stockDirection = STOCK_IMPACT[parsed.data.docType];
  if (status === "completed" && stockDirection && !parsed.data.warehouseId) {
    return { ok: false, error: "Select a warehouse before completing this document." };
  }

  /*
   * Serial numbers are only meaningful for products flagged to track them, so
   * the flag is read from the master rather than trusted from the client. A
   * tracked product must account for every unit it receives; an untracked one
   * keeps whatever free text was typed on the line and nothing more.
   */
  const trackedProducts = new Map(
    (
      await db
        .select({ id: products.id, name: products.name, trackSerial: products.trackSerial })
        .from(products)
        .where(and(eq(products.businessId, businessId), inArray(products.id, [...new Set(parsed.data.items.map((i) => i.productId))])))
    ).map((row) => [row.id, row])
  );

  const serialLines: { productId: string; productName: string; quantity: number; serials: string[] }[] = [];
  if (status === "completed" && stockDirection) {
    for (const item of parsed.data.items) {
      const product = trackedProducts.get(item.productId);
      if (!product?.trackSerial) continue;
      const serials = parseSerials(item.serialNumbers);
      if (serials.length !== Math.round(item.quantity)) {
        return {
          ok: false,
          error: `${product.name} tracks serial numbers — list ${Math.round(item.quantity)} of them, separated by commas.`,
        };
      }
      serialLines.push({ productId: item.productId, productName: product.name, quantity: item.quantity, serials });
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      let targetId = purchaseId;

      if (targetId) {
        const [existing] = await tx.select().from(purchases).where(and(eq(purchases.id, targetId), eq(purchases.businessId, businessId))).limit(1);
        if (!existing) throw new Error("Purchase not found.");
        if (existing.status !== "draft") throw new Error("Only held (draft) documents can be edited.");

        await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, targetId));
        await tx.delete(purchasePayments).where(eq(purchasePayments.purchaseId, targetId));
        await tx
          .update(purchases)
          .set({
            docType: parsed.data.docType,
            status,
            warehouseId: parsed.data.warehouseId ?? null,
            originalPurchaseId: original?.id ?? null,
            supplierId: parsed.data.supplierId,
            supplierInvoiceNumber: parsed.data.supplierInvoiceNumber || null,
            subtotal: String(subtotal),
            discountAmount: String(discountAmount),
            taxAmount: String(taxAmount),
            totalAmount: String(totalAmount),
            amountPaid: String(amountPaid),
            notes: parsed.data.notes || null,
            updatedAt: new Date(),
          })
          .where(eq(purchases.id, targetId));
      } else {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(purchases)
          .where(and(eq(purchases.businessId, businessId), eq(purchases.docType, parsed.data.docType)));
        // A shop migrating from another billing system sets a one-time offset
        // (Bill Settings) so numbering continues from their last document
        // instead of restarting at 1.
        const [business] = await tx.select({ docNumberOffsets: businesses.docNumberOffsets }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
        const offset = business?.docNumberOffsets?.[parsed.data.docType] ?? 0;
        const docNumber = `${DOC_PREFIX[parsed.data.docType]}-${String(count + 1 + offset).padStart(6, "0")}`;

        const [created] = await tx
          .insert(purchases)
          .values({
            businessId,
            docType: parsed.data.docType,
            docNumber,
            status,
            warehouseId: parsed.data.warehouseId ?? null,
            originalPurchaseId: original?.id ?? null,
            supplierId: parsed.data.supplierId,
            supplierInvoiceNumber: parsed.data.supplierInvoiceNumber || null,
            subtotal: String(subtotal),
            discountAmount: String(discountAmount),
            taxAmount: String(taxAmount),
            totalAmount: String(totalAmount),
            amountPaid: String(amountPaid),
            notes: parsed.data.notes || null,
            createdByUserId: gate.sessionUser.userId,
          })
          .returning();
        targetId = created.id;
      }

      if (!targetId) throw new Error("Failed to save purchase.");

      await tx.insert(purchaseItems).values(lines.map((line, i) => ({ ...line, purchaseId: targetId!, sortOrder: i })));

      if (parsed.data.payments?.length) {
        await tx.insert(purchasePayments).values(parsed.data.payments.map((p) => ({ purchaseId: targetId!, method: p.method, amount: String(p.amount) })));
      }

      // Post stock movements exactly once, the moment this doc first becomes
      // "completed" — drafts can only be re-edited while still draft, so this
      // branch can never run twice for the same purchase.
      if (status === "completed" && stockDirection && parsed.data.warehouseId) {
        const sign = stockDirection === "in" ? 1 : -1;
        const movementType: "purchase_in" | "purchase_return_out" = stockDirection === "in" ? "purchase_in" : "purchase_return_out";
        await tx.insert(stockMovements).values(
          lines
            .filter((line) => line.productId)
            .map((line) => ({
              businessId,
              warehouseId: parsed.data.warehouseId!,
              productId: line.productId,
              type: movementType,
              quantity: String(sign * parseFloat(line.quantity)),
              unitCost: line.unitCost,
              batchNumber: line.batchNumber,
              expiryDate: line.expiryDate,
              referenceType: "purchase" as const,
              referenceId: targetId!,
              createdByUserId: gate.sessionUser.userId,
            }))
        );
      }

      const [row] = await tx.select().from(purchases).where(eq(purchases.id, targetId)).limit(1);

      // Serial-tracked goods get a row per physical unit, in the same
      // direction the stock moved. A wrong count or an already-received unit
      // throws here and takes the whole document down with it.
      if (status === "completed" && stockDirection && parsed.data.warehouseId && serialLines.length > 0) {
        await recordSerialMovements(tx, {
          businessId,
          warehouseId: parsed.data.warehouseId,
          direction: stockDirection,
          referenceType: "purchase",
          referenceId: targetId,
          referenceLabel: row.docNumber,
          userId: gate.sessionUser.userId,
          lines: serialLines,
        });
      }

      // Books are written when the document first becomes final, inside this
      // transaction, so a failed posting rolls back the whole purchase.
      if (status === "completed" && (parsed.data.docType === "purchase" || parsed.data.docType === "purchase_return")) {
        await postPurchaseJournal(tx, {
          businessId,
          userId: gate.sessionUser.userId,
          purchaseId: targetId,
          docType: parsed.data.docType,
          docNumber: row.docNumber,
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          supplierId: parsed.data.supplierId,
          payments: parsed.data.payments ?? [],
        });
      }

      return row;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: purchaseId ? "purchase.updated" : "purchase.created",
      entityType: "purchase",
      entityId: result.id,
      after: { docNumber: result.docNumber, status: result.status, totalAmount: result.totalAmount },
    });

    return { ok: true, purchaseId: result.id, docNumber: result.docNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the purchase." };
  }
}

/**
 * Voids a completed purchase document: stock and books go back where they
 * were, by appending the opposite events rather than deleting the originals,
 * so the ledgers still explain how things got to where they are.
 */
export async function cancelPurchase(purchaseId: string, reason: string): Promise<ActionResult> {
  const gate = await requirePurchaseGate(PERMISSIONS.PURCHASE_MANAGE);
  if (!gate.ok) return gate;

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) return { ok: false, error: "Give a reason for cancelling (at least 3 characters)." };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  try {
    const result = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(purchases)
        .where(and(eq(purchases.id, purchaseId), eq(purchases.businessId, businessId)))
        .limit(1);
      if (!purchase) throw new Error("Purchase not found.");
      if (purchase.status === "cancelled") throw new Error("That document is already cancelled.");
      if (purchase.status !== "completed") throw new Error("Only completed documents can be cancelled — discard a held document instead.");

      const movements = await tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.referenceType, "purchase"), eq(stockMovements.referenceId, purchaseId)));

      // Refuse to take back goods that have already left the shelf.
      if (movements.length > 0) {
        const productIds = [...new Set(movements.map((m) => m.productId))];
        const balances = await tx
          .select({ productId: stockMovements.productId, quantity: stockMovements.quantity, warehouseId: stockMovements.warehouseId })
          .from(stockMovements)
          .where(and(eq(stockMovements.businessId, businessId), inArray(stockMovements.productId, productIds)));

        const onHand = new Map<string, number>();
        for (const b of balances) {
          const key = `${b.productId}:${b.warehouseId}`;
          onHand.set(key, (onHand.get(key) ?? 0) + parseFloat(b.quantity));
        }
        for (const m of movements) {
          const key = `${m.productId}:${m.warehouseId}`;
          const remaining = onHand.get(key) ?? 0;
          const takingBack = parseFloat(m.quantity);
          if (takingBack > 0 && remaining < takingBack) {
            const [product] = await tx.select({ name: products.name }).from(products).where(eq(products.id, m.productId)).limit(1);
            throw new Error(
              `Only ${remaining} of ${product?.name ?? "that item"} is left in stock — ${takingBack} came in on this document, so it cannot be taken back.`
            );
          }
        }

        await tx.insert(stockMovements).values(
          movements.map((m) => ({
            businessId,
            warehouseId: m.warehouseId,
            productId: m.productId,
            type: (parseFloat(m.quantity) < 0 ? "cancel_in" : "cancel_out") as "cancel_in" | "cancel_out",
            quantity: String(-parseFloat(m.quantity)),
            unitCost: m.unitCost,
            batchNumber: m.batchNumber,
            expiryDate: m.expiryDate,
            referenceType: "purchase" as const,
            referenceId: purchaseId,
            notes: `Cancelled ${purchase.docNumber}`,
            createdByUserId: gate.sessionUser.userId,
          }))
        );
      }

      await reverseSerialMovements(tx, {
        businessId,
        referenceType: "purchase",
        referenceId: purchaseId,
        note: `Cancelled ${purchase.docNumber}`,
        userId: gate.sessionUser.userId,
      });

      await reverseJournalFor(tx, {
        businessId,
        userId: gate.sessionUser.userId,
        referenceType: "purchase",
        referenceId: purchaseId,
        narration: `Cancellation of ${purchase.docNumber}`,
      });

      await tx
        .update(purchases)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledByUserId: gate.sessionUser.userId,
          cancelReason: trimmedReason,
          updatedAt: new Date(),
        })
        .where(eq(purchases.id, purchaseId));

      return purchase;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "purchase.cancelled",
      entityType: "purchase",
      entityId: purchaseId,
      before: { status: result.status, totalAmount: result.totalAmount },
      after: { status: "cancelled", reason: trimmedReason },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not cancel the document." };
  }
}

export async function discardHeldPurchase(purchaseId: string): Promise<ActionResult> {
  const gate = await requirePurchaseGate(PERMISSIONS.PURCHASE_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  const [existing] = await db.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.businessId, gate.membership.businessId))).limit(1);
  if (!existing) return { ok: false, error: "Purchase not found." };
  if (existing.status !== "draft") return { ok: false, error: "Only held (draft) documents can be discarded." };
  await db.delete(purchases).where(eq(purchases.id, purchaseId));
  return { ok: true };
}

export async function getPurchasesPageData() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PURCHASE_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [productRows, supplierRows, taxRateRows, heldPurchases, warehouseRows, recent, returnable] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, businessId)),
    db.select().from(suppliers).where(eq(suppliers.businessId, businessId)),
    db.select().from(taxRates).where(eq(taxRates.businessId, businessId)),
    db.select().from(purchases).where(and(eq(purchases.businessId, businessId), eq(purchases.status, "draft"))).orderBy(desc(purchases.updatedAt)),
    listWarehousesForBusiness(businessId),
    listRecentPurchasesFor(businessId, 40),
    listReturnablePurchasesFor(businessId, 100),
  ]);

  return {
    products: productRows,
    suppliers: supplierRows,
    taxRates: taxRateRows,
    heldPurchases,
    warehouses: warehouseRows,
    recentPurchases: recent,
    returnablePurchases: returnable,
    canManage: can(membership.role, PERMISSIONS.PURCHASE_MANAGE),
  };
}

/** Recent finalised documents, cancelled ones included so a void stays visible. */
async function listRecentPurchasesFor(businessId: string, limit: number) {
  const db = await getDb();
  return db
    .select({
      id: purchases.id,
      docNumber: purchases.docNumber,
      docType: purchases.docType,
      status: purchases.status,
      totalAmount: purchases.totalAmount,
      amountPaid: purchases.amountPaid,
      supplierName: suppliers.name,
      createdAt: purchases.createdAt,
      cancelReason: purchases.cancelReason,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(eq(purchases.businessId, businessId), inArray(purchases.status, ["completed", "cancelled"])))
    .orderBy(desc(purchases.createdAt))
    .limit(limit);
}

export async function getPurchaseWithItems(purchaseId: string) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PURCHASE_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const [purchase] = await db.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.businessId, membership.businessId))).limit(1);
  if (!purchase) return null;
  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
  return { purchase, items };
}

export async function listRecentPurchases(limit = 50) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PURCHASE_VIEW)) throw new Error("FORBIDDEN");
  return listRecentPurchasesFor(membership.businessId, limit);
}

/** The completed purchases a return can be raised against, newest first. */
async function listReturnablePurchasesFor(businessId: string, limit: number) {
  const db = await getDb();
  return db
    .select({
      id: purchases.id,
      docNumber: purchases.docNumber,
      totalAmount: purchases.totalAmount,
      supplierId: purchases.supplierId,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(and(eq(purchases.businessId, businessId), eq(purchases.docType, "purchase"), eq(purchases.status, "completed")))
    .orderBy(desc(purchases.createdAt))
    .limit(limit);
}

export async function listReturnablePurchases(limit = 100) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PURCHASE_VIEW)) throw new Error("FORBIDDEN");
  return listReturnablePurchasesFor(membership.businessId, limit);
}

/**
 * Everything a Goods Receipt / purchase invoice needs to print itself: the
 * document, its lines with their HSN codes, and the names behind the ids.
 * Mirrors `getInvoiceData` in app/actions/sales.ts.
 */
export async function getPurchaseInvoiceData(purchaseId: string) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PURCHASE_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [row] = await db
    .select({
      docNumber: purchases.docNumber,
      docType: purchases.docType,
      status: purchases.status,
      createdAt: purchases.createdAt,
      subtotal: purchases.subtotal,
      discountAmount: purchases.discountAmount,
      taxAmount: purchases.taxAmount,
      roundOff: purchases.roundOff,
      totalAmount: purchases.totalAmount,
      amountPaid: purchases.amountPaid,
      supplierInvoiceNumber: purchases.supplierInvoiceNumber,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      supplierGstin: suppliers.gstin,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.businessId, businessId)))
    .limit(1);
  if (!row) return null;

  const itemRows = await db
    .select({
      id: purchaseItems.id,
      itemCode: purchaseItems.itemCode,
      name: purchaseItems.name,
      quantity: purchaseItems.quantity,
      unitCost: purchaseItems.unitCost,
      discountPercent: purchaseItems.discountPercent,
      taxRatePercent: purchaseItems.taxRatePercent,
      taxAmount: purchaseItems.taxAmount,
      lineTotal: purchaseItems.lineTotal,
      hsn: hsnCodes.code,
    })
    .from(purchaseItems)
    .leftJoin(products, eq(purchaseItems.productId, products.id))
    .leftJoin(hsnCodes, eq(products.hsnId, hsnCodes.id))
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .orderBy(purchaseItems.sortOrder);

  return { purchase: row, lines: itemRows };
}
