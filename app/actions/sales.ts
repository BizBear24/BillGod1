"use server";

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  sales,
  saleItems,
  salePayments,
  products,
  customers,
  salespersons,
  taxRates,
  stockMovements,
  loyaltySettings,
  loyaltyTierTable,
  loyaltyTransactions,
  couponRedemptions,
  coupons as couponsTable,
  hsnCodes,
  businesses,
} from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { listWarehousesForBusiness, listCountersForBusiness } from "./org";
import { postSaleJournal, reverseJournalFor, type PostingTx } from "@/lib/accounting/posting";
import { recordLoyaltyPoints, pointsForAmount, valueOfPoints, toConfig } from "@/lib/loyalty/points";
import { resolveTier } from "@/lib/loyalty/tiers";
import { evaluateCoupon } from "@/lib/loyalty/coupons";
import { settleReferralOnFirstSale } from "@/lib/loyalty/referrals";
import { computeSaleTotals, round2 } from "@/lib/sales/totals";
import { parseSerials, recordSerialMovements, reverseSerialMovements, listSerialsInStock } from "@/lib/inventory/serials";
import { createSaleSchema, type CreateSaleInput } from "@/lib/validation/sales";
import type { ActionResult } from "./auth";

const DOC_PREFIX: Record<CreateSaleInput["docType"], string> = {
  sale: "SALE",
  sale_return: "RET",
  quotation: "QUOT",
  estimate: "EST",
  sale_order: "SO",
  challan: "CHAL",
};

/** Which doc types move physical stock, and in which direction, once completed. */
const STOCK_IMPACT: Partial<Record<CreateSaleInput["docType"], "in" | "out">> = {
  sale: "out",
  challan: "out",
  sale_return: "in",
};

async function requireBillingGate(permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, permission)) {
    return { ok: false as const, error: "You don't have permission to do that." };
  }
  return { ok: true as const, sessionUser, membership };
}

/**
 * Works out which loyalty tier a bill qualifies for, from the customer's
 * balance as it stands *before* this bill. The POS shows the same number, but
 * this is the one that counts — the client only ever says who the customer is.
 */
async function resolveTierForSale(
  db: Awaited<ReturnType<typeof getDb>>,
  businessId: string,
  customerId: string | undefined,
  enabled: boolean
) {
  if (!customerId || !enabled) return null;
  const [tierRows, customerRow] = await Promise.all([
    db.select().from(loyaltyTierTable).where(eq(loyaltyTierTable.businessId, businessId)),
    db
      .select({ points: customers.loyaltyPoints })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
      .limit(1),
  ]);
  if (!customerRow[0]) return null;
  return resolveTier(tierRows, Math.floor(parseFloat(customerRow[0].points)));
}

