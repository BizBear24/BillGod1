"use server";

import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { products, categories, brands, units, sizes, colors, hsnCodes, taxRates } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import {
  PRODUCT_COLUMNS,
  TEMPLATE_EXAMPLE_ROWS,
  mapColumns,
  parseBoolean,
  parseNumber,
  parseText,
  type ProductColumnKey,
} from "@/lib/import/product-columns";
import type { ActionResult } from "./auth";

/**
 * Bulk product import from a spreadsheet.
 *
 * Deliberately two-stage. `previewProductImport` parses and validates the
 * whole file and reports exactly what it would do — which rows create, which
 * update, which are broken and why — without writing anything.
 * `commitProductImport` then re-parses the same file and applies it. Nothing
 * is stored between the two calls, so a preview can never go stale against a
 * file the user swapped underneath it.
 */

export type ImportRowIssue = { row: number; field: string; message: string };

export type ImportRowPreview = {
  /** 1-based row number as the user sees it in their spreadsheet (header is row 1). */
  row: number;
  itemCode: string;
  name: string;
  action: "create" | "update" | "skip";
  /** Values the importer could not resolve, e.g. a category that does not exist. */
  warnings: string[];
};

export type ImportPreview = {
  ok: true;
  sheetName: string;
  totalRows: number;
  creates: number;
  updates: number;
  unknownHeadings: string[];
  rows: ImportRowPreview[];
  errors: ImportRowIssue[];
};

export type ImportOutcome = { ok: true; created: number; updated: number; skipped: number } | { ok: false; error: string };

async function requireImportGate() {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, PERMISSIONS.PRODUCTS_MANAGE)) return null;
  return { sessionUser, membership };
}

type Masters = {
  categories: Map<string, string>;
  brands: Map<string, string>;
  units: Map<string, string>;
  sizes: Map<string, string>;
  colors: Map<string, string>;
  hsnCodes: Map<string, string>;
  taxRates: Map<string, string>;
};

const key = (value: string) => value.trim().toLowerCase();

async function loadMasters(businessId: string): Promise<Masters> {
  const db = await getDb();
  const [categoryRows, brandRows, unitRows, sizeRows, colorRows, hsnRows, taxRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.businessId, businessId)),
    db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.businessId, businessId)),
    db.select({ id: units.id, name: units.name, shortCode: units.shortCode }).from(units).where(eq(units.businessId, businessId)),
    db.select({ id: sizes.id, name: sizes.name }).from(sizes).where(eq(sizes.businessId, businessId)),
    db.select({ id: colors.id, name: colors.name }).from(colors).where(eq(colors.businessId, businessId)),
    db.select({ id: hsnCodes.id, code: hsnCodes.code }).from(hsnCodes).where(eq(hsnCodes.businessId, businessId)),
    db.select({ id: taxRates.id, name: taxRates.name, ratePercent: taxRates.ratePercent }).from(taxRates).where(eq(taxRates.businessId, businessId)),
  ]);

  const unitMap = new Map<string, string>();
  for (const u of unitRows) {
    unitMap.set(key(u.name), u.id);
    unitMap.set(key(u.shortCode), u.id);
  }

  // A tax rate is matched by its name or its percentage, because exports say
  // either — "GST 18%" from one system, a bare 18 from another.
  const taxMap = new Map<string, string>();
  for (const t of taxRows) {
    taxMap.set(key(t.name), t.id);
    const percent = parseFloat(t.ratePercent);
    if (Number.isFinite(percent)) {
      taxMap.set(key(String(percent)), t.id);
      taxMap.set(key(`${percent}%`), t.id);
    }
  }

  return {
    categories: new Map(categoryRows.map((r) => [key(r.name), r.id])),
    brands: new Map(brandRows.map((r) => [key(r.name), r.id])),
    units: unitMap,
    sizes: new Map(sizeRows.map((r) => [key(r.name), r.id])),
    colors: new Map(colorRows.map((r) => [key(r.name), r.id])),
    hsnCodes: new Map(hsnRows.map((r) => [key(r.code), r.id])),
    taxRates: taxMap,
  };
}

type ParsedRow = {
  row: number;
  itemCode: string;
  name: string;
  values: Record<string, unknown>;
  warnings: string[];
};

type ParseResult = {
  sheetName: string;
  parsed: ParsedRow[];
  errors: ImportRowIssue[];
  unknownHeadings: string[];
};

/**
 * Parses the file into product values, resolving master names to ids.
 *
 * Unresolvable masters are a warning, not an error: importing 500 products and
 * losing the whole run because one brand is spelled differently is worse than
 * importing them with that field blank and saying so.
 */
