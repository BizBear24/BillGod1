"use server";

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  loyaltySettings,
  loyaltyTierTable,
  loyaltyTransactions,
  customers,
  businesses,
  messageTemplates,
  messageLog,
  sales,
  coupons,
  couponRedemptions,
  referrals,
} from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { getEmailService } from "@/lib/email";
import { getSmsService } from "@/lib/sms";
import { recordLoyaltyPoints, toConfig } from "@/lib/loyalty/points";
import { evaluateCoupon, countRedemptions } from "@/lib/loyalty/coupons";
import { ensureReferralCode, findReferrer, listReferrals } from "@/lib/loyalty/referrals";
import {
  loyaltySettingsSchema,
  loyaltyTierSchema,
  loyaltyAdjustmentSchema,
  couponSchema,
  messageTemplateSchema,
  sendMessageSchema,
  renderTemplate,
} from "@/lib/validation/engagement";
import type { ActionResult } from "./auth";

async function requireGate(permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, permission)) {
    return { ok: false as const, error: "You don't have permission to do that." };
  }
  return { ok: true as const, sessionUser, membership };
}

export async function getEngagementPageData() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  const db = await getDb();
  const businessId = membership.businessId;

  const [settingsRow, tiers, customerRows, templates, log, recentPoints, businessRow] = await Promise.all([
    db.select().from(loyaltySettings).where(eq(loyaltySettings.businessId, businessId)).limit(1),
    db.select().from(loyaltyTierTable).where(eq(loyaltyTierTable.businessId, businessId)).orderBy(loyaltyTierTable.minPoints),
    db.select().from(customers).where(eq(customers.businessId, businessId)),
    db.select().from(messageTemplates).where(eq(messageTemplates.businessId, businessId)),
    db.select().from(messageLog).where(eq(messageLog.businessId, businessId)).orderBy(desc(messageLog.createdAt)).limit(50),
    db
      .select({
        id: loyaltyTransactions.id,
        customerId: loyaltyTransactions.customerId,
        type: loyaltyTransactions.type,
        points: loyaltyTransactions.points,
        note: loyaltyTransactions.note,
        createdAt: loyaltyTransactions.createdAt,
      })
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.businessId, businessId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(50),
    db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
  ]);

  return {
    settings: toConfig(settingsRow[0]),
    tiers,
    customers: customerRows,
    templates,
    messageLog: log,
    pointsHistory: recentPoints,
    businessName: businessRow[0]?.name ?? "",
    canManageLoyalty: can(membership.role, PERMISSIONS.LOYALTY_MANAGE),
    canSend: can(membership.role, PERMISSIONS.COMMUNICATIONS_SEND),
  };
}

export async function saveLoyaltySettings(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const parsed = loyaltySettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const values = {
    businessId: gate.membership.businessId,
    enabled: parsed.data.enabled ?? true,
    pointsPerCurrency: String(parsed.data.pointsPerCurrency),
    currencyPerPoint: String(parsed.data.currencyPerPoint),
    minPointsToRedeem: parsed.data.minPointsToRedeem,
    expiryDays: parsed.data.expiryDays,
    referralEnabled: parsed.data.referralEnabled ?? false,
    referrerRewardPoints: parsed.data.referrerRewardPoints,
    referredRewardPoints: parsed.data.referredRewardPoints,
    updatedAt: new Date(),
  };

  await db
    .insert(loyaltySettings)
    .values(values)
    .onConflictDoUpdate({ target: loyaltySettings.businessId, set: values });

  await logAudit({
    businessId: gate.membership.businessId,
    userId: gate.sessionUser.userId,
    action: "loyalty.settings_updated",
    entityType: "loyalty_settings",
    after: parsed.data,
  });
  return { ok: true };
}