/** Creates a new sale/quotation/order, or overwrites a still-draft one (hold & resume). */
export async function saveSale(saleId: string | null, input: unknown): Promise<ActionResult & { saleId?: string; docNumber?: string }> {
  const gate = await requireBillingGate(PERMISSIONS.BILLING_MANAGE);
  if (!gate.ok) return gate;

  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;
  const status: "draft" | "completed" = parsed.data.isDraft ? "draft" : "completed";
  const docType = parsed.data.docType;

  const stockDirection = STOCK_IMPACT[docType];
  if (status === "completed" && stockDirection && !parsed.data.warehouseId) {
    return { ok: false, error: "Select a warehouse before completing this document." };
  }

  const [loyaltyRow] = await db.select().from(loyaltySettings).where(eq(loyaltySettings.businessId, businessId)).limit(1);
  const loyalty = toConfig(loyaltyRow);

  // The counter also fixes the branch, so counter-wise and branch-wise
  // reporting agree without the cashier picking twice.
  let counterId: string | null = null;
  let branchId: string | null = null;
  if (parsed.data.counterId) {
    const counterRows = await listCountersForBusiness(businessId);
    const counter = counterRows.find((c) => c.id === parsed.data.counterId);
    if (!counter) return { ok: false, error: "Counter not found." };
    counterId = counter.id;
    branchId = counter.branchId;
  }

  // A return can be raised against a specific bill, which is what lets the
  // points that bill awarded be taken back exactly rather than estimated.
  let original: typeof sales.$inferSelect | null = null;
  if (parsed.data.originalSaleId) {
    if (docType !== "sale_return") return { ok: false, error: "Only a sale return can be raised against another bill." };
    const [row] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, parsed.data.originalSaleId), eq(sales.businessId, businessId)))
      .limit(1);
    if (!row) return { ok: false, error: "The bill being returned against was not found." };
    if (row.docType !== "sale") return { ok: false, error: "Returns can only be raised against a sale." };
    if (row.status !== "completed") return { ok: false, error: "That bill is not completed, so nothing can be returned against it." };
    original = row;
  }

  /*
   * The tier discount is decided here, from data the server owns. On a sale it
   * comes from the customer's current standing; on a return it is copied from
   * the bill being reversed, so the refund matches what was actually charged.
   */
  let tierName: string | null = null;
  let tierDiscountPercent = 0;
  if (docType === "sale") {
    const tier = await resolveTierForSale(db, businessId, parsed.data.customerId, loyalty.enabled);
    if (tier && tier.discountPercent > 0) {
      tierName = tier.name;
      tierDiscountPercent = tier.discountPercent;
    }
  } else if (docType === "sale_return" && original) {
    tierDiscountPercent = parseFloat(original.tierDiscountPercent) || 0;
    tierName = original.loyaltyTierName;
  }

  /*
   * A coupon comes off what is left after line discounts and the loyalty tier,
   * so the two never stack past the value of the goods. It is priced from the
   * coupon's own record here — the client only said which code was typed.
   */
  // A manual bill-wide discount the cashier typed in — independent of the
  // loyalty tier, and not something the cashier is expected to keep re-typing
  // on a return, so it copies over the same way the tier discount does.
  let billDiscountPercent = Math.max(0, Math.min(100, parsed.data.billDiscountPercent ?? 0));
  if (docType === "sale_return" && original) {
    billDiscountPercent = parseFloat(original.billDiscountPercent) || 0;
  }

  let couponCode: string | null = null;
  let couponDiscountAmount = 0;
  if (parsed.data.couponCode) {
    if (status !== "completed" || docType !== "sale") {
      return { ok: false, error: "A coupon can only be applied to a completed sale." };
    }
    const preTier = computeSaleTotals(parsed.data.items, { tierDiscountPercent, billDiscountPercent });
    const discountable = round2(preTier.subtotal - preTier.discountAmount);
    const evaluation = await evaluateCoupon({
      businessId,
      code: parsed.data.couponCode,
      discountableAmount: discountable,
      customerId: parsed.data.customerId ?? null,
      ignoreSaleId: saleId,
    });
    if (!evaluation.ok) return { ok: false, error: evaluation.error };
    couponCode = evaluation.code;
    couponDiscountAmount = evaluation.discountAmount;
  }

  const totals = computeSaleTotals(parsed.data.items, { tierDiscountPercent, billDiscountPercent, couponDiscountAmount });
  const { subtotal, discountAmount, taxAmount, totalAmount } = totals;
  const lines = parsed.data.items.map((item, i) => ({
    productId: item.productId,
    itemCode: item.itemCode,
    name: item.name,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
    discountPercent: String(item.discountPercent ?? 0),
    billDiscountAmount: String(totals.lines[i].billDiscountAmount),
    taxRatePercent: String(item.taxRatePercent ?? 0),
    taxAmount: String(totals.lines[i].taxAmount),
    lineTotal: String(totals.lines[i].lineTotal),
  }));

  const amountPaid = round2((parsed.data.payments ?? []).reduce((sum, p) => sum + p.amount, 0));

  /*
   * Which products need a serial per unit is read from the master, not taken
   * from the client. A tracked product must account for every unit leaving
   * (or coming back on a return) before the bill is allowed to complete.
   */
  const productIds = [...new Set(parsed.data.items.map((i) => i.productId))];
  const trackedProducts = new Map(
    (
      await db
        .select({ id: products.id, name: products.name, trackSerial: products.trackSerial })
        .from(products)
        .where(and(eq(products.businessId, businessId), inArray(products.id, productIds)))
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
          error: `${product.name} tracks serial numbers — pick ${Math.round(item.quantity)} of them for this line.`,
        };
      }
      serialLines.push({ productId: item.productId, productName: product.name, quantity: item.quantity, serials });
    }
  }

  // Work out the loyalty side up front so an invalid redemption is rejected
  // before anything is written.
  const requestedPoints = Math.max(0, Math.trunc(parsed.data.redeemPoints ?? 0));
  let redeemPoints = 0;
  let redeemedValue = 0;
  let earnPoints = 0;

  if (status === "completed" && docType === "sale" && parsed.data.customerId && loyalty.enabled) {
    const [customer] = await db
      .select({ points: customers.loyaltyPoints })
      .from(customers)
      .where(and(eq(customers.id, parsed.data.customerId), eq(customers.businessId, businessId)))
      .limit(1);
    if (!customer) return { ok: false, error: "Customer not found." };

    if (requestedPoints > 0) {
      const available = Math.floor(parseFloat(customer.points));
      if (requestedPoints > available) {
        return { ok: false, error: `That customer only has ${available} points.` };
      }
      if (requestedPoints < loyalty.minPointsToRedeem) {
        return { ok: false, error: `At least ${loyalty.minPointsToRedeem} points are needed to redeem.` };
      }
      // Never let a redemption exceed the bill it is paying for.
      const cappedValue = Math.min(valueOfPoints(requestedPoints, loyalty), totalAmount);
      redeemedValue = round2(cappedValue);
      redeemPoints =
        loyalty.currencyPerPoint > 0 ? Math.min(requestedPoints, Math.ceil(redeemedValue / loyalty.currencyPerPoint)) : requestedPoints;
    }
    earnPoints = pointsForAmount(totalAmount, loyalty);
  } else if (requestedPoints > 0) {
    return { ok: false, error: "Points can only be redeemed on a completed sale for a selected customer." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      let targetId = saleId;

      const header = {
        docType,
        status,
        branchId,
        counterId,
        warehouseId: parsed.data.warehouseId ?? null,
        originalSaleId: original?.id ?? null,
        customerId: parsed.data.customerId ?? null,
        salespersonId: parsed.data.salespersonId ?? null,
        subtotal: String(subtotal),
        discountAmount: String(discountAmount),
        taxAmount: String(taxAmount),
        totalAmount: String(totalAmount),
        amountPaid: String(amountPaid),
        redeemedPoints: redeemPoints,
        redeemedValue: String(redeemedValue),
        loyaltyTierName: tierName,
        tierDiscountPercent: String(tierDiscountPercent),
        billDiscountPercent: String(billDiscountPercent),
        couponCode,
        couponDiscountAmount: String(totals.couponDiscountAmount),
        notes: parsed.data.notes || null,
      };

      if (targetId) {
        const [existing] = await tx.select().from(sales).where(and(eq(sales.id, targetId), eq(sales.businessId, businessId))).limit(1);
        if (!existing) throw new Error("Sale not found.");
        if (existing.status !== "draft") throw new Error("Only held (draft) bills can be edited.");

        await tx.delete(saleItems).where(eq(saleItems.saleId, targetId));
        await tx.delete(salePayments).where(eq(salePayments.saleId, targetId));
        await tx.update(sales).set({ ...header, updatedAt: new Date() }).where(eq(sales.id, targetId));
      } else {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(sales)
          .where(and(eq(sales.businessId, businessId), eq(sales.docType, docType)));
        // A shop migrating from another billing system sets a one-time offset
        // (Bill Settings) so numbering continues from their last invoice
        // instead of restarting at 1.
        const [business] = await tx.select({ docNumberOffsets: businesses.docNumberOffsets }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
        const offset = business?.docNumberOffsets?.[docType] ?? 0;
        const docNumber = `${DOC_PREFIX[docType]}-${String(count + 1 + offset).padStart(6, "0")}`;

        const [created] = await tx
          .insert(sales)
          .values({ businessId, docNumber, ...header, createdByUserId: gate.sessionUser.userId })
          .returning();
        targetId = created.id;
      }

      if (!targetId) throw new Error("Failed to save sale.");

      await tx.insert(saleItems).values(lines.map((line, i) => ({ ...line, saleId: targetId!, sortOrder: i })));

      if (parsed.data.payments?.length) {
        await tx.insert(salePayments).values(parsed.data.payments.map((p) => ({ saleId: targetId!, method: p.method, amount: String(p.amount) })));
      }

      // Post stock movements exactly once, the moment this doc first becomes
      // "completed" — drafts can only be re-edited while still draft, so this
      // branch can never run twice for the same sale.
      if (status === "completed" && stockDirection && parsed.data.warehouseId) {
        // Guard: refuse to sell more than what is currently in stock.
        if (stockDirection === "out") {
          const productQtyMap = new Map<string, number>();
          for (const line of lines) {
            if (!line.productId) continue;
            productQtyMap.set(line.productId, (productQtyMap.get(line.productId) ?? 0) + parseFloat(line.quantity));
          }
          if (productQtyMap.size > 0) {
            const balanceRows = await tx
              .select({
                productId: stockMovements.productId,
                balance: sql<string>`sum(${stockMovements.quantity}::numeric)`,
              })
              .from(stockMovements)
              .where(
                and(
                  eq(stockMovements.businessId, businessId),
                  eq(stockMovements.warehouseId, parsed.data.warehouseId),
                  inArray(stockMovements.productId, [...productQtyMap.keys()])
                )
              )
              .groupBy(stockMovements.productId);
            const balanceMap = new Map(balanceRows.map((r) => [r.productId, parseFloat(r.balance ?? "0")]));
            for (const [pid, qty] of productQtyMap) {
              const onHand = balanceMap.get(pid) ?? 0;
              if (onHand < qty) {
                const product = trackedProducts.get(pid);
                throw new Error(`Insufficient stock for "${product?.name ?? pid}": ${onHand} available, ${qty} requested.`);
              }
            }
          }
        }

        const sign = stockDirection === "in" ? 1 : -1;
        const movementType: "sale_return_in" | "sale_out" = stockDirection === "in" ? "sale_return_in" : "sale_out";
        await tx.insert(stockMovements).values(
          lines
            .filter((line) => line.productId)
            .map((line) => ({
              businessId,
              warehouseId: parsed.data.warehouseId!,
              productId: line.productId,
              type: movementType,
              quantity: String(sign * parseFloat(line.quantity)),
              referenceType: "sale" as const,
              referenceId: targetId!,
              createdByUserId: gate.sessionUser.userId,
            }))
        );
      }

      // Same once-only guarantee as the stock posting above: books are written
      // when the document first becomes final, inside this transaction so a
      // failed posting rolls the whole sale back rather than leaving it unbooked.
      const [row] = await tx.select().from(sales).where(eq(sales.id, targetId)).limit(1);

      // A serial-tracked unit leaves on a sale and comes back on a return.
      // Selling one that isn't in stock throws, taking the bill with it.
      if (status === "completed" && stockDirection && parsed.data.warehouseId && serialLines.length > 0) {
        await recordSerialMovements(tx, {
          businessId,
          warehouseId: parsed.data.warehouseId,
          direction: stockDirection,
          referenceType: "sale",
          referenceId: targetId,
          referenceLabel: row.docNumber,
          userId: gate.sessionUser.userId,
          lines: serialLines,
        });
      }

      if (status === "completed" && (docType === "sale" || docType === "sale_return")) {
        await postSaleJournal(tx, {
          businessId,
          userId: gate.sessionUser.userId,
          saleId: targetId,
          docType,
          docNumber: row.docNumber,
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          customerId: parsed.data.customerId ?? null,
          redeemedValue,
          payments: parsed.data.payments ?? [],
        });
      }

      // Points move in the same transaction as the bill they belong to.
      if (status === "completed" && docType === "sale" && parsed.data.customerId && loyalty.enabled) {
        if (redeemPoints > 0) {
          await recordLoyaltyPoints(tx, {
            businessId,
            customerId: parsed.data.customerId,
            saleId: targetId,
            type: "redeem",
            points: -redeemPoints,
            note: `Redeemed on ${row.docNumber}`,
            userId: gate.sessionUser.userId,
          });
        }
        if (earnPoints > 0) {
          await recordLoyaltyPoints(tx, {
            businessId,
            customerId: parsed.data.customerId,
            saleId: targetId,
            type: "earn",
            points: earnPoints,
            note: `Earned on ${row.docNumber}`,
            userId: gate.sessionUser.userId,
            expiryDays: loyalty.expiryDays,
          });
        }
      }

      // One row per use, so the coupon's limits are counted from the ledger
      // and a later cancellation releases the code again.
      if (status === "completed" && couponCode && totals.couponDiscountAmount > 0) {
        const [coupon] = await tx
          .select({ id: couponsTable.id })
          .from(couponsTable)
          .where(and(eq(couponsTable.businessId, businessId), eq(couponsTable.code, couponCode)))
          .limit(1);
        if (coupon) {
          await tx.delete(couponRedemptions).where(eq(couponRedemptions.saleId, targetId));
          await tx.insert(couponRedemptions).values({
            businessId,
            couponId: coupon.id,
            saleId: targetId,
            customerId: parsed.data.customerId ?? null,
            discountAmount: String(totals.couponDiscountAmount),
          });
        }
      }

      // A referred customer's first completed bill pays both sides.
      if (status === "completed" && docType === "sale" && parsed.data.customerId && loyalty.referralEnabled) {
        await settleReferralOnFirstSale(tx, {
          businessId,
          customerId: parsed.data.customerId,
          saleId: targetId,
          docNumber: row.docNumber,
          referrerRewardPoints: loyalty.referrerRewardPoints,
          referredRewardPoints: loyalty.referredRewardPoints,
          expiryDays: loyalty.expiryDays,
          userId: gate.sessionUser.userId,
        });
      }

      // A return hands goods back, so the points that bill earned have to go
      // back too — otherwise a customer can buy, earn, return, and keep both.
      if (status === "completed" && docType === "sale_return" && parsed.data.customerId && loyalty.enabled) {
        await reverseEarnedPoints(tx, {
          businessId,
          customerId: parsed.data.customerId,
          returnSaleId: targetId,
          returnDocNumber: row.docNumber,
          returnTotal: totalAmount,
          original,
          loyalty,
          userId: gate.sessionUser.userId,
        });
      }

      return row;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: saleId ? "sale.updated" : "sale.created",
      entityType: "sale",
      entityId: result.id,
      after: { docNumber: result.docNumber, status: result.status, totalAmount: result.totalAmount },
    });

    return { ok: true, saleId: result.id, docNumber: result.docNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the sale." };
  }
}

