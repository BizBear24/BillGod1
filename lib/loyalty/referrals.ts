import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import type { PostingTx } from "@/lib/accounting/posting";
import { customers, referrals } from "@/db/schema";
import { recordLoyaltyPoints } from "@/lib/loyalty/points";

/**
 * Refer-a-friend.
 *
 * A customer hands out their code; the friend gets it entered against their
 * record when they are created. Both are paid in loyalty points — the existing
 * ledger — when the referred customer's *first* bill completes, so a referral
 * cannot be farmed by shopping repeatedly.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0 or I/1 to read aloud

function randomCode(seed: string): string {
  const clean = seed.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${clean}${suffix}`;
}

/**
 * Returns this customer's referral code, minting one on first ask.
 * Codes are only generated when someone actually needs to share one, so
 * customers created before referrals existed get one the moment it matters.
 */
export async function ensureReferralCode(
  client: Awaited<ReturnType<typeof import("@/db/client").getDb>>,
  businessId: string,
  customerId: string
): Promise<string | null> {
  const [customer] = await client
    .select({ id: customers.id, name: customers.name, referralCode: customers.referralCode })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
    .limit(1);
  if (!customer) return null;
  if (customer.referralCode) return customer.referralCode;

  // The unique index is the real arbiter; a few attempts is plenty for a
  // 32^4 suffix, and failing loudly beats handing out a duplicate.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(customer.name);
    try {
      await client.update(customers).set({ referralCode: code, updatedAt: new Date() }).where(eq(customers.id, customerId));
      return code;
    } catch {
      // Collision — try another.
    }
  }
  throw new Error("Could not generate a referral code. Try again.");
}

/** Finds whose code this is. Returns null when the code belongs to nobody. */
export async function findReferrer(
  db: Awaited<ReturnType<typeof import("@/db/client").getDb>>,
  businessId: string,
  code: string
): Promise<{ id: string; name: string } | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const [row] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.referralCode, clean)))
    .limit(1);
  return row ?? null;
}

/**
 * Pays out a pending referral when the referred customer's first bill lands.
 *
 * Called inside the sale's own transaction, so the reward and the bill that
 * earned it commit together. Safe to call on every sale: only a referral that
 * has not been rewarded yet is picked up, and marking it rewarded is what
 * stops it firing a second time.
 */
export async function settleReferralOnFirstSale(
  tx: PostingTx,
  params: {
    businessId: string;
    customerId: string;
    saleId: string;
    docNumber: string;
    referrerRewardPoints: number;
    referredRewardPoints: number;
    expiryDays: number;
    userId: string;
  }
) {
  if (params.referrerRewardPoints <= 0 && params.referredRewardPoints <= 0) return;

  const [pending] = await tx
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.businessId, params.businessId),
        eq(referrals.referredCustomerId, params.customerId),
        isNull(referrals.rewardedAt)
      )
    )
    .limit(1);
  if (!pending) return;

  // Claim it first: the update is what makes this once-only, and doing it
  // before the point rows means a retry cannot double-pay.
  const claimed = await tx
    .update(referrals)
    .set({
      rewardedSaleId: params.saleId,
      rewardedAt: new Date(),
      referrerPoints: params.referrerRewardPoints,
      referredPoints: params.referredRewardPoints,
    })
    .where(and(eq(referrals.id, pending.id), isNull(referrals.rewardedAt)))
    .returning({ id: referrals.id });
  if (claimed.length === 0) return;

  if (params.referrerRewardPoints > 0) {
    await recordLoyaltyPoints(tx, {
      businessId: params.businessId,
      customerId: pending.referrerCustomerId,
      saleId: params.saleId,
      type: "adjust",
      points: params.referrerRewardPoints,
      note: `Referral reward — friend's first bill ${params.docNumber}`,
      userId: params.userId,
      expiryDays: params.expiryDays,
    });
  }
  if (params.referredRewardPoints > 0) {
    await recordLoyaltyPoints(tx, {
      businessId: params.businessId,
      customerId: params.customerId,
      saleId: params.saleId,
      type: "adjust",
      points: params.referredRewardPoints,
      note: `Welcome bonus — referred with code ${pending.code}`,
      userId: params.userId,
      expiryDays: params.expiryDays,
    });
  }
}

/** Who each customer brought in, and whether the reward has been paid. */
export async function listReferrals(businessId: string) {
  const { getDb } = await import("@/db/client");
  const db = await getDb();

  const rows = await db
    .select({
      id: referrals.id,
      code: referrals.code,
      referrerCustomerId: referrals.referrerCustomerId,
      referredCustomerId: referrals.referredCustomerId,
      rewardedAt: referrals.rewardedAt,
      referrerPoints: referrals.referrerPoints,
      referredPoints: referrals.referredPoints,
      createdAt: referrals.createdAt,
    })
    .from(referrals)
    .where(eq(referrals.businessId, businessId))
    .orderBy(referrals.createdAt);

  const names = new Map(
    (await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.businessId, businessId))).map((c) => [
      c.id,
      c.name,
    ])
  );

  return rows.map((r) => ({
    ...r,
    referrerName: names.get(r.referrerCustomerId) ?? "—",
    referredName: names.get(r.referredCustomerId) ?? "—",
  }));
}