async function parseFile(
  businessId: string,
  base64: string,
  fileName: string,
  mode: { createMissingMasters: boolean; dryRun: boolean }
): Promise<ParseResult> {
  const { readSpreadsheet } = await import("@/lib/import/spreadsheet");
  const { headers, rows, sheetName } = await readSpreadsheet(Buffer.from(base64, "base64"), fileName);

  const mapping = mapColumns(headers);
  if (mapping.missingRequired.length > 0) {
    const labels = mapping.missingRequired.map((k) => PRODUCT_COLUMNS.find((c) => c.key === k)?.heading ?? k);
    throw new Error(`The file is missing required column(s): ${labels.join(", ")}.`);
  }

  const masters = await loadMasters(businessId);
  const db = await getDb();

  const cell = (row: (string | number | boolean | Date | null)[], columnKey: ProductColumnKey) => {
    const index = mapping.byKey[columnKey];
    return index === undefined ? null : row[index];
  };

  const errors: ImportRowIssue[] = [];
  const parsed: ParsedRow[] = [];
  const seenCodes = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2; // header occupies row 1
    const row = rows[i];
    const warnings: string[] = [];

    const itemCode = parseText(cell(row, "itemCode"));
    const name = parseText(cell(row, "name"));

    if (!itemCode) {
      errors.push({ row: sheetRow, field: "Item Code", message: "Item Code is blank." });
      continue;
    }
    if (!name) {
      errors.push({ row: sheetRow, field: "Product Name", message: "Product Name is blank." });
      continue;
    }
    const duplicateOf = seenCodes.get(key(itemCode));
    if (duplicateOf) {
      errors.push({ row: sheetRow, field: "Item Code", message: `${itemCode} also appears on row ${duplicateOf}.` });
      continue;
    }
    seenCodes.set(key(itemCode), sheetRow);

    const resolve = async (
      columnKey: ProductColumnKey,
      lookup: Map<string, string>,
      label: string,
      creator?: () => Promise<string>
    ): Promise<string | null> => {
      const raw = parseText(cell(row, columnKey));
      if (!raw) return null;
      const found = lookup.get(key(raw));
      if (found) return found;
      if (creator) {
        // A preview must not write, so it says what the import would do instead.
        if (mode.dryRun) {
          warnings.push(`${label} "${raw}" will be created.`);
          return null;
        }
        const created = await creator();
        lookup.set(key(raw), created);
        return created;
      }
      warnings.push(`${label} "${raw}" does not exist — left blank.`);
      return null;
    };

    const categoryName = parseText(cell(row, "category"));
    const brandName = parseText(cell(row, "brand"));
    const unitName = parseText(cell(row, "unit"));

    const categoryId = await resolve(
      "category",
      masters.categories,
      "Category",
      mode.createMissingMasters && categoryName
        ? async () => (await db.insert(categories).values({ businessId, name: categoryName }).returning())[0].id
        : undefined
    );
    const brandId = await resolve(
      "brand",
      masters.brands,
      "Brand",
      mode.createMissingMasters && brandName
        ? async () => (await db.insert(brands).values({ businessId, name: brandName }).returning())[0].id
        : undefined
    );
    const unitId = await resolve(
      "unit",
      masters.units,
      "Unit",
      mode.createMissingMasters && unitName
        ? async () =>
            (await db.insert(units).values({ businessId, name: unitName, shortCode: unitName.slice(0, 8) }).returning())[0].id
        : undefined
    );

    const sizeId = await resolve("size", masters.sizes, "Size");
    const colorId = await resolve("color", masters.colors, "Color");
    const hsnId = await resolve("hsnCode", masters.hsnCodes, "HSN code");
    const taxRateId = await resolve("taxRate", masters.taxRates, "Tax rate");

    const numberOr = (columnKey: ProductColumnKey, label: string): number | undefined => {
      const raw = cell(row, columnKey);
      if (raw === null || String(raw).trim() === "") return undefined;
      const value = parseNumber(raw);
      if (value === null) {
        warnings.push(`${label} "${String(raw)}" is not a number — left at 0.`);
        return undefined;
      }
      if (value < 0) {
        warnings.push(`${label} cannot be negative — left at 0.`);
        return undefined;
      }
      return value;
    };

    const booleanOr = (columnKey: ProductColumnKey, label: string): boolean | undefined => {
      const raw = cell(row, columnKey);
      if (raw === null || String(raw).trim() === "") return undefined;
      const value = parseBoolean(raw);
      if (value === null) {
        warnings.push(`${label} "${String(raw)}" is not yes/no — left off.`);
        return undefined;
      }
      return value;
    };

    parsed.push({
      row: sheetRow,
      itemCode,
      name,
      warnings,
      values: {
        itemCode,
        name,
        description: parseText(cell(row, "description")) || null,
        categoryId,
        brandId,
        unitId,
        sizeId,
        colorId,
        hsnId,
        taxRateId,
        barcode: parseText(cell(row, "barcode")) || null,
        purchasePrice: numberOr("purchasePrice", "Purchase Price"),
        sellingPrice: numberOr("sellingPrice", "Selling Price"),
        mrp: numberOr("mrp", "MRP"),
        wholesalePrice: numberOr("wholesalePrice", "Wholesale Price"),
        openingStock: numberOr("openingStock", "Opening Stock"),
        minStock: numberOr("minStock", "Min Stock"),
        reorderLevel: numberOr("reorderLevel", "Reorder Level"),
        trackBatch: booleanOr("trackBatch", "Track Batch"),
        trackExpiry: booleanOr("trackExpiry", "Track Expiry"),
        trackSerial: booleanOr("trackSerial", "Track Serial"),
      },
    });
  }

  return { sheetName, parsed, errors, unknownHeadings: mapping.unknownHeadings };
}