/**
 * Claws back the loyalty points a returned bill awarded.
 *
 * Against a known bill the reversal is pro-rata: return half the value, lose
 * half the points, capped so repeated partial returns can never take back more
 * than that bill ever gave. Without a linked bill the earn rate is the only
 * information available, so the same rate is applied to the refunded value and
 * capped at the customer's balance.
 *
 * Points the customer *spent* on the original bill are deliberately left
 * alone: the refund already returns that value as money, so giving the points
 * back as well would pay for the same goods twice.
 */
async function reverseEarnedPoints(
  tx: PostingTx,
  params: {
    businessId: string;
    customerId: string;
    returnSaleId: string;
    returnDocNumber: string;
    returnTotal: number;
    original: typeof sales.$inferSelect | null;
    loyalty: ReturnType<typeof toConfig>;
    userId: string;
  }
) {
  const [balanceRow] = await tx
    .select({ points: customers.loyaltyPoints })
    .from(customers)
    .where(and(eq(customers.id, params.customerId), eq(customers.businessId, params.businessId)))
    .limit(1);
  const balance = balanceRow ? Math.floor(parseFloat(balanceRow.points)) : 0;
  if (balance <= 0) return;

  let toReverse: number;
  let note: string;

  if (params.original) {
    const originalTotal = parseFloat(params.original.totalAmount) || 0;
    if (originalTotal <= 0) return;

    const earnedRows = await tx
      .select({ points: loyaltyTransactions.points })
      .from(loyaltyTransactions)
      .where(and(eq(loyaltyTransactions.saleId, params.original.id), eq(loyaltyTransactions.type, "earn")));
    const earned = earnedRows.reduce((s, r) => s + r.points, 0);
    if (earned <= 0) return;

    const reversedRows = await tx
      .select({ points: loyaltyTransactions.points })
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.reversesSaleId, params.original.id));
    const alreadyReversed = reversedRows.reduce((s, r) => s + Math.max(0, -r.points), 0);

    const share = Math.min(1, params.returnTotal / originalTotal);
    toReverse = Math.min(Math.round(earned * share), earned - alreadyReversed);
    note = `Reversed on ${params.returnDocNumber} (return against ${params.original.docNumber})`;
  } else {
    toReverse = pointsForAmount(params.returnTotal, params.loyalty);
    note = `Reversed on ${params.returnDocNumber}`;
  }

  toReverse = Math.min(toReverse, balance);
  if (toReverse <= 0) return;

  await recordLoyaltyPoints(tx, {
    businessId: params.businessId,
    customerId: params.customerId,
    saleId: params.returnSaleId,
    reversesSaleId: params.original?.id ?? null,
    type: "adjust",
    points: -toReverse,
    note,
    userId: params.userId,
  });
}