export async function createLoyaltyTier(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const parsed = loyaltyTierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  try {
    await db.insert(loyaltyTierTable).values({
      businessId: gate.membership.businessId,
      name: parsed.data.name,
      minPoints: parsed.data.minPoints,
      discountPercent: String(parsed.data.discountPercent),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) return { ok: false, error: "A tier with this name already exists." };
    throw err;
  }
}

export async function updateLoyaltyTier(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const parsed = loyaltyTierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  await db
    .update(loyaltyTierTable)
    .set({ name: parsed.data.name, minPoints: parsed.data.minPoints, discountPercent: String(parsed.data.discountPercent) })
    .where(and(eq(loyaltyTierTable.id, id), eq(loyaltyTierTable.businessId, gate.membership.businessId)));
  return { ok: true };
}

export async function deleteLoyaltyTier(id: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(loyaltyTierTable).where(and(eq(loyaltyTierTable.id, id), eq(loyaltyTierTable.businessId, gate.membership.businessId)));
  return { ok: true };
}

/** Manual correction — a goodwill gesture, or clawing back points from a cancelled bill. */
export async function adjustLoyaltyPoints(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const parsed = loyaltyAdjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  const [customer] = await db
    .select({ points: customers.loyaltyPoints })
    .from(customers)
    .where(and(eq(customers.id, parsed.data.customerId), eq(customers.businessId, businessId)))
    .limit(1);
  if (!customer) return { ok: false, error: "Customer not found." };

  const balance = Math.floor(parseFloat(customer.points));
  if (parsed.data.points < 0 && balance + parsed.data.points < 0) {
    return { ok: false, error: `That would take the balance below zero — the customer has ${balance} points.` };
  }

  await db.transaction(async (tx) =>
    recordLoyaltyPoints(tx, {
      businessId,
      customerId: parsed.data.customerId,
      type: "adjust",
      points: parsed.data.points,
      note: parsed.data.note ?? "Manual adjustment",
      userId: gate.sessionUser.userId,
    })
  );

  await logAudit({
    businessId,
    userId: gate.sessionUser.userId,
    action: "loyalty.adjusted",
    entityType: "customer",
    entityId: parsed.data.customerId,
    after: { points: parsed.data.points, note: parsed.data.note },
  });
  return { ok: true };
}

/** Expires points whose window has passed — safe to run repeatedly. */
export async function expireLoyaltyPoints(): Promise<ActionResult & { expired?: number }> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  const businessId = gate.membership.businessId;
  const now = new Date();

  const earned = await db
    .select()
    .from(loyaltyTransactions)
    .where(and(eq(loyaltyTransactions.businessId, businessId), eq(loyaltyTransactions.type, "earn")));

  const due = earned.filter((row) => row.expiresAt && row.expiresAt <= now);
  if (due.length === 0) return { ok: true, expired: 0 };

  // Only expire batches that haven't already been expired.
  const expiredNotes = new Set(
    (
      await db
        .select({ note: loyaltyTransactions.note })
        .from(loyaltyTransactions)
        .where(and(eq(loyaltyTransactions.businessId, businessId), eq(loyaltyTransactions.type, "expire")))
    ).map((r) => r.note ?? "")
  );

  let expired = 0;
  await db.transaction(async (tx) => {
    for (const row of due) {
      const marker = `expiry:${row.id}`;
      if (expiredNotes.has(marker)) continue;
      const [customer] = await tx
        .select({ points: customers.loyaltyPoints })
        .from(customers)
        .where(eq(customers.id, row.customerId))
        .limit(1);
      const balance = customer ? Math.floor(parseFloat(customer.points)) : 0;
      const toExpire = Math.min(row.points, balance);
      if (toExpire <= 0) continue;
      await recordLoyaltyPoints(tx, {
        businessId,
        customerId: row.customerId,
        type: "expire",
        points: -toExpire,
        note: marker,
        userId: gate.sessionUser.userId,
      });
      expired += toExpire;
    }
  });

  return { ok: true, expired };
}

/* ------------------------------------------------------------ Communications */

export async function saveMessageTemplate(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.COMMUNICATIONS_SEND);
  if (!gate.ok) return gate;
  const parsed = messageTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const values = {
    businessId: gate.membership.businessId,
    channel: parsed.data.channel,
    eventKey: parsed.data.eventKey,
    name: parsed.data.name,
    subject: parsed.data.subject || null,
    body: parsed.data.body,
    updatedAt: new Date(),
  };

  await db.insert(messageTemplates).values(values).onConflictDoUpdate({
    target: [messageTemplates.businessId, messageTemplates.channel, messageTemplates.eventKey],
    set: { name: values.name, subject: values.subject, body: values.body, updatedAt: values.updatedAt },
  });
  return { ok: true };
}

export async function deleteMessageTemplate(id: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.COMMUNICATIONS_SEND);
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(messageTemplates).where(and(eq(messageTemplates.id, id), eq(messageTemplates.businessId, gate.membership.businessId)));
  return { ok: true };
}

/**
 * Sends through whichever provider is configured and records the outcome
 * either way, so a failed send is visible instead of silently lost.
 */
export async function sendMessage(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.COMMUNICATIONS_SEND);
  if (!gate.ok) return gate;
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  const businessId = gate.membership.businessId;

  let status: "sent" | "failed" = "sent";
  let error: string | null = null;

  try {
    if (parsed.data.channel === "email") {
      await getEmailService().send({
        to: parsed.data.recipient,
        subject: parsed.data.subject || "Message from your shop",
        body: parsed.data.body,
      });
    } else {
      await getSmsService().send({ to: parsed.data.recipient, body: parsed.data.body });
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "Send failed";
  }

  await db.insert(messageLog).values({
    businessId,
    channel: parsed.data.channel,
    eventKey: parsed.data.eventKey,
    recipient: parsed.data.recipient,
    subject: parsed.data.subject || null,
    body: parsed.data.body,
    status,
    error,
    customerId: parsed.data.customerId || null,
    sentByUserId: gate.sessionUser.userId,
  });

  if (status === "failed") return { ok: false, error: error ?? "Send failed" };
  return { ok: true };
}

