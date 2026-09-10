"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { businesses, memberships, companies, branches, warehouses, counters, sales } from "@/db/schema";
import { requireSessionUser, setActiveBusiness, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { createBusinessSchema, createCompanySchema, createBranchSchema, counterSchema } from "@/lib/validation/org";
import type { ActionResult } from "./auth";

/** Creates the business, makes the current user its Owner, and activates it on the session. */
export async function createBusiness(input: unknown): Promise<ActionResult & { businessId?: string }> {
  const sessionUser = await requireSessionUser();
  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();
  const [business] = await db
    .insert(businesses)
    .values({
      name: parsed.data.businessName,
      currency: parsed.data.currency,
      createdByUserId: sessionUser.userId,
    })
    .returning();

  await db.insert(memberships).values({
    userId: sessionUser.userId,
    businessId: business.id,
    role: "owner",
  });

  await setActiveBusiness(sessionUser.sessionId, business.id);
  await logAudit({
    businessId: business.id,
    userId: sessionUser.userId,
    action: "business.created",
    entityType: "business",
    entityId: business.id,
    after: { name: business.name },
  });

  return { ok: true, businessId: business.id };
}

export async function createCompany(input: unknown): Promise<ActionResult & { companyId?: string }> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.COMPANY_MANAGE)) {
    return { ok: false, error: "You don't have permission to create a company." };
  }

  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();
  const [company] = await db
    .insert(companies)
    .values({ businessId: membership.businessId, ...parsed.data })
    .returning();

  await logAudit({
    businessId: membership.businessId,
    userId: sessionUser.userId,
    action: "company.created",
    entityType: "company",
    entityId: company.id,
    after: parsed.data,
  });

  return { ok: true, companyId: company.id };
}

/** Creates a branch plus a default warehouse and counter under it (spec §24: inventory must be location-aware). */
export async function createBranch(input: unknown): Promise<ActionResult & { branchId?: string }> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BRANCH_MANAGE)) {
    return { ok: false, error: "You don't have permission to create a branch." };
  }

  const parsed = createBranchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = await getDb();

  const [company] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId)).limit(1);
  if (!company || company.businessId !== membership.businessId) {
    return { ok: false, error: "Company not found." };
  }

  const [branch] = await db
    .insert(branches)
    .values({ ...parsed.data, isDefault: true })
    .returning();

  await db.insert(warehouses).values({ branchId: branch.id, name: "Main Warehouse", isDefault: true });
  await db.insert(counters).values({ branchId: branch.id, name: "Counter 1", isDefault: true });

  await logAudit({
    businessId: membership.businessId,
    userId: sessionUser.userId,
    action: "branch.created",
    entityType: "branch",
    entityId: branch.id,
    after: { name: branch.name, companyId: company.id },
  });

  return { ok: true, branchId: branch.id };
}

export async function completeSetup(): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) {
    return { ok: false, error: "No active business." };
  }
  const db = await getDb();
  await db.update(businesses).set({ setupCompletedAt: new Date() }).where(eq(businesses.id, membership.businessId));
  return { ok: true };
}

export async function switchBusiness(businessId: string): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const db = await getDb();
  const rows = await db.select().from(memberships).where(eq(memberships.userId, sessionUser.userId));
  const match = rows.find((m) => m.businessId === businessId);
  if (!match) {
    return { ok: false, error: "You are not a member of that business." };
  }
  await setActiveBusiness(sessionUser.sessionId, businessId);
  return { ok: true };
}

export async function getOrgTree(businessId: string) {
  const db = await getDb();
  const companyRows = await db.select().from(companies).where(eq(companies.businessId, businessId));
  const companyIds = companyRows.map((c) => c.id);

  const branchRows = companyIds.length
    ? await db.select().from(branches).where(inArray(branches.companyId, companyIds))
    : [];

  const branchIds = branchRows.map((b) => b.id);
  const [warehouseRows, counterRows] = await Promise.all([
    branchIds.length ? db.select().from(warehouses).where(inArray(warehouses.branchId, branchIds)) : Promise.resolve([]),
    branchIds.length ? db.select().from(counters).where(inArray(counters.branchId, branchIds)) : Promise.resolve([]),
  ]);

  return { companies: companyRows, branches: branchRows, warehouses: warehouseRows, counters: counterRows };
}

/** Confirms a branch belongs to the caller's business before touching anything under it. */
async function branchInBusiness(db: Awaited<ReturnType<typeof getDb>>, branchId: string, businessId: string) {
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(companies, eq(branches.companyId, companies.id))
    .where(and(eq(branches.id, branchId), eq(companies.businessId, businessId)))
    .limit(1);
  return !!row;
}