/**
 * Voids a completed document: stock, books and points all go back where they
 * were, by *appending* the opposite events rather than deleting the originals,
 * so the ledgers still explain how things got to where they are.
 */
export async function cancelSale(saleId: string, reason: string): Promise<ActionResult> {
  const gate = await requireBillingGate(PERMISSIONS.BILLING_MANAGE);
  if (!gate.ok) return gate;

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) return { ok: false, error: "Give a reason for cancelling (at least 3 characters)." };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  try {
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.businessId, businessId))).limit(1);
      if (!sale) throw new Error("Sale not found.");
      if (sale.status === "cancelled") throw new Error("That document is already cancelled.");
      if (sale.status !== "completed") throw new Error("Only completed documents can be cancelled — discard a held bill instead.");

      // Refuse to strand a return that was raised against this bill.
      const dependants = await tx
        .select({ docNumber: sales.docNumber })
        .from(sales)
        .where(and(eq(sales.originalSaleId, saleId), eq(sales.status, "completed")));
      if (dependants.length > 0) {
        throw new Error(`Cancel the return ${dependants[0].docNumber} raised against this bill first.`);
      }

      // Stock: append the opposite movements of whatever this document posted.
      const movements = await tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.referenceType, "sale"), eq(stockMovements.referenceId, saleId)));
      if (movements.length > 0) {
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
            referenceType: "sale" as const,
            referenceId: saleId,
            notes: `Cancelled ${sale.docNumber}`,
            createdByUserId: gate.sessionUser.userId,
          }))
        );
      }

      await reverseSerialMovements(tx, {
        businessId,
        referenceType: "sale",
        referenceId: saleId,
        note: `Cancelled ${sale.docNumber}`,
        userId: gate.sessionUser.userId,
      });

      // Books: mirror the entry this document posted.
      await reverseJournalFor(tx, {
        businessId,
        userId: gate.sessionUser.userId,
        referenceType: "sale",
        referenceId: saleId,
        narration: `Cancellation of ${sale.docNumber}`,
      });

      // Points: undo the net effect this document had on the customer.
      if (sale.customerId) {
        const pointRows = await tx
          .select({ points: loyaltyTransactions.points })
          .from(loyaltyTransactions)
          .where(eq(loyaltyTransactions.saleId, saleId));
        const net = pointRows.reduce((s, r) => s + r.points, 0);
        if (net !== 0) {
          await recordLoyaltyPoints(tx, {
            businessId,
            customerId: sale.customerId,
            saleId,
            reversesSaleId: saleId,
            type: "adjust",
            points: -net,
            note: `Cancelled ${sale.docNumber}`,
            userId: gate.sessionUser.userId,
          });
        }
      }

      await tx
        .update(sales)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledByUserId: gate.sessionUser.userId,
          cancelReason: trimmedReason,
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId));

      return sale;
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "sale.cancelled",
      entityType: "sale",
      entityId: saleId,
      before: { status: result.status, totalAmount: result.totalAmount },
      after: { status: "cancelled", reason: trimmedReason },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not cancel the document." };
  }
}