/** Fills a template for one customer, optionally against a specific bill. */
export async function previewMessage(params: {
  channel: "sms" | "email";
  eventKey: string;
  customerId?: string;
  saleId?: string;
  templateBody: string;
  templateSubject?: string;
}): Promise<{ subject: string; body: string; recipient: string }> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  const db = await getDb();
  const businessId = membership.businessId;

  const [business] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);

  let customer: { name: string; phone: string | null; email: string | null; loyaltyPoints: string } | undefined;
  if (params.customerId) {
    const rows = await db
      .select({ name: customers.name, phone: customers.phone, email: customers.email, loyaltyPoints: customers.loyaltyPoints })
      .from(customers)
      .where(and(eq(customers.id, params.customerId), eq(customers.businessId, businessId)))
      .limit(1);
    customer = rows[0];
  }

  let sale: { docNumber: string; totalAmount: string; amountPaid: string; redeemedValue: string } | undefined;
  if (params.saleId) {
    const rows = await db
      .select({
        docNumber: sales.docNumber,
        totalAmount: sales.totalAmount,
        amountPaid: sales.amountPaid,
        redeemedValue: sales.redeemedValue,
      })
      .from(sales)
      .where(and(eq(sales.id, params.saleId), eq(sales.businessId, businessId)))
      .limit(1);
    sale = rows[0];
  }

  const balanceDue = sale
    ? (parseFloat(sale.totalAmount) - parseFloat(sale.amountPaid) - parseFloat(sale.redeemedValue)).toFixed(2)
    : "0.00";

  const values: Record<string, string> = {
    customer_name: customer?.name ?? "Customer",
    business_name: business?.name ?? "",
    doc_number: sale?.docNumber ?? "",
    total_amount: sale ? parseFloat(sale.totalAmount).toFixed(2) : "0.00",
    amount_paid: sale ? parseFloat(sale.amountPaid).toFixed(2) : "0.00",
    balance_due: balanceDue,
    loyalty_points: customer ? String(Math.floor(parseFloat(customer.loyaltyPoints))) : "0",
    date: formatDate(new Date()),
  };

  return {
    subject: renderTemplate(params.templateSubject ?? "", values),
    body: renderTemplate(params.templateBody, values),
    recipient: (params.channel === "email" ? customer?.email : customer?.phone) ?? "",
  };
}

/** Customers carrying an unpaid balance — the list a reminder blast goes to. */
export async function getOutstandingCustomers() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.COMMUNICATIONS_SEND)) throw new Error("FORBIDDEN");
  const db = await getDb();

  const rows = await db
    .select({
      customerId: sales.customerId,
      totalAmount: sales.totalAmount,
      amountPaid: sales.amountPaid,
      redeemedValue: sales.redeemedValue,
    })
    .from(sales)
    .where(and(eq(sales.businessId, membership.businessId), eq(sales.status, "completed"), eq(sales.docType, "sale")));

  const owed = new Map<string, number>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const due = parseFloat(row.totalAmount) - parseFloat(row.amountPaid) - parseFloat(row.redeemedValue);
    if (due <= 0.009) continue;
    owed.set(row.customerId, (owed.get(row.customerId) ?? 0) + due);
  }

  if (owed.size === 0) return [];
  const customerRows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email })
    .from(customers)
    .where(inArray(customers.id, [...owed.keys()]));

  return customerRows
    .map((c) => ({ ...c, outstanding: Math.round((owed.get(c.id) ?? 0) * 100) / 100 }))
    .sort((a, b) => b.outstanding - a.outstanding);
}

/* ------------------------------------------------------------------ Coupons */

/** Dates arrive as YYYY-MM-DD; a window should cover the whole of both days. */
function startOfDay(value?: string) {
  return value ? new Date(`${value}T00:00:00`) : null;
}
function endOfDay(value?: string) {
  return value ? new Date(`${value}T23:59:59.999`) : null;
}

