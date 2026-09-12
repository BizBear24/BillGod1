"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, suppliers, categories, brands, sizes, units, colors, salespersons, doctors, taxRates, hsnCodes } from "@/db/schema";
import { requireSessionUser, getActiveMembership } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { createSupplier, updateSupplier } from "./parties";
import { createCustomer, updateCustomer } from "./parties";
import {
  createCategory, updateCategory,
  createBrand, updateBrand,
  createSize, updateSize,
  createUnit, updateUnit,
  createColor, updateColor,
  createSalesperson, updateSalesperson,
  createDoctor, updateDoctor,
  createTaxRate, updateTaxRate,
  createHsnCode, updateHsnCode,
} from "./masters";
import {
  ENTITY_IMPORT_LABELS,
  ENTITY_MATCH_KEY,
  type EntityImportKind,
  SUPPLIER_COLUMNS, SUPPLIER_TEMPLATE_ROWS,
  CUSTOMER_COLUMNS, CUSTOMER_TEMPLATE_ROWS,
  CATEGORY_COLUMNS, BRAND_COLUMNS, SIZE_COLUMNS, NAME_ONLY_TEMPLATE_ROWS,
  UNIT_COLUMNS, UNIT_TEMPLATE_ROWS,
  COLOR_COLUMNS, COLOR_TEMPLATE_ROWS,
  SALESPERSON_COLUMNS, SALESPERSON_TEMPLATE_ROWS,
  DOCTOR_COLUMNS, DOCTOR_TEMPLATE_ROWS,
  TAX_RATE_COLUMNS, TAX_RATE_TEMPLATE_ROWS,
  HSN_CODE_COLUMNS, HSN_CODE_TEMPLATE_ROWS,
  type ColorColumnKey, type CustomerColumnKey, type DoctorColumnKey, type HsnCodeColumnKey,
  type NameOnlyColumnKey, type SalespersonColumnKey, type SupplierColumnKey, type TaxRateColumnKey, type UnitColumnKey,
} from "@/lib/import/entity-configs";
import { mapGenericColumns, parseNumber, parseText, type ColumnSpec } from "@/lib/import/entity-columns";
import type { ActionResult } from "./auth";

/**
 * Generic bulk import/export for every entity simple enough to share one
 * pipeline: a flat column contract, and an existing "create + update" action
 * already validating and writing it. Only products (richer master
 * resolution) keep their own bespoke importer.
 *
 * Deliberately two-stage like the product importer: preview parses and
 * validates without writing, commit re-parses the same file and writes it
 * through the entity's own create/update action — so every row gets exactly
 * the same validation whether it came from a form or a spreadsheet.
 */

export type ImportRowIssue = { row: number; field: string; message: string };
export type ImportRowPreview = { row: number; label: string; action: "create" | "update" | "skip"; warnings: string[] };
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

type ParsedRow = { row: number; label: string; values: Record<string, unknown>; warnings: string[] };
type Db = Awaited<ReturnType<typeof getDb>>;

/** Everything kind-specific: its columns, permission, existing rows and write actions. */
type EntityConfig = {
  label: string;
  columns: ColumnSpec<string>[];
  templateRows: (string | number)[][];
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
  matchKey: string;
  loadExisting: (db: Db, businessId: string) => Promise<Map<string, string>>;
  /** Builds the value each row's create/update action expects, from mapped cells. Async so hsnCode can resolve a tax rate. */
  buildInput: (cell: (key: string) => unknown, db: Db, businessId: string) => Promise<{ value: Record<string, unknown>; label: string; warnings: string[] } | { error: string }>;
  create: (input: unknown) => Promise<ActionResult>;
  update: (id: string, input: unknown) => Promise<ActionResult>;
};

const key = (value: string) => value.trim().toLowerCase();

const textField = (cell: (k: string) => unknown, k: string) => parseText(cell(k)) || undefined;
const numberField = (cell: (k: string) => unknown, k: string): number | undefined => {
  const raw = cell(k);
  if (raw === null || raw === undefined || String(raw).trim() === "") return undefined;
  return parseNumber(raw) ?? undefined;
};

