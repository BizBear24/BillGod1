/**
 * The column contract for a product import.
 *
 * Real spreadsheets come from wherever the shop's old software exported them,
 * so headings are matched loosely — case, spaces, underscores and a handful of
 * common synonyms all resolve to the same field. Anything unrecognised is
 * reported back rather than silently dropped.
 *
 * Shared by the server (which does the importing) and the client (which shows
 * the template and the mapping), so it stays pure.
 */

export type ProductColumnKey =
  | "itemCode"
  | "name"
  | "description"
  | "category"
  | "brand"
  | "unit"
  | "size"
  | "color"
  | "hsnCode"
  | "taxRate"
  | "barcode"
  | "purchasePrice"
  | "sellingPrice"
  | "mrp"
  | "wholesalePrice"
  | "openingStock"
  | "minStock"
  | "reorderLevel"
  | "trackBatch"
  | "trackExpiry"
  | "trackSerial"
  | "imageUrl";

export type ProductColumnSpec = {
  key: ProductColumnKey;
  /** The heading written into the downloadable template. */
  heading: string;
  aliases: string[];
  required?: boolean;
  kind: "text" | "number" | "boolean";
  note?: string;
};

export const PRODUCT_COLUMNS: ProductColumnSpec[] = [
  { key: "itemCode", heading: "Item Code", aliases: ["sku", "code", "itemcode", "item no", "product code"], required: true, kind: "text",
    note: "Unique per shop. A row whose code already exists updates that product." },
  { key: "name", heading: "Product Name", aliases: ["name", "product", "item name", "description name"], required: true, kind: "text" },
  { key: "description", heading: "Description", aliases: ["desc", "details"], kind: "text" },
  { key: "category", heading: "Category", aliases: ["group", "category name"], kind: "text", note: "Matched by name." },
  { key: "brand", heading: "Brand", aliases: ["make", "manufacturer"], kind: "text", note: "Matched by name." },
  { key: "unit", heading: "Unit", aliases: ["uom", "unit of measure", "unit name"], kind: "text", note: "Matched by name or short code." },
  { key: "size", heading: "Size", aliases: [], kind: "text", note: "Matched by name; must already exist." },
  { key: "color", heading: "Color", aliases: ["colour"], kind: "text", note: "Matched by name; must already exist." },
  { key: "hsnCode", heading: "HSN Code", aliases: ["hsn", "hsn/sac", "sac"], kind: "text", note: "Matched by code; must already exist." },
  { key: "taxRate", heading: "Tax Rate %", aliases: ["gst", "gst %", "tax", "tax %", "gst rate", "tax rate"], kind: "text",
    note: "A percentage (18) or a rate name (GST 18%). Must already exist." },
  { key: "barcode", heading: "Barcode", aliases: ["ean", "upc", "barcode no"], kind: "text" },
  { key: "purchasePrice", heading: "Purchase Price", aliases: ["cost", "cost price", "buy price", "purchase rate"], kind: "number" },
  { key: "sellingPrice", heading: "Selling Price", aliases: ["price", "sale price", "rate", "selling rate"], kind: "number" },
  { key: "mrp", heading: "MRP", aliases: ["max retail price", "list price"], kind: "number" },
  { key: "wholesalePrice", heading: "Wholesale Price", aliases: ["wholesale", "bulk price"], kind: "number" },
  { key: "openingStock", heading: "Opening Stock", aliases: ["opening qty", "opening", "stock"], kind: "number" },
  { key: "minStock", heading: "Min Stock", aliases: ["minimum stock", "min qty"], kind: "number" },
  { key: "reorderLevel", heading: "Reorder Level", aliases: ["reorder", "reorder qty"], kind: "number" },
  { key: "trackBatch", heading: "Track Batch", aliases: ["batch", "batch tracking"], kind: "boolean", note: "Yes / No." },
  { key: "trackExpiry", heading: "Track Expiry", aliases: ["expiry", "expiry tracking"], kind: "boolean", note: "Yes / No." },
  { key: "trackSerial", heading: "Track Serial", aliases: ["serial", "serial tracking", "imei"], kind: "boolean", note: "Yes / No." },
  { key: "imageUrl", heading: "Photo", aliases: ["image", "image url", "photo url", "picture", "picture url", "img"], kind: "text",
    note: "Either paste a direct link to a hosted photo (https://...), or drag an actual picture on top of this cell in Excel — both work, and the picture wins if a row has both." },
];

/** Lower-cased, stripped of spaces, underscores, dots and dashes. */
export function normaliseHeading(heading: string): string {
  return heading.toLowerCase().replace(/[\s_.\-/]+/g, "");
}

const LOOKUP: Map<string, ProductColumnKey> = (() => {
  const map = new Map<string, ProductColumnKey>();
  for (const column of PRODUCT_COLUMNS) {
    map.set(normaliseHeading(column.heading), column.key);
    map.set(normaliseHeading(column.key), column.key);
    for (const alias of column.aliases) map.set(normaliseHeading(alias), column.key);
  }
  return map;
})();

export type ColumnMapping = {
  /** Column index in the sheet for each recognised field. */
  byKey: Partial<Record<ProductColumnKey, number>>;
  /** Headings the importer did not recognise, reported back to the user. */
  unknownHeadings: string[];
  missingRequired: ProductColumnKey[];
};

export function mapColumns(headers: string[]): ColumnMapping {
  const byKey: Partial<Record<ProductColumnKey, number>> = {};
  const unknownHeadings: string[] = [];

  headers.forEach((heading, index) => {
    if (!heading.trim()) return;
    const key = LOOKUP.get(normaliseHeading(heading));
    // First column wins, so a duplicated heading does not quietly shadow the one before it.
    if (key && byKey[key] === undefined) byKey[key] = index;
    else if (!key) unknownHeadings.push(heading);
  });

  const missingRequired = PRODUCT_COLUMNS.filter((c) => c.required && byKey[c.key] === undefined).map((c) => c.key);
  return { byKey, unknownHeadings, missingRequired };
}

const TRUTHY = new Set(["y", "yes", "true", "1", "t", "haan", "on"]);
const FALSY = new Set(["", "n", "no", "false", "0", "f", "off"]);

export function parseBoolean(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw;
  const text = String(raw).trim().toLowerCase();
  if (TRUTHY.has(text)) return true;
  if (FALSY.has(text)) return false;
  return null;
}

/** Tolerates "₹1,200.50", "1 200", and stray spaces — all common in exports. */
export function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw).replace(/[₹,\s]/g, "").trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function parseText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).trim();
}

/** One example row for the downloadable template, so the format is self-explaining. */
export const TEMPLATE_EXAMPLE_ROWS: (string | number)[][] = [
  ["SKU-0001", "Blue Cotton Shirt", "Full sleeve, regular fit", "Apparel", "Raymond", "Piece", "M", "Blue", "6205", 5, "8901234567890", 400, 1000, 1200, 900, 25, 5, 10, "No", "No", "No", "https://example.com/photos/blue-shirt.jpg"],
  ["SKU-0002", "55 inch LED TV", "", "Electronics", "Sony", "Piece", "", "", "8528", 18, "", 30000, 45000, 50000, "", 3, 1, 2, "No", "No", "Yes", ""],
];