/** Reads the file and reports what an import would do. Writes nothing. */
export async function previewProductImport(
  base64: string,
  fileName: string,
  options: { createMissingMasters: boolean }
): Promise<ImportPreview | { ok: false; error: string }> {
  const gate = await requireImportGate();
  if (!gate) return { ok: false, error: "You don't have permission to import products." };

  try {
    const { sheetName, parsed, errors, unknownHeadings } = await parseFile(gate.membership.businessId, base64, fileName, {
      createMissingMasters: options.createMissingMasters,
      dryRun: true,
    });

    const db = await getDb();
    const existing = await db
      .select({ id: products.id, itemCode: products.itemCode })
      .from(products)
      .where(eq(products.businessId, gate.membership.businessId));
    const existingCodes = new Set(existing.map((p) => key(p.itemCode)));

    const rows: ImportRowPreview[] = parsed.map((p) => ({
      row: p.row,
      itemCode: p.itemCode,
      name: p.name,
      action: existingCodes.has(key(p.itemCode)) ? "update" : "create",
      warnings: p.warnings,
    }));

    return {
      ok: true,
      sheetName,
      totalRows: parsed.length + errors.length,
      creates: rows.filter((r) => r.action === "create").length,
      updates: rows.filter((r) => r.action === "update").length,
      unknownHeadings,
      rows,
      errors,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not read that file." };
  }
}

/**
 * Applies the import. Rows that failed validation are skipped and counted;
 * everything else is written in one transaction, so a mid-file failure leaves
 * the catalog exactly as it was.
 */
export async function commitProductImport(
  base64: string,
  fileName: string,
  options: { createMissingMasters: boolean }
): Promise<ImportOutcome> {
  const gate = await requireImportGate();
  if (!gate) return { ok: false, error: "You don't have permission to import products." };

  const businessId = gate.membership.businessId;

  try {
    const { parsed, errors } = await parseFile(businessId, base64, fileName, {
      createMissingMasters: options.createMissingMasters,
      dryRun: false,
    });
    if (parsed.length === 0) return { ok: false, error: "No valid rows to import." };

    const db = await getDb();
    let created = 0;
    let updated = 0;

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: products.id, itemCode: products.itemCode })
        .from(products)
        .where(eq(products.businessId, businessId));
      const idByCode = new Map(existing.map((p) => [key(p.itemCode), p.id]));

      for (const entry of parsed) {
        const values = entry.values as Record<string, unknown>;
        const numeric = (name: string) => (values[name] === undefined ? undefined : String(values[name]));

        const dbValues = {
          businessId,
          itemCode: entry.itemCode,
          name: entry.name,
          description: values.description as string | null,
          categoryId: values.categoryId as string | null,
          brandId: values.brandId as string | null,
          unitId: values.unitId as string | null,
          sizeId: values.sizeId as string | null,
          colorId: values.colorId as string | null,
          hsnId: values.hsnId as string | null,
          taxRateId: values.taxRateId as string | null,
          barcode: values.barcode as string | null,
          purchasePrice: numeric("purchasePrice"),
          sellingPrice: numeric("sellingPrice"),
          mrp: numeric("mrp"),
          wholesalePrice: numeric("wholesalePrice"),
          openingStock: numeric("openingStock"),
          minStock: numeric("minStock"),
          reorderLevel: numeric("reorderLevel"),
          trackBatch: values.trackBatch as boolean | undefined,
          trackExpiry: values.trackExpiry as boolean | undefined,
          trackSerial: values.trackSerial as boolean | undefined,
        };

        const existingId = idByCode.get(key(entry.itemCode));
        if (existingId) {
          await tx
            .update(products)
            .set({ ...dbValues, updatedAt: new Date() })
            .where(and(eq(products.id, existingId), eq(products.businessId, businessId)));
          updated += 1;
        } else {
          await tx.insert(products).values(dbValues);
          created += 1;
        }
      }
    });

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: "product.imported",
      entityType: "product",
      after: { fileName, created, updated, skipped: errors.length },
    });

    return { ok: true, created, updated, skipped: errors.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not import that file." };
  }
}

/** A ready-to-fill .xlsx with the exact headings the importer understands. */
export async function getProductImportTemplate(): Promise<ActionResult & { base64?: string }> {
  const gate = await requireImportGate();
  if (!gate) return { ok: false, error: "You don't have permission to import products." };

  const { buildWorkbook } = await import("@/lib/export/workbook");
  const buffer = await buildWorkbook(
    [
      {
        name: "Products",
        headers: PRODUCT_COLUMNS.map((c) => c.heading),
        rows: TEMPLATE_EXAMPLE_ROWS,
      },
      {
        name: "How to fill this in",
        headers: ["Column", "Required", "Notes"],
        rows: PRODUCT_COLUMNS.map((c) => [c.heading, c.required ? "Yes" : "No", c.note ?? ""]),
      },
    ],
    "BillGod product import template"
  );

  return { ok: true, base64: buffer.toString("base64") };
}
