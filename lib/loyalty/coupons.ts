import "server-only";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { coupons, couponRedemptions, sales } from "@/db/schema";
import { round2 } from "@/lib/sales/totals";
import { formatDate } from "@/lib/utils";

/**
 * Coupon validation and pricing.
 *
 * Every rule is checked here, server-side, against the bill's real value. The
 * POS only sends the code that was typed; it never says what the coupon is
 * worth, so a tampered client cannot invent a discount.
 *
 * Usage limits are counted from the redemption ledger, joined to the bills so
 * a cancelled sale stops consuming the coupon — there is no usage counter that
 * could drift away from the truth.
 */

export type CouponEvaluation =
  | { ok: true; couponId: string; code: string; discountAmount: number; description: string }
  | { ok: false; error: string };

const money = (n: number) => `₹${n.toFixed(2)}`;

export async function evaluateCoupon(params: {
  businessId: string;
  code: string;
  /** The bill's value after line discounts and any loyalty tier, before tax. */
  discountableAmount: number;
  customerId: string | null;
  /** Excluded from the usage count when re-pricing a bill that already used this coupon. */
  ignoreSaleId?: string | null;
  now?: Date;
}): Promise<CouponEvaluation> {
  const code = params.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const db = await getDb();
  const [coupon] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.businessId, params.businessId), eq(coupons.code, code)))
    .limit(1);

  if (!coupon) return { ok: false, error: `No coupon called ${code}.` };
  if (!coupon.isActive) return { ok: false, error: `${code} has been switched off.` };

  const now = params.now ?? new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, error: `${code} is not valid until ${formatDate(coupon.startsAt)}.` };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { ok: false, error: `${code} expired on ${formatDate(coupon.endsAt)}.` };
  }

  const minBill = parseFloat(coupon.minBillAmount) || 0;
  if (params.discountableAmount < minBill) {
    return { ok: false, error: `${code} needs a bill of at least ${money(minBill)}.` };
  }

  // Cancelled bills release the coupon again, so the count joins to the sale.
  if (coupon.maxRedemptions > 0 || coupon.perCustomerLimit > 0) {
    const used = await db
      .select({ saleId: couponRedemptions.saleId, customerId: couponRedemptions.customerId })
      .from(couponRedemptions)
      .innerJoin(sales, eq(couponRedemptions.saleId, sales.id))
      .where(
        and(
          eq(couponRedemptions.businessId, params.businessId),
          eq(couponRedemptions.couponId, coupon.id),
          eq(sales.status, "completed")
        )
      );

    const live = used.filter((u) => u.saleId !== params.ignoreSaleId);

    if (coupon.maxRedemptions > 0 && live.length >= coupon.maxRedemptions) {
      return { ok: false, error: `${code} has been used the maximum ${coupon.maxRedemptions} time(s).` };
    }
    if (coupon.perCustomerLimit > 0) {
      if (!params.customerId) {
        return { ok: false, error: `${code} is limited per customer, so pick the customer on this bill first.` };
      }
      const byCustomer = live.filter((u) => u.customerId === params.customerId).length;
      if (byCustomer >= coupon.perCustomerLimit) {
        return { ok: false, error: `This customer has already used ${code} ${coupon.perCustomerLimit} time(s).` };
      }
    }
  }

  const value = parseFloat(coupon.value) || 0;
  let discountAmount =
    coupon.type === "percent" ? round2((params.discountableAmount * value) / 100) : round2(Math.min(value, params.discountableAmount));

  const cap = coupon.maxDiscountAmount === null ? null : parseFloat(coupon.maxDiscountAmount);
  if (cap !== null && Number.isFinite(cap) && cap > 0) discountAmount = Math.min(discountAmount, round2(cap));
  discountAmount = round2(Math.max(0, Math.min(discountAmount, params.discountableAmount)));

  if (discountAmount <= 0) return { ok: false, error: `${code} is worth nothing on this bill.` };

  return {
    ok: true,
    couponId: coupon.id,
    code,
    discountAmount,
    description: coupon.type === "percent" ? `${value}% off` : `${money(value)} off`,
  };
}

/** How many times each coupon has actually been used on a bill that still stands. */
export async function countRedemptions(businessId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ couponId: couponRedemptions.couponId, used: sql<number>`count(*)::int` })
    .from(couponRedemptions)
    .innerJoin(sales, eq(couponRedemptions.saleId, sales.id))
    .where(and(eq(couponRedemptions.businessId, businessId), eq(sales.status, "completed")))
    .groupBy(couponRedemptions.couponId);
  return Object.fromEntries(rows.map((r) => [r.couponId, r.used]));
}