export async function createCounter(input: unknown): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BRANCH_MANAGE)) {
    return { ok: false, error: "You don't have permission to manage counters." };
  }
  const parsed = counterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  if (!(await branchInBusiness(db, parsed.data.branchId, membership.businessId))) {
    return { ok: false, error: "Branch not found." };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(counters)
    .where(eq(counters.branchId, parsed.data.branchId));

  const [counter] = await db
    .insert(counters)
    .values({ branchId: parsed.data.branchId, name: parsed.data.name, isDefault: count === 0 })
    .returning();

  await logAudit({
    businessId: membership.businessId,
    userId: sessionUser.userId,
    action: "counter.created",
    entityType: "counter",
    entityId: counter.id,
    after: { name: counter.name, branchId: counter.branchId },
  });
  return { ok: true };
}

export async function renameCounter(counterId: string, name: string): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BRANCH_MANAGE)) {
    return { ok: false, error: "You don't have permission to manage counters." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 1) return { ok: false, error: "Enter a counter name." };

  const db = await getDb();
  const [counter] = await db.select().from(counters).where(eq(counters.id, counterId)).limit(1);
  if (!counter || !(await branchInBusiness(db, counter.branchId, membership.businessId))) {
    return { ok: false, error: "Counter not found." };
  }

  await db.update(counters).set({ name: trimmed }).where(eq(counters.id, counterId));
  return { ok: true };
}

/**
 * Only removes a counter nothing has been billed on — otherwise the bills
 * that reference it would lose the label their counter-wise report needs.
 */
export async function deleteCounter(counterId: string): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.BRANCH_MANAGE)) {
    return { ok: false, error: "You don't have permission to manage counters." };
  }

  const db = await getDb();
  const [counter] = await db.select().from(counters).where(eq(counters.id, counterId)).limit(1);
  if (!counter || !(await branchInBusiness(db, counter.branchId, membership.businessId))) {
    return { ok: false, error: "Counter not found." };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .where(eq(sales.counterId, counterId));
  if (count > 0) {
    return { ok: false, error: `${count} bill(s) were rung up on this counter, so it can't be removed. Rename it instead.` };
  }

  await db.delete(counters).where(eq(counters.id, counterId));
  return { ok: true };
}

/**
 * Every warehouse under this business, reached via companies -> branches ->
 * warehouses. `label` disambiguates same-named warehouses across branches
 * (every branch gets a "Main Warehouse" by default) — plain warehouse name
 * unless more than one warehouse shares it, in which case the branch name is
 * appended so pickers and reports don't show two indistinguishable entries.
 */
export async function listWarehousesForBusiness(businessId: string) {
  const db = await getDb();
  const companyRows = await db.select({ id: companies.id }).from(companies).where(eq(companies.businessId, businessId));
  const companyIds = companyRows.map((c) => c.id);
  if (!companyIds.length) return [];

  const branchRows = await db.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.companyId, companyIds));
  const branchIds = branchRows.map((b) => b.id);
  if (!branchIds.length) return [];
  const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]));

  const warehouseRows = await db.select().from(warehouses).where(inArray(warehouses.branchId, branchIds));
  const nameCounts = new Map<string, number>();
  for (const w of warehouseRows) nameCounts.set(w.name, (nameCounts.get(w.name) ?? 0) + 1);

  return warehouseRows.map((w) => ({
    ...w,
    label: (nameCounts.get(w.name) ?? 0) > 1 ? `${w.name} (${branchNameById.get(w.branchId) ?? "?"})` : w.name,
  }));
}

/**
 * Every billing counter under this business, reached via companies -> branches
 * -> counters. `label` disambiguates the same way `listWarehousesForBusiness`
 * does: every branch gets a "Counter 1" by default, so the branch name is
 * appended only when a name is shared.
 */
export async function listCountersForBusiness(businessId: string) {
  const db = await getDb();
  const companyRows = await db.select({ id: companies.id }).from(companies).where(eq(companies.businessId, businessId));
  const companyIds = companyRows.map((c) => c.id);
  if (!companyIds.length) return [];

  const branchRows = await db.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.companyId, companyIds));
  const branchIds = branchRows.map((b) => b.id);
  if (!branchIds.length) return [];
  const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]));

  const counterRows = await db.select().from(counters).where(inArray(counters.branchId, branchIds));
  const nameCounts = new Map<string, number>();
  for (const c of counterRows) nameCounts.set(c.name, (nameCounts.get(c.name) ?? 0) + 1);

  return counterRows.map((c) => ({
    ...c,
    label: (nameCounts.get(c.name) ?? 0) > 1 ? `${c.name} (${branchNameById.get(c.branchId) ?? "?"})` : c.name,
  }));
}