export async function discardHeldSale(saleId: string): Promise<ActionResult> {
  const gate = await requireBillingGate(PERMISSIONS.BILLING_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  const [existing] = await db.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.businessId, gate.membership.businessId))).limit(1);
  if (!existing) return { ok: false, error: "Sale not found." };
  if (existing.status !== "draft") return { ok: false, error: "Only held (draft) bills can be discarded." };
  await db.delete(sales).where(eq(sales.id, saleId));
  return { ok: true };
}

/** Everything the POS screen needs to render: catalog, parties, and any held bills. */
export async function getBillingPageData() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [productRows, customerRows, salespersonRows, taxRateRows, heldSales, warehouseRows, counterRows, loyaltyRow, tierRows, recent] =
    await Promise.all([
      db.select().from(products).where(and(eq(products.businessId, businessId), eq(products.isActive, true))),
      db.select().from(customers).where(eq(customers.businessId, businessId)),
      db.select().from(salespersons).where(eq(salespersons.businessId, businessId)),
      db.select().from(taxRates).where(eq(taxRates.businessId, businessId)),
      db.select().from(sales).where(and(eq(sales.businessId, businessId), eq(sales.status, "draft"))).orderBy(desc(sales.updatedAt)),
      listWarehousesForBusiness(businessId),
      listCountersForBusiness(businessId),
      db.select().from(loyaltySettings).where(eq(loyaltySettings.businessId, businessId)).limit(1),
      db.select().from(loyaltyTierTable).where(eq(loyaltyTierTable.businessId, businessId)).orderBy(loyaltyTierTable.minPoints),
      listRecentSalesFor(businessId, 40),
    ]);

  // Only the serial-tracked products need their in-stock units listed, so the
  // POS can offer the cashier a pick list instead of asking them to type.
  const [serialsByProduct, stockRows] = await Promise.all([
    listSerialsInStock(
      businessId,
      productRows.filter((p) => p.trackSerial).map((p) => p.id)
    ),
    db
      .select({
        warehouseId: stockMovements.warehouseId,
        productId: stockMovements.productId,
        total: sql<string>`sum(${stockMovements.quantity})`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.businessId, businessId))
      .groupBy(stockMovements.warehouseId, stockMovements.productId),
  ]);

  // Keyed by warehouse first: stock is a per-branch fact, and the POS only
  // ever sells out of the warehouse the cashier has picked at the top.
  const stockByProduct: Record<string, Record<string, number>> = {};
  for (const row of stockRows) {
    (stockByProduct[row.warehouseId] ??= {})[row.productId] = parseFloat(row.total ?? "0");
  }

  return {
    products: productRows,
    customers: customerRows,
    salespersons: salespersonRows,
    taxRates: taxRateRows,
    heldSales,
    warehouses: warehouseRows,
    counters: counterRows,
    loyalty: toConfig(loyaltyRow[0]),
    tiers: tierRows,
    recentSales: recent,
    serialsByProduct,
    stockByProduct,
    canManage: can(membership.role, PERMISSIONS.BILLING_MANAGE),
  };
}

