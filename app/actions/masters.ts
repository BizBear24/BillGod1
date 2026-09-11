"use server";

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  categories,
  sections,
  subsections,
  brands,
  units,
  sizes,
  colors,
  racks,
  salespersons,
  doctors,
  taxRates,
  hsnCodes,
} from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { listWarehousesForBusiness } from "./org";
import { INLINE_MASTER_LABELS, type InlineMasterKind } from "@/lib/masters/inline";
import {
  categorySchema,
  sectionSchema,
  subsectionSchema,
  brandSchema,
  unitSchema,
  sizeSchema,
  colorSchema,
  rackSchema,
  salespersonSchema,
  doctorSchema,
  taxRateSchema,
  hsnCodeSchema,
} from "@/lib/validation/masters";
import type { ActionResult } from "./auth";

async function requireMembership() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  return { sessionUser, membership };
}

async function requireManage() {
  const { sessionUser, membership } = await requireMembership();
  if (!can(membership.role, PERMISSIONS.MASTERS_MANAGE)) {
    return { ok: false as const, error: "You don't have permission to manage masters." };
  }
  return { ok: true as const, sessionUser, membership };
}

/** Everything the Masters hub and its subpages need, fetched in one round trip. */
export async function getMastersData() {
  const { membership } = await requireMembership();
  const db = await getDb();
  const businessId = membership.businessId;

  const warehouseRows = await listWarehousesForBusiness(businessId);

  const [
    categoryRows,
    sectionRows,
    subsectionRows,
    brandRows,
    unitRows,
    sizeRows,
    colorRows,
    rackRows,
    salespersonRows,
    doctorRows,
    taxRateRows,
    hsnRows,
  ] = await Promise.all([
    db.select().from(categories).where(eq(categories.businessId, businessId)),
    db.select().from(sections).where(eq(sections.businessId, businessId)),
    (async () => {
      const sectionIds = (await db.select({ id: sections.id }).from(sections).where(eq(sections.businessId, businessId))).map((s) => s.id);
      return sectionIds.length ? db.select().from(subsections).where(inArray(subsections.sectionId, sectionIds)) : [];
    })(),
    db.select().from(brands).where(eq(brands.businessId, businessId)),
    db.select().from(units).where(eq(units.businessId, businessId)),
    db.select().from(sizes).where(eq(sizes.businessId, businessId)),
    db.select().from(colors).where(eq(colors.businessId, businessId)),
    warehouseRows.length ? db.select().from(racks).where(inArray(racks.warehouseId, warehouseRows.map((w) => w.id))) : Promise.resolve([]),
    db.select().from(salespersons).where(eq(salespersons.businessId, businessId)),
    db.select().from(doctors).where(eq(doctors.businessId, businessId)),
    db.select().from(taxRates).where(eq(taxRates.businessId, businessId)),
    db.select().from(hsnCodes).where(eq(hsnCodes.businessId, businessId)),
  ]);

  return {
    categories: categoryRows,
    sections: sectionRows,
    subsections: subsectionRows,
    brands: brandRows,
    units: unitRows,
    sizes: sizeRows,
    colors: colorRows,
    warehouses: warehouseRows,
    racks: rackRows,
    salespersons: salespersonRows,
    doctors: doctorRows,
    taxRates: taxRateRows,
    hsnCodes: hsnRows,
    canManage: can(membership.role, PERMISSIONS.MASTERS_MANAGE),
  };
}

