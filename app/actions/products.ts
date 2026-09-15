"use server";

import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
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
  productImages,
  stockMovements,
  companies,
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
    defaultDiscountPercent: data.defaultDiscountPercent !== undefined ? String(data.defaultDiscountPercent) : undefined,
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

/** Quick single-field update for the Inventory screen's inline discount editor — doesn't require the rest of the product form. */
export async function updateProductDiscount(id: string, discountPercent: number): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.PRODUCTS_MANAGE);
  if (!gate.ok) return gate;
  const parsed = z.coerce.number().min(0).max(100).safeParse(discountPercent);
  if (!parsed.success) return { ok: false, error: "Enter a discount between 0 and 100" };

  const db = await getDb();
  await db
    .update(products)
    .set({ defaultDiscountPercent: String(parsed.data), updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.businessId, gate.membership.businessId)));
  await logAudit({
    businessId: gate.membership.businessId,
    userId: gate.sessionUser.userId,
    action: "product.updated",
    entityType: "product",
    entityId: id,
    after: { defaultDiscountPercent: parsed.data },
  });
  return { ok: true };
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

/**
 * Which products have a photo, with no image bytes attached — cheap enough to
 * load alongside the full product list so the master list can show a "has
 * photo" indicator without every page that queries products paying for image
 * payloads it never displays.
 */
export async function getProductImageIds(): Promise<string[]> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const rows = await db.select({ productId: productImages.productId }).from(productImages).where(eq(productImages.businessId, membership.businessId));
  return rows.map((r) => r.productId);
}

/** One product's photo, fetched only when something is actually about to show it (the edit dialog, or the catalogue). */
export async function getProductImage(productId: string): Promise<string | null> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const [row] = await db
    .select({ dataUrl: productImages.dataUrl })
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.businessId, membership.businessId)))
    .limit(1);
  return row?.dataUrl ?? null;
}

/** A batch of products' photos at once, for building a catalogue page. */
export async function getProductImagesFor(productIds: string[]): Promise<Record<string, string>> {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) throw new Error("FORBIDDEN");
  if (productIds.length === 0) return {};

  const db = await getDb();
  const rows = await db
    .select({ productId: productImages.productId, dataUrl: productImages.dataUrl })
    .from(productImages)
    .where(and(inArray(productImages.productId, productIds), eq(productImages.businessId, membership.businessId)));
  return Object.fromEntries(rows.map((r) => [r.productId, r.dataUrl]));
}

/** A resized data: URI under ~700KB of text, generously above what the client-side resize ever produces. */
const MAX_IMAGE_DATA_URL_LENGTH = 700_000;

/** Replaces (or, given `null`, removes) a product's photo. */
export async function setProductImage(productId: string, dataUrl: string | null): Promise<ActionResult> {
  const gate = await requireGate(PERMISSIONS.PRODUCTS_MANAGE);
  if (!gate.ok) return gate;

  const db = await getDb();
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, gate.membership.businessId)))
    .limit(1);
  if (!product) return { ok: false, error: "Product not found." };

  if (dataUrl === null) {
    await db.delete(productImages).where(eq(productImages.productId, productId));
    return { ok: true };
  }

  if (!dataUrl.startsWith("data:image/")) return { ok: false, error: "That doesn't look like an image." };
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return { ok: false, error: "That image is too large — try a smaller photo." };

  await db
    .insert(productImages)
    .values({ productId, businessId: gate.membership.businessId, dataUrl, updatedAt: new Date() })
    .onConflictDoUpdate({ target: productImages.productId, set: { dataUrl, updatedAt: new Date() } });
  return { ok: true };
}

/** Everything the Catalogue module needs: products with their category/brand, current stock, which ones have a photo, and the shop's own name for the sheet header. */
export async function getCataloguePageData() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership || !can(membership.role, PERMISSIONS.PRODUCTS_VIEW)) throw new Error("FORBIDDEN");

  const db = await getDb();
  const businessId = membership.businessId;

  const [productRows, categoryRows, brandRows, stockRows, imageRows, companyRows] = await Promise.all([
    db
      .select({
        id: products.id,
        itemCode: products.itemCode,
        name: products.name,
        categoryId: products.categoryId,
        brandId: products.brandId,
        sellingPrice: products.sellingPrice,
        mrp: products.mrp,
        isActive: products.isActive,
      })
      .from(products)
      .where(and(eq(products.businessId, businessId), eq(products.isActive, true))),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.businessId, businessId)),
    db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.businessId, businessId)),
    db
      .select({ productId: stockMovements.productId, total: sql<string>`sum(${stockMovements.quantity})` })
      .from(stockMovements)
      .where(eq(stockMovements.businessId, businessId))
      .groupBy(stockMovements.productId),
    db.select({ productId: productImages.productId }).from(productImages).where(eq(productImages.businessId, businessId)),
    db.select({ name: companies.name }).from(companies).where(eq(companies.businessId, businessId)).limit(1),
  ]);

  const stockByProduct = Object.fromEntries(stockRows.map((r) => [r.productId, parseFloat(r.total ?? "0")]));

  return {
    products: productRows,
    categories: categoryRows,
    brands: brandRows,
    stockByProduct,
    imageProductIds: imageRows.map((r) => r.productId),
    companyName: companyRows[0]?.name ?? null,
  };
}