export async function getSaleWithItems(saleId: string) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const [sale] = await db.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.businessId, membership.businessId))).limit(1);
  if (!sale) return null;
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
  return { sale, items };
}

/** Recent finalised documents, cancelled ones included so a void stays visible. */
async function listRecentSalesFor(businessId: string, limit: number) {
  const db = await getDb();
  const rows = await db
    .select({
      id: sales.id,
      docNumber: sales.docNumber,
      docType: sales.docType,
      status: sales.status,
      totalAmount: sales.totalAmount,
      amountPaid: sales.amountPaid,
      customerId: sales.customerId,
      customerName: customers.name,
      counterId: sales.counterId,
      createdAt: sales.createdAt,
      cancelReason: sales.cancelReason,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.businessId, businessId), inArray(sales.status, ["completed", "cancelled"])))
    .orderBy(desc(sales.createdAt))
    .limit(limit);
  return rows;
}

export async function listRecentSales(limit = 50) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_VIEW)) throw new Error("FORBIDDEN");
  return listRecentSalesFor(membership.businessId, limit);
}

/** The completed sales a return can be raised against, newest first. */
export async function listReturnableSales(limit = 100) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  return db
    .select({
      id: sales.id,
      docNumber: sales.docNumber,
      totalAmount: sales.totalAmount,
      customerId: sales.customerId,
      tierDiscountPercent: sales.tierDiscountPercent,
      billDiscountPercent: sales.billDiscountPercent,
      createdAt: sales.createdAt,
    })
    .from(sales)
    .where(and(eq(sales.businessId, membership.businessId), eq(sales.docType, "sale"), eq(sales.status, "completed")))
    .orderBy(desc(sales.createdAt))
    .limit(limit);
}