/**
 * Existing rows of one simple master, keyed by its matched column
 * (lower-cased) to its id — used to decide create vs. update per row.
 * Loosely typed on purpose: this runs against a different Drizzle table per
 * call site, and every one of them shares the same `businessId`/id/matched
 * column shape, which is all this needs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function simpleExisting(db: Db, businessId: string, table: any, idCol: any, matchCol: any): Promise<Map<string, string>> {
  const rows: { id: string; match: string }[] = await db.select({ id: idCol, match: matchCol }).from(table).where(eq(table.businessId, businessId));
  return new Map(rows.map((r) => [key(r.match), r.id]));
}

const CONFIGS: Record<EntityImportKind, EntityConfig> = {
  supplier: {
    label: ENTITY_IMPORT_LABELS.supplier,
    columns: SUPPLIER_COLUMNS as ColumnSpec<string>[],
    templateRows: SUPPLIER_TEMPLATE_ROWS,
    permission: PERMISSIONS.SUPPLIERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.supplier,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, suppliers, suppliers.id, suppliers.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies SupplierColumnKey);
      if (!name) return { error: "Name is blank." };
      return {
        label: name,
        warnings: [],
        value: {
          name,
          phone: textField(cell, "phone"),
          email: textField(cell, "email"),
          gstin: textField(cell, "gstin"),
          addressLine1: textField(cell, "addressLine1"),
          city: textField(cell, "city"),
          state: textField(cell, "state"),
          pincode: textField(cell, "pincode"),
          openingBalance: numberField(cell, "openingBalance"),
          paymentTermsDays: numberField(cell, "paymentTermsDays"),
        },
      };
    },
    create: createSupplier,
    update: updateSupplier,
  },
  customer: {
    label: ENTITY_IMPORT_LABELS.customer,
    columns: CUSTOMER_COLUMNS as ColumnSpec<string>[],
    templateRows: CUSTOMER_TEMPLATE_ROWS,
    permission: PERMISSIONS.CUSTOMERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.customer,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, customers, customers.id, customers.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies CustomerColumnKey);
      if (!name) return { error: "Name is blank." };
      const warnings: string[] = [];
      const rawType = textField(cell, "customerType")?.toLowerCase();
      const customerType = rawType === "wholesale" || rawType === "b2b" ? rawType : rawType === "retail" || !rawType ? "retail" : (warnings.push(`Type "${rawType}" not recognised — left as retail.`), "retail");
      return {
        label: name,
        warnings,
        value: {
          name,
          phone: textField(cell, "phone"),
          email: textField(cell, "email"),
          gstin: textField(cell, "gstin"),
          customerType,
          addressLine1: textField(cell, "addressLine1"),
          city: textField(cell, "city"),
          state: textField(cell, "state"),
          pincode: textField(cell, "pincode"),
          creditLimit: numberField(cell, "creditLimit"),
          openingBalance: numberField(cell, "openingBalance"),
          paymentTermsDays: numberField(cell, "paymentTermsDays"),
        },
      };
    },
    create: createCustomer,
    update: updateCustomer,
  },
  category: nameOnlyConfig("category", CATEGORY_COLUMNS as ColumnSpec<string>[], categories, createCategory, updateCategory),
  brand: nameOnlyConfig("brand", BRAND_COLUMNS as ColumnSpec<string>[], brands, createBrand, updateBrand),
  size: nameOnlyConfig("size", SIZE_COLUMNS as ColumnSpec<string>[], sizes, createSize, updateSize),
  unit: {
    label: ENTITY_IMPORT_LABELS.unit,
    columns: UNIT_COLUMNS as ColumnSpec<string>[],
    templateRows: UNIT_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.unit,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, units, units.id, units.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies UnitColumnKey);
      const shortCode = textField(cell, "shortCode");
      if (!name) return { error: "Name is blank." };
      if (!shortCode) return { error: "Short Code is blank." };
      return { label: name, warnings: [], value: { name, shortCode } };
    },
    create: createUnit,
    update: updateUnit,
  },
  color: {
    label: ENTITY_IMPORT_LABELS.color,
    columns: COLOR_COLUMNS as ColumnSpec<string>[],
    templateRows: COLOR_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.color,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, colors, colors.id, colors.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies ColorColumnKey);
      if (!name) return { error: "Name is blank." };
      return { label: name, warnings: [], value: { name, hexCode: textField(cell, "hexCode") } };
    },
    create: createColor,
    update: updateColor,
  },
  salesperson: {
    label: ENTITY_IMPORT_LABELS.salesperson,
    columns: SALESPERSON_COLUMNS as ColumnSpec<string>[],
    templateRows: SALESPERSON_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.salesperson,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, salespersons, salespersons.id, salespersons.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies SalespersonColumnKey);
      if (!name) return { error: "Name is blank." };
      return { label: name, warnings: [], value: { name, phone: textField(cell, "phone"), email: textField(cell, "email") } };
    },
    create: createSalesperson,
    update: updateSalesperson,
  },
  doctor: {
    label: ENTITY_IMPORT_LABELS.doctor,
    columns: DOCTOR_COLUMNS as ColumnSpec<string>[],
    templateRows: DOCTOR_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.doctor,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, doctors, doctors.id, doctors.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies DoctorColumnKey);
      if (!name) return { error: "Name is blank." };
      return { label: name, warnings: [], value: { name, phone: textField(cell, "phone"), clinicName: textField(cell, "clinicName") } };
    },
    create: createDoctor,
    update: updateDoctor,
  },
  taxRate: {
    label: ENTITY_IMPORT_LABELS.taxRate,
    columns: TAX_RATE_COLUMNS as ColumnSpec<string>[],
    templateRows: TAX_RATE_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.taxRate,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, taxRates, taxRates.id, taxRates.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies TaxRateColumnKey);
      if (!name) return { error: "Name is blank." };
      const ratePercent = numberField(cell, "ratePercent");
      if (ratePercent === undefined) return { error: "Rate % is blank or not a number." };
      return { label: name, warnings: [], value: { name, ratePercent, cessPercent: numberField(cell, "cessPercent") } };
    },
    create: createTaxRate,
    update: updateTaxRate,
  },
  hsnCode: {
    label: ENTITY_IMPORT_LABELS.hsnCode,
    columns: HSN_CODE_COLUMNS as ColumnSpec<string>[],
    templateRows: HSN_CODE_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: ENTITY_MATCH_KEY.hsnCode,
    loadExisting: (db, businessId) => simpleExisting(db, businessId, hsnCodes, hsnCodes.id, hsnCodes.code),
    buildInput: async (cell, db, businessId) => {
      const code = textField(cell, "code" satisfies HsnCodeColumnKey);
      if (!code) return { error: "HSN/SAC Code is blank." };
      const warnings: string[] = [];
      const rawRate = textField(cell, "taxRate");
      let taxRateId: string | undefined;
      if (rawRate) {
        const rateRows = await db.select({ id: taxRates.id, name: taxRates.name, ratePercent: taxRates.ratePercent }).from(taxRates).where(eq(taxRates.businessId, businessId));
        const rateKey = key(rawRate);
        const match = rateRows.find((r) => key(r.name) === rateKey || key(String(parseFloat(r.ratePercent))) === rateKey || key(`${parseFloat(r.ratePercent)}%`) === rateKey);
        if (match) taxRateId = match.id;
        else warnings.push(`Tax Rate "${rawRate}" does not exist — left blank.`);
      }
      return { label: code, warnings, value: { code, description: textField(cell, "description"), taxRateId } };
    },
    create: createHsnCode,
    update: updateHsnCode,
  },
};

function nameOnlyConfig(
  noun: string,
  columns: ColumnSpec<string>[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  create: (input: unknown) => Promise<ActionResult>,
  update: (id: string, input: unknown) => Promise<ActionResult>
): EntityConfig {
  return {
    label: ENTITY_IMPORT_LABELS[noun as EntityImportKind],
    columns,
    templateRows: NAME_ONLY_TEMPLATE_ROWS,
    permission: PERMISSIONS.MASTERS_MANAGE,
    matchKey: "name",
    loadExisting: (db, businessId) => simpleExisting(db, businessId, table, table.id, table.name),
    buildInput: async (cell) => {
      const name = textField(cell, "name" satisfies NameOnlyColumnKey);
      if (!name) return { error: "Name is blank." };
      return { label: name, warnings: [], value: { name } };
    },
    create,
    update,
  };
}

async function requireGate(config: EntityConfig) {
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) throw new Error("NO_ACTIVE_BUSINESS");
  if (!can(membership.role, config.permission)) return null;
  return { sessionUser, membership };
}

async function parseFile(config: EntityConfig, db: Db, businessId: string, base64: string, fileName: string) {
  const { readSpreadsheet } = await import("@/lib/import/spreadsheet");
  const { headers, rows, sheetName } = await readSpreadsheet(Buffer.from(base64, "base64"), fileName);

  const mapping = mapGenericColumns(headers, config.columns);
  if (mapping.missingRequired.length > 0) {
    const labels = mapping.missingRequired.map((k) => config.columns.find((c) => c.key === k)?.heading ?? k);
    throw new Error(`The file is missing required column(s): ${labels.join(", ")}.`);
  }

  const errors: ImportRowIssue[] = [];
  const parsed: ParsedRow[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2;
    const row = rows[i];
    const cell = (k: string) => {
      const index = mapping.byKey[k];
      return index === undefined ? null : row[index];
    };

    const built = await config.buildInput(cell, db, businessId);
    if ("error" in built) {
      errors.push({ row: sheetRow, field: config.columns[0]?.heading ?? "Name", message: built.error });
      continue;
    }
    const dupeOf = seen.get(key(built.label));
    if (dupeOf) {
      errors.push({ row: sheetRow, field: config.matchKey, message: `"${built.label}" also appears on row ${dupeOf}.` });
      continue;
    }
    seen.set(key(built.label), sheetRow);
    parsed.push({ row: sheetRow, label: built.label, values: built.value, warnings: built.warnings });
  }

  return { sheetName, parsed, errors, unknownHeadings: mapping.unknownHeadings };
}

export async function previewEntityImport(kind: EntityImportKind, base64: string, fileName: string): Promise<ImportPreview | { ok: false; error: string }> {
  const config = CONFIGS[kind];
  const gate = await requireGate(config);
  if (!gate) return { ok: false, error: `You don't have permission to import ${config.label.toLowerCase()}.` };

  try {
    const db = await getDb();
    const businessId = gate.membership.businessId;
    const { sheetName, parsed, errors, unknownHeadings } = await parseFile(config, db, businessId, base64, fileName);
    const existing = await config.loadExisting(db, businessId);

    const rows: ImportRowPreview[] = parsed.map((p) => ({
      row: p.row,
      label: p.label,
      action: existing.has(key(p.label)) ? "update" : "create",
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

export async function commitEntityImport(kind: EntityImportKind, base64: string, fileName: string): Promise<ImportOutcome> {
  const config = CONFIGS[kind];
  const gate = await requireGate(config);
  if (!gate) return { ok: false, error: `You don't have permission to import ${config.label.toLowerCase()}.` };

  try {
    const db = await getDb();
    const businessId = gate.membership.businessId;
    const { parsed, errors } = await parseFile(config, db, businessId, base64, fileName);
    if (parsed.length === 0) return { ok: false, error: "No valid rows to import." };

    const existing = await config.loadExisting(db, businessId);
    let created = 0;
    let updated = 0;
    let skipped = errors.length;

    for (const entry of parsed) {
      const existingId = existing.get(key(entry.label));
      const result = existingId ? await config.update(existingId, entry.values) : await config.create(entry.values);
      if (!result.ok) {
        skipped += 1;
        continue;
      }
      if (existingId) updated += 1;
      else created += 1;
    }

    await logAudit({
      businessId,
      userId: gate.sessionUser.userId,
      action: `${kind}.imported`,
      entityType: kind,
      after: { fileName, created, updated, skipped },
    });

    return { ok: true, created, updated, skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not import that file." };
  }
}

/** A ready-to-fill .xlsx with the exact headings this entity's importer understands. */
export async function getEntityImportTemplate(kind: EntityImportKind): Promise<ActionResult & { base64?: string }> {
  const config = CONFIGS[kind];
  const gate = await requireGate(config);
  if (!gate) return { ok: false, error: `You don't have permission to import ${config.label.toLowerCase()}.` };

  const { buildWorkbook } = await import("@/lib/export/workbook");
  const buffer = await buildWorkbook(
    [
      { name: config.label.slice(0, 31), headers: config.columns.map((c) => c.heading), rows: config.templateRows },
      {
        name: "How to fill this in",
        headers: ["Column", "Required", "Notes"],
        rows: config.columns.map((c) => [c.heading, c.required ? "Yes" : "No", c.note ?? ""]),
      },
    ],
    `BillGod ${config.label.toLowerCase()} import template`
  );

  return { ok: true, base64: buffer.toString("base64") };
}

