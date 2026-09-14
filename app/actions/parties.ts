"use server";

import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, suppliers, referrals } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { customerSchema, supplierSchema } from "@/lib/validation/parties";
import { findReferrer } from "@/lib/loyalty/referrals";
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

// ---------- Customers ----------
export async function listCustomers() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.CUSTOMERS_VIEW)) throw new Error("FORBIDDEN");
  const db = await getDb();
  const rows = await db.select().from(customers).where(eq(customers.businessId, membership.businessId));
  return { customers: rows, canManage: can(membership.role, PERMISSIONS.CUSTOMERS_MANAGE) };
}

export async function createCustomer(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.CUSTOMERS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const businessId = gate.membership.businessId;
  const { creditLimit, openingBalance, paymentTermsDays, referredByCode, ...rest } = parsed.data;

  // Resolve the referral before writing anything, so a typo'd code is a
  // rejected form rather than a customer saved with the referral silently lost.
  const referrer = referredByCode ? await findReferrer(db, businessId, referredByCode) : null;
  if (referredByCode && !referrer) {
    return { ok: false, error: `No customer has the referral code ${referredByCode}.` };
  }

  const [row] = await db
    .insert(customers)
    .values({
      businessId,
      ...rest,
      creditLimit: creditLimit !== undefined ? String(creditLimit) : undefined,
      openingBalance: openingBalance !== undefined ? String(openingBalance) : undefined,
      paymentTermsDays: paymentTermsDays !== undefined ? String(paymentTermsDays) : undefined,
    })
    .returning();

  // The reward itself is paid when this customer's first bill completes, so
  // an introduction that never becomes a sale costs the shop nothing.
  if (referrer) {
    await db.insert(referrals).values({
      businessId,
      referrerCustomerId: referrer.id,
      referredCustomerId: row.id,
      code: referredByCode!,
    });
  }

  await logAudit({ businessId, userId: gate.sessionUser.userId, action: "customer.created", entityType: "customer", entityId: row.id, after: parsed.data });
  return { ok: true };
}

// Used by the billing screen's customer field: typing a name that doesn't
// match anyone existing creates a bare-minimum customer on the spot, rather
// than forcing the cashier out to the customers page mid-sale.
export async function quickCreateCustomer(name: string): Promise<ActionResult & { customer?: { id: string; name: string; phone: string | null; loyaltyPoints: string } }> {
  const gate = await requireGate(PERMISSIONS.CUSTOMERS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = customerSchema.safeParse({ name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const businessId = gate.membership.businessId;

  const [row] = await db
    .insert(customers)
    .values({ businessId, name: parsed.data.name })
    .returning();

  await logAudit({ businessId, userId: gate.sessionUser.userId, action: "customer.created", entityType: "customer", entityId: row.id, after: { name: parsed.data.name } });
  return { ok: true, customer: { id: row.id, name: row.name, phone: row.phone, loyaltyPoints: row.loyaltyPoints } };
}

export async function updateCustomer(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.CUSTOMERS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  // `referredByCode` is deliberately dropped here: who introduced a customer is
  // settled once, at creation, and is not something an edit should rewrite.
  const { creditLimit, openingBalance, paymentTermsDays, referredByCode: _ignored, ...rest } = parsed.data;
  void _ignored;
  await db
    .update(customers)
    .set({
      ...rest,
      creditLimit: creditLimit !== undefined ? String(creditLimit) : undefined,
      openingBalance: openingBalance !== undefined ? String(openingBalance) : undefined,
      paymentTermsDays: paymentTermsDays !== undefined ? String(paymentTermsDays) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(customers.id, id), eq(customers.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "customer.updated", entityType: "customer", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.CUSTOMERS_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(customers).where(and(eq(customers.id, id), eq(customers.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "customer.deleted", entityType: "customer", entityId: id });
  return { ok: true };
}

// ---------- Suppliers ----------
export async function listSuppliers() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.SUPPLIERS_VIEW)) throw new Error("FORBIDDEN");
  const db = await getDb();
  const rows = await db.select().from(suppliers).where(eq(suppliers.businessId, membership.businessId));
  return { suppliers: rows, canManage: can(membership.role, PERMISSIONS.SUPPLIERS_MANAGE) };
}

export async function createSupplier(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.SUPPLIERS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const { openingBalance, paymentTermsDays, ...rest } = parsed.data;
  const [row] = await db
    .insert(suppliers)
    .values({
      businessId: gate.membership.businessId,
      ...rest,
      openingBalance: openingBalance !== undefined ? String(openingBalance) : undefined,
      paymentTermsDays: paymentTermsDays !== undefined ? String(paymentTermsDays) : undefined,
    })
    .returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "supplier.created", entityType: "supplier", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateSupplier(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.SUPPLIERS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const { openingBalance, paymentTermsDays, ...rest } = parsed.data;
  await db
    .update(suppliers)
    .set({
      ...rest,
      openingBalance: openingBalance !== undefined ? String(openingBalance) : undefined,
      paymentTermsDays: paymentTermsDays !== undefined ? String(paymentTermsDays) : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "supplier.updated", entityType: "supplier", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.SUPPLIERS_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "supplier.deleted", entityType: "supplier", entityId: id });
  return { ok: true };
}