/**
 * Everything an invoice needs to print itself: the bill, its lines with their
 * HSN codes, and the names behind the ids. A separate query from
 * `getSaleWithItems` because printing needs joins the POS does not.
 */
export async function getInvoiceData(saleId: string) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [row] = await db
    .select({
      docNumber: sales.docNumber,
      docType: sales.docType,
      status: sales.status,
      createdAt: sales.createdAt,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      taxAmount: sales.taxAmount,
      roundOff: sales.roundOff,
      totalAmount: sales.totalAmount,
      amountPaid: sales.amountPaid,
      redeemedPoints: sales.redeemedPoints,
      redeemedValue: sales.redeemedValue,
      loyaltyTierName: sales.loyaltyTierName,
      couponCode: sales.couponCode,
      counterId: sales.counterId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerGstin: customers.gstin,
      salespersonName: salespersons.name,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .leftJoin(salespersons, eq(sales.salespersonId, salespersons.id))
    .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)))
    .limit(1);
  if (!row) return null;

  const itemRows = await db
    .select({
      id: saleItems.id,
      itemCode: saleItems.itemCode,
      name: saleItems.name,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      discountPercent: saleItems.discountPercent,
      billDiscountAmount: saleItems.billDiscountAmount,
      taxRatePercent: saleItems.taxRatePercent,
      taxAmount: saleItems.taxAmount,
      lineTotal: saleItems.lineTotal,
      hsn: hsnCodes.code,
    })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .leftJoin(hsnCodes, eq(products.hsnId, hsnCodes.id))
    .where(eq(saleItems.saleId, saleId))
    .orderBy(saleItems.sortOrder);

  const counterRows = row.counterId ? await listCountersForBusiness(businessId) : [];
  const counterName = row.counterId ? counterRows.find((c) => c.id === row.counterId)?.label ?? null : null;

  return { sale: { ...row, counterName }, lines: itemRows };
}