/** All existing rows of this kind as a downloadable .xlsx, in the same column order as the import template. */
export async function exportEntityData(kind: EntityImportKind): Promise<ActionResult & { base64?: string }> {
  const config = CONFIGS[kind];
  const sessionUser = await requireSessionUser();
  const membership = await getActiveMembership(sessionUser);
  if (!membership) return { ok: false, error: "No active business." };
  // Exporting what already exists only needs to see it, not change it.
  const viewPermission = (config.permission.replace(".manage", ".view") as (typeof PERMISSIONS)[keyof typeof PERMISSIONS]);
  if (!can(membership.role, viewPermission) && !can(membership.role, config.permission)) {
    return { ok: false, error: `You don't have permission to view ${config.label.toLowerCase()}.` };
  }

  const db = await getDb();
  const businessId = membership.businessId;
  const rows = await exportRowsFor(kind, db, businessId);

  const { buildWorkbook } = await import("@/lib/export/workbook");
  const buffer = await buildWorkbook(
    [{ name: config.label.slice(0, 31), headers: config.columns.map((c) => c.heading), rows }],
    `BillGod ${config.label.toLowerCase()} export`
  );
  return { ok: true, base64: buffer.toString("base64") };
}

async function exportRowsFor(kind: EntityImportKind, db: Db, businessId: string): Promise<(string | number | null)[][]> {
  const asRows = <T extends Record<string, unknown>>(items: T[], keys: (keyof T)[]) =>
    items.map((item) => keys.map((k) => (item[k] === null || item[k] === undefined ? "" : (item[k] as string | number))));

  switch (kind) {
    case "supplier": {
      const rows = await db.select().from(suppliers).where(eq(suppliers.businessId, businessId));
      return asRows(rows, ["name", "phone", "email", "gstin", "addressLine1", "city", "state", "pincode", "openingBalance", "paymentTermsDays"]);
    }
    case "customer": {
      const rows = await db.select().from(customers).where(eq(customers.businessId, businessId));
      return asRows(rows, ["name", "phone", "email", "gstin", "customerType", "addressLine1", "city", "state", "pincode", "creditLimit", "openingBalance", "paymentTermsDays"]);
    }
    case "category":
      return asRows(await db.select().from(categories).where(eq(categories.businessId, businessId)), ["name"]);
    case "brand":
      return asRows(await db.select().from(brands).where(eq(brands.businessId, businessId)), ["name"]);
    case "size":
      return asRows(await db.select().from(sizes).where(eq(sizes.businessId, businessId)), ["name"]);
    case "unit":
      return asRows(await db.select().from(units).where(eq(units.businessId, businessId)), ["name", "shortCode"]);
    case "color":
      return asRows(await db.select().from(colors).where(eq(colors.businessId, businessId)), ["name", "hexCode"]);
    case "salesperson":
      return asRows(await db.select().from(salespersons).where(eq(salespersons.businessId, businessId)), ["name", "phone", "email"]);
    case "doctor":
      return asRows(await db.select().from(doctors).where(eq(doctors.businessId, businessId)), ["name", "phone", "clinicName"]);
    case "taxRate":
      return asRows(await db.select().from(taxRates).where(eq(taxRates.businessId, businessId)), ["name", "ratePercent", "cessPercent"]);
    case "hsnCode": {
      const rows = await db
        .select({ code: hsnCodes.code, description: hsnCodes.description, ratePercent: taxRates.ratePercent })
        .from(hsnCodes)
        .leftJoin(taxRates, eq(hsnCodes.taxRateId, taxRates.id))
        .where(eq(hsnCodes.businessId, businessId));
      return rows.map((r) => [r.code, r.description ?? "", r.ratePercent ?? ""]);
    }
    default:
      return [];
  }
}
