"use server";

import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  products,
  categories,
  sections,
  subsections,
  brands,
  units,
  sizes,
  colors,
  hsnCodes,
  taxRates,
} from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { productSchema } from "@/lib/validation/products";
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

/** Product list plus every lookup master needed to render the product form's dropdowns. */
export async function getProductsPageData() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [productRows, categoryRows, sectionRows, subsectionRows, brandRows, unitRows, sizeRows, colorRows, hsnRows, taxRateRows] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, businessId)),
    db.select().from(categories).where(eq(categories.businessId, businessId)),
    db.select().from(sections).where(eq(sections.businessId, businessId)),
    db.select({ id: subsections.id, sectionId: subsections.sectionId, name: subsections.name }).from(subsections),
    db.select().from(brands).where(eq(brands.businessId, businessId)),
    db.select().from(units).where(eq(units.businessId, businessId)),
    db.select().from(sizes).where(eq(sizes.businessId, businessId)),
    db.select().from(colors).where(eq(colors.businessId, businessId)),
    db.select().from(hsnCodes).where(eq(hsnCodes.businessId, businessId)),
    db.select().from(taxRates).where(eq(taxRates.businessId, businessId)),
  ]);

  return {
    products: productRows,
    categories: categoryRows,
    sections: sectionRows,
    subsections: subsectionRows,
    brands: brandRows,
    units: unitRows,
    sizes: sizeRows,
    colors: colorRows,
    hsnCodes: hsnRows,
    taxRates: taxRateRows,
    canManage: can(membership.role, PERMISSIONS.PRODUCTS_MANAGE),
  };
}

function toDbValues(businessId: string, data: ReturnType<typeof productSchema.parse>) {
  return {
    businessId,
    itemCode: data.itemCode,
    name: data.name,
    description: data.description || null,
    categoryId: data.categoryId ?? null,
    sectionId: data.sectionId ?? null,
    subsectionId: data.subsectionId ?? null,
    brandId: data.brandId ?? null,
    unitId: data.unitId ?? null,
    sizeId: data.sizeId ?? null,
    colorId: data.colorId ?? null,
    hsnId: data.hsnId ?? null,
    taxRateId: data.taxRateId ?? null,
    barcode: data.barcode || null,
    purchasePrice: data.purchasePrice !== undefined ? String(data.purchasePrice) : undefined,
    sellingPrice: data.sellingPrice !== undefined ? String(data.sellingPrice) : undefined,
    mrp: data.mrp !== undefined ? String(data.mrp) : undefined,
    wholesalePrice: data.wholesalePrice !== undefined ? String(data.wholesalePrice) : undefined,
    openingStock: data.openingStock !== undefined ? String(data.openingStock) : undefined,
    minStock: data.minStock !== undefined ? String(data.minStock) : undefined,
    reorderLevel: data.reorderLevel !== undefined ? String(data.reorderLevel) : undefined,
    trackBatch: data.trackBatch,
    trackExpiry: data.trackExpiry,
    trackSerial: data.trackSerial,
  };
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.PRODUCTS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  try {
    const [row] = await db.insert(products).values(toDbValues(gate.membership.businessId, parsed.data)).returning();
    await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "product.created", entityType: "product", entityId: row.id, after: parsed.data });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return { ok: false, error: "A product with this item code already exists." };
    }
    throw err;
  }
}

export async function updateProduct(id: string, input: unknown): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.PRODUCTS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const db = await getDb();
  try {
    await db
      .update(products)
      .set({ ...toDbValues(gate.membership.businessId, parsed.data), updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.businessId, gate.membership.businessId)));
    await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "product.updated", entityType: "product", entityId: id, after: parsed.data });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      return { ok: false, error: "A product with this item code already exists." };
    }
    throw err;
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.PRODUCTS_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.delete(products).where(and(eq(products.id, id), eq(products.businessId, gate.membership.businessId)));
  await logAudit({ businessId: gate.membership.businessId, userId: gate.sessionUser.userId, action: "product.deleted", entityType: "product", entityId: id });
  return { ok: true };
}

export async function toggleProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.PRODUCTS_MANAGE);
  if (!gate.ok) return gate;
  const db = await getDb();
  await db.update(products).set({ isActive, updatedAt: new Date() }).where(and(eq(products.id, id), eq(products.businessId, gate.membership.businessId)));
  return { ok: true };
}