// ---------- Categories ----------
export async function createCategory(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(categories).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "category.created", entityType: "category", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(categories).set(parsed.data).where(and(eq(categories.id, id), eq(categories.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "category.updated", entityType: "category", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "category.deleted", entityType: "category", entityId: id });
  return { ok: true };
}

// ---------- Brands ----------
export async function createBrand(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(brands).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "brand.created", entityType: "brand", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateBrand(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(brands).set(parsed.data).where(and(eq(brands.id, id), eq(brands.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "brand.updated", entityType: "brand", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(brands).where(and(eq(brands.id, id), eq(brands.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "brand.deleted", entityType: "brand", entityId: id });
  return { ok: true };
}

// ---------- Sizes ----------
export async function createSize(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = sizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(sizes).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "size.created", entityType: "size", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateSize(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = sizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(sizes).set(parsed.data).where(and(eq(sizes.id, id), eq(sizes.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "size.updated", entityType: "size", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteSize(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(sizes).where(and(eq(sizes.id, id), eq(sizes.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "size.deleted", entityType: "size", entityId: id });
  return { ok: true };
}

// ---------- Colors ----------
export async function createColor(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = colorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(colors).values({ businessId: gate.membership.businessId, name: parsed.data.name, hexCode: parsed.data.hexCode || null }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "color.created", entityType: "color", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateColor(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = colorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(colors).set({ name: parsed.data.name, hexCode: parsed.data.hexCode || null }).where(and(eq(colors.id, id), eq(colors.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "color.updated", entityType: "color", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteColor(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(colors).where(and(eq(colors.id, id), eq(colors.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "color.deleted", entityType: "color", entityId: id });
  return { ok: true };
}

// ---------- Units ----------
export async function createUnit(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(units).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "unit.created", entityType: "unit", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateUnit(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(units).set(parsed.data).where(and(eq(units.id, id), eq(units.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "unit.updated", entityType: "unit", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteUnit(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(units).where(and(eq(units.id, id), eq(units.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "unit.deleted", entityType: "unit", entityId: id });
  return { ok: true };
}

// ---------- Sections & Subsections ----------
export async function createSection(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(sections).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "section.created", entityType: "section", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateSection(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(sections).set(parsed.data).where(and(eq(sections.id, id), eq(sections.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "section.updated", entityType: "section", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteSection(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(sections).where(and(eq(sections.id, id), eq(sections.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "section.deleted", entityType: "section", entityId: id });
  return { ok: true };
}

async function assertSectionOwnedByBusiness(sectionId: string, businessId: string) {
  const db = await getDb();
  const [row] = await db.select().from(sections).where(and(eq(sections.id, sectionId), eq(sections.businessId, businessId))).limit(1);
  return !!row;
}

export async function createSubsection(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = subsectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!(await assertSectionOwnedByBusiness(parsed.data.sectionId, gate.membership.businessId))) {
    return { ok: false, error: "Section not found." };
  }
  const db = await getDb();
  const [row] = await db.insert(subsections).values(parsed.data).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "subsection.created", entityType: "subsection", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function deleteSubsection(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  const [row] = await db.select().from(subsections).where(eq(subsections.id, id)).limit(1);
  if (!row || !(await assertSectionOwnedByBusiness(row.sectionId, gate.membership.businessId))) {
    return { ok: false, error: "Subsection not found." };
  }
  await db.delete(subsections).where(eq(subsections.id, id));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "subsection.deleted", entityType: "subsection", entityId: id });
  return { ok: true };
}

// ---------- Racks (scoped to a warehouse) ----------
export async function createRack(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = rackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(racks).values(parsed.data).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "rack.created", entityType: "rack", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateRack(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = rackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(racks).set(parsed.data).where(eq(racks.id, id));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "rack.updated", entityType: "rack", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteRack(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(racks).where(eq(racks.id, id));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "rack.deleted", entityType: "rack", entityId: id });
  return { ok: true };
}

// ---------- Salespersons ----------
export async function createSalesperson(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = salespersonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(salespersons).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "salesperson.created", entityType: "salesperson", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateSalesperson(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = salespersonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(salespersons).set(parsed.data).where(and(eq(salespersons.id, id), eq(salespersons.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "salesperson.updated", entityType: "salesperson", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteSalesperson(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(salespersons).where(and(eq(salespersons.id, id), eq(salespersons.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "salesperson.deleted", entityType: "salesperson", entityId: id });
  return { ok: true };
}

// ---------- Doctors ----------
export async function createDoctor(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = doctorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db.insert(doctors).values({ businessId: gate.membership.businessId, ...parsed.data }).returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "doctor.created", entityType: "doctor", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateDoctor(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = doctorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db.update(doctors).set(parsed.data).where(and(eq(doctors.id, id), eq(doctors.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "doctor.updated", entityType: "doctor", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteDoctor(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(doctors).where(and(eq(doctors.id, id), eq(doctors.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "doctor.deleted", entityType: "doctor", entityId: id });
  return { ok: true };
}

// ---------- Tax rates ----------
export async function createTaxRate(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = taxRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db
    .insert(taxRates)
    .values({ businessId: gate.membership.businessId, name: parsed.data.name, ratePercent: String(parsed.data.ratePercent), cessPercent: String(parsed.data.cessPercent ?? 0) })
    .returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "tax_rate.created", entityType: "tax_rate", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateTaxRate(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = taxRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db
    .update(taxRates)
    .set({ name: parsed.data.name, ratePercent: String(parsed.data.ratePercent), cessPercent: String(parsed.data.cessPercent ?? 0) })
    .where(and(eq(taxRates.id, id), eq(taxRates.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "tax_rate.updated", entityType: "tax_rate", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteTaxRate(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(taxRates).where(and(eq(taxRates.id, id), eq(taxRates.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "tax_rate.deleted", entityType: "tax_rate", entityId: id });
  return { ok: true };
}

// ---------- HSN codes ----------
export async function createHsnCode(input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = hsnCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  const [row] = await db
    .insert(hsnCodes)
    .values({ businessId: gate.membership.businessId, code: parsed.data.code, description: parsed.data.description || null, taxRateId: parsed.data.taxRateId || null })
    .returning();
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "hsn_code.created", entityType: "hsn_code", entityId: row.id, after: parsed.data });
  return { ok: true };
}

export async function updateHsnCode(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const parsed = hsnCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const db = await getDb();
  await db
    .update(hsnCodes)
    .set({ code: parsed.data.code, description: parsed.data.description || null, taxRateId: parsed.data.taxRateId || null })
    .where(and(eq(hsnCodes.id, id), eq(hsnCodes.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "hsn_code.updated", entityType: "hsn_code", entityId: id, after: parsed.data });
  return { ok: true };
}

export async function deleteHsnCode(id: string): Promise<ActionResult> {
  const gate = await requireManage();
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(hsnCodes).where(and(eq(hsnCodes.id, id), eq(hsnCodes.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "hsn_code.deleted", entityType: "hsn_code", entityId: id });
  return { ok: true };
}

/* ------------------------------------------------- Inline master creation */

/**
 * Creates one master value from a single typed string and returns the row the
 * caller should now select.
 *
 * Shaping the payload happens here rather than in the browser so the same
 * validation the Masters screens use still applies — the client only ever
 * sends the text someone typed.
 */
export async function createMasterValue(
  kind: InlineMasterKind,
  value: string,
  /** Extra context a kind may need beyond its own name — currently only subsection's parent. */
  context?: { sectionId?: string }
): Promise<ActionResult & { id?: string; label?: string }> {
  const gate = await requireManage();
  if (!gate.ok) return gate;

  const text = value.trim();
  if (!text) return { ok: false, error: "Enter a name first." };

  const businessId = gate.membership.businessId;
  const db = await getDb();

  try {
    switch (kind) {
      case "subsection": {
        if (!context?.sectionId) return { ok: false, error: "Pick a section first." };
        if (!(await assertSectionOwnedByBusiness(context.sectionId, businessId))) {
          return { ok: false, error: "Section not found." };
        }
        const parsed = subsectionSchema.safeParse({ sectionId: context.sectionId, name: text });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db.insert(subsections).values(parsed.data).returning();
        const [section] = await db.select({ name: sections.name }).from(sections).where(eq(sections.id, context.sectionId)).limit(1);
        return { ok: true, id: row.id, label: section ? `${section.name} / ${row.name}` : row.name };
      }
      case "category": {
        const parsed = categorySchema.safeParse({ name: text });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db.insert(categories).values({ businessId, name: parsed.data.name }).returning();
        return { ok: true, id: row.id, label: row.name };
      }
      case "section": {
        const parsed = sectionSchema.safeParse({ name: text });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db.insert(sections).values({ businessId, name: parsed.data.name }).returning();
        return { ok: true, id: row.id, label: row.name };
      }
      case "brand": {
        const parsed = brandSchema.safeParse({ name: text });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db.insert(brands).values({ businessId, name: parsed.data.name }).returning();
        return { ok: true, id: row.id, label: row.name };
      }
      case "size": {
        const parsed = sizeSchema.safeParse({ name: text });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db.insert(sizes).values({ businessId, name: parsed.data.name }).returning();
        return { ok: true, id: row.id, label: row.name };
      }
      case "color": {
        // "Red" or "Red #FF0000" — the hex is optional and picked out if given.
        const hexMatch = text.match(/#[0-9a-fA-F]{6}\b/);
        const name = text.replace(/#[0-9a-fA-F]{6}\b/, "").trim() || text;
        const parsed = colorSchema.safeParse({ name, hexCode: hexMatch?.[0] });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db
          .insert(colors)
          .values({ businessId, name: parsed.data.name, hexCode: parsed.data.hexCode || null })
          .returning();
        return { ok: true, id: row.id, label: row.name };
      }
      case "unit": {
        // A short code is required but rarely worth typing: "Piece" -> "PIE".
        const [namePart, codePart] = text.split(/\s*[/|,]\s*/);
        const name = namePart.trim();
        const shortCode = (codePart ?? name.slice(0, 3)).trim().toUpperCase();
        const parsed = unitSchema.safeParse({ name, shortCode });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db
          .insert(units)
          .values({ businessId, name: parsed.data.name, shortCode: parsed.data.shortCode })
          .returning();
        return { ok: true, id: row.id, label: `${row.name} (${row.shortCode})` };
      }
      case "hsnCode": {
        const parsed = hsnCodeSchema.safeParse({ code: text });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db.insert(hsnCodes).values({ businessId, code: parsed.data.code }).returning();
        return { ok: true, id: row.id, label: row.code };
      }
      case "taxRate": {
        // "18" or "18%" is all a shop should have to type for GST 18%.
        const percent = parseFloat(text.replace("%", "").trim());
        if (!Number.isFinite(percent)) {
          return { ok: false, error: 'Enter the rate as a number, for example "18".' };
        }
        const parsed = taxRateSchema.safeParse({ name: `GST ${percent}%`, ratePercent: percent });
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        const [row] = await db
          .insert(taxRates)
          .values({ businessId, name: parsed.data.name, ratePercent: String(parsed.data.ratePercent) })
          .returning();
        return { ok: true, id: row.id, label: `${row.name} (${parseFloat(row.ratePercent)}%)` };
      }
      default:
        return { ok: false, error: "That cannot be created here." };
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return { ok: false, error: `A ${INLINE_MASTER_LABELS[kind]} called "${text}" already exists — pick it from the list.` };
    }
    throw err;
  } finally {
    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "master.created_inline",
      entityType: kind,
      after: { value: text },
    });
  }
}