function couponValues(input: ReturnType<typeof couponSchema.parse>) {
  return {
    code: input.code,
    description: input.description || null,
    type: input.type,
    value: String(input.value),
    maxDiscountAmount: input.maxDiscountAmount ? String(input.maxDiscountAmount) : null,
    minBillAmount: String(input.minBillAmount ?? 0),
    startsAt: startOfDay(input.startsAt),
    endsAt: endOfDay(input.endsAt),
    maxRedemptions: input.maxRedemptions ?? 0,
    perCustomerLimit: input.perCustomerLimit ?? 0,
    isActive: input.isActive ?? true,
  };
}

export async function createCoupon(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  try {
    await db.insert(coupons).values({ businessId: gate.membership.businessId, ...couponValues(parsed.data) });
    await logAudit({
      businessId: gate.membership.businessId,
      userId: gate.sessionUser.userId,
      action: "coupon.created",
      entityType: "coupon",
      after: { code: parsed.data.code },
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) return { ok: false, error: "A coupon with that code already exists." };
    throw err;
  }
}

export async function updateCoupon(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  try {
    await db
      .update(coupons)
      .set({ ...couponValues(parsed.data), updatedAt: new Date() })
      .where(and(eq(coupons.id, id), eq(coupons.businessId, gate.membership.businessId)));
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) return { ok: false, error: "A coupon with that code already exists." };
    throw err;
  }
}

/**
 * Removes a coupon nobody has used. A code that has been redeemed stays put —
 * deleting it would take the discount off the bills that used it — so it is
 * switched off instead.
 */
export async function deleteCoupon(id: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.businessId, gate.membership.businessId), eq(couponRedemptions.couponId, id)));

  if (count > 0) {
    await db
      .update(coupons)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(coupons.id, id), eq(coupons.businessId, gate.membership.businessId)));
    return { ok: false, error: `That coupon has been used on ${count} bill(s), so it was switched off rather than deleted.` };
  }

  await db.delete(coupons).where(and(eq(coupons.id, id), eq(coupons.businessId, gate.membership.businessId)));
  return { ok: true };
}

/** Prices a code against a bill without saving anything — what the POS shows as the cashier types. */
export async function checkCoupon(params: {
  code: string;
  discountableAmount: number;
  customerId?: string | null;
}): Promise<{ ok: true; code: string; discountAmount: number; description: string } | { ok: false; error: string }> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BILLING_MANAGE)) return { ok: false, error: "You don't have permission to do that." };

  const result = await evaluateCoupon({
    businessId: membership.businessId,
    code: params.code,
    discountableAmount: params.discountableAmount,
    customerId: params.customerId ?? null,
  });
  if (!result.ok) return result;
  return { ok: true, code: result.code, discountAmount: result.discountAmount, description: result.description };
}

/* ---------------------------------------------------------------- Referrals */

/** Mints (or returns) the code a customer shares with friends. */
export async function getReferralCode(customerId: string): Promise<ActionResult & { code?: string }> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  const code = await ensureReferralCode(db, gate.membership.businessId, customerId);
  if (!code) return { ok: false, error: "Customer not found." };
  return { ok: true, code };
}

/**
 * Records who introduced a customer. The reward is not paid here — it lands
 * when that customer's first bill completes, so an introduction that never
 * turns into business costs nothing.
 */
export async function recordReferral(referredCustomerId: string, code: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.LOYALTY_MANAGE);
  if (!gate.ok) return gate;

  const db = await getDb();
  const businessId = gate.membership.businessId;
  const clean = code.trim().toUpperCase();

  const referrer = await findReferrer(db, businessId, clean);
  if (!referrer) return { ok: false, error: `No customer has the referral code ${clean}.` };
  if (referrer.id === referredCustomerId) return { ok: false, error: "A customer cannot refer themselves." };

  const [existing] = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(and(eq(referrals.businessId, businessId), eq(referrals.referredCustomerId, referredCustomerId)))
    .limit(1);
  if (existing) return { ok: false, error: "That customer was already referred by someone." };

  await db.insert(referrals).values({
    businessId,
    referrerCustomerId: referrer.id,
    referredCustomerId,
    code: clean,
  });

  await logAudit({
    businessId,
    userId: gate.sessionUser.userId,
    action: "referral.recorded",
    entityType: "customer",
    entityId: referredCustomerId,
    after: { code: clean, referrer: referrer.name },
  });
  return { ok: true };
}

/** Coupons with their real usage counts, plus the referral register. */
export async function getCouponsAndReferrals() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  const db = await getDb();
  const businessId = membership.businessId;

  const [couponRows, usage, referralRows] = await Promise.all([
    db.select().from(coupons).where(eq(coupons.businessId, businessId)).orderBy(desc(coupons.createdAt)),
    countRedemptions(businessId),
    listReferrals(businessId),
  ]);

  return {
    coupons: couponRows.map((c) => ({ ...c, timesUsed: usage[c.id] ?? 0 })),
    referrals: referralRows,
  };
}
