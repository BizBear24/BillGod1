import "server-only";
import { eq, and, sql } from "drizzle-orm";
import type { PostingTx } from "@/lib/accounting/posting";
import { loyaltySettings, loyaltyTransactions, customers } from "@/db/schema";

export type LoyaltyConfig = {
  enabled: boolean;
  pointsPerCurrency: number;
  currencyPerPoint: number;
  minPointsToRedeem: number;
  expiryDays: number;
  referralEnabled: boolean;
  referrerRewardPoints: number;
  referredRewardPoints: number;
};

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: true,
  pointsPerCurrency: 1,
  currencyPerPoint: 0.25,
  minPointsToRedeem: 100,
  expiryDays: 0,
  referralEnabled: false,
  referrerRewardPoints: 0,
  referredRewardPoints: 0,
};

export function toConfig(row: typeof loyaltySettings.$inferSelect | undefined): LoyaltyConfig {
  if (!row) return DEFAULT_LOYALTY;
  return {
    enabled: row.enabled,
    pointsPerCurrency: parseFloat(row.pointsPerCurrency),
    currencyPerPoint: parseFloat(row.currencyPerPoint),
    minPointsToRedeem: row.minPointsToRedeem,
    expiryDays: row.expiryDays,
    referralEnabled: row.referralEnabled,
    referrerRewardPoints: row.referrerRewardPoints,
    referredRewardPoints: row.referredRewardPoints,
  };
}

/** Points are whole numbers — round down so a shop never gives away a fraction it didn't earn. */
export function pointsForAmount(amount: number, config: LoyaltyConfig): number {
  if (!config.enabled || config.pointsPerCurrency <= 0) return 0;
  return Math.max(0, Math.floor(amount * config.pointsPerCurrency));
}

export function valueOfPoints(points: number, config: LoyaltyConfig): number {
  return Math.round(points * config.currencyPerPoint * 100) / 100;
}

/**
 * Appends to the points ledger and keeps the cached balance on the customer in
 * step, inside the caller's transaction so the two can't drift apart.
 */
export async function recordLoyaltyPoints(
  tx: PostingTx,
  params: {
    businessId: string;
    customerId: string;
    saleId?: string | null;
    reversesSaleId?: string | null;
    type: "earn" | "redeem" | "expire" | "adjust";
    points: number;
    note?: string | null;
    userId?: string | null;
    expiryDays?: number;
  }
) {
  if (params.points === 0) return;

  const expiresAt =
    params.type === "earn" && params.expiryDays && params.expiryDays > 0
      ? new Date(Date.now() + params.expiryDays * 86400000)
      : null;

  await tx.insert(loyaltyTransactions).values({
    businessId: params.businessId,
    customerId: params.customerId,
    saleId: params.saleId ?? null,
    reversesSaleId: params.reversesSaleId ?? null,
    type: params.type,
    points: params.points,
    note: params.note ?? null,
    expiresAt,
    createdByUserId: params.userId ?? null,
  });

  await tx
    .update(customers)
    .set({ loyaltyPoints: sql`${customers.loyaltyPoints} + ${params.points}`, updatedAt: new Date() })
    .where(and(eq(customers.id, params.customerId), eq(customers.businessId, params.businessId)));
}
