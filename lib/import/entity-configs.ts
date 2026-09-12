import type { ColumnSpec } from "./entity-columns";

/**
 * Column contracts for every entity that gets the generic bulk
 * import/export/template treatment (Suppliers, Customers, and the simple
 * masters). Products has its own richer, purpose-built importer
 * (`lib/import/product-columns.ts`) and is not part of this list.
 */

export const ENTITY_IMPORT_KINDS = [
  "supplier",
  "customer",
  "category",
  "brand",
  "size",
  "unit",
  "color",
  "salesperson",
  "doctor",
  "taxRate",
  "hsnCode",
] as const;
export type EntityImportKind = (typeof ENTITY_IMPORT_KINDS)[number];

export const ENTITY_IMPORT_LABELS: Record<EntityImportKind, string> = {
  supplier: "Suppliers",
  customer: "Customers",
  category: "Categories",
  brand: "Brands",
  size: "Sizes",
  unit: "Units",
  color: "Colors",
  salesperson: "Salespersons",
  doctor: "Doctors",
  taxRate: "Tax Rates",
  hsnCode: "HSN Codes",
};

/** The column this entity is matched on: an existing row with the same value is updated, not duplicated. */
export const ENTITY_MATCH_KEY: Record<EntityImportKind, string> = {
  supplier: "name",
  customer: "name",
  category: "name",
  brand: "name",
  size: "name",
  unit: "name",
  color: "name",
  salesperson: "name",
  doctor: "name",
  taxRate: "name",
  hsnCode: "code",
};

export type SupplierColumnKey = "name" | "phone" | "email" | "gstin" | "addressLine1" | "city" | "state" | "pincode" | "openingBalance" | "paymentTermsDays";
export const SUPPLIER_COLUMNS: ColumnSpec<SupplierColumnKey>[] = [
  { key: "name", heading: "Name", aliases: ["supplier name", "supplier"], required: true, kind: "text" },
  { key: "phone", heading: "Phone", aliases: ["mobile", "contact"], kind: "text" },
  { key: "email", heading: "Email", aliases: [], kind: "text" },
  { key: "gstin", heading: "GSTIN", aliases: ["gst no", "gst number"], kind: "text" },
  { key: "addressLine1", heading: "Address", aliases: ["address line 1"], kind: "text" },
  { key: "city", heading: "City", aliases: [], kind: "text" },
  { key: "state", heading: "State", aliases: [], kind: "text" },
  { key: "pincode", heading: "Pincode", aliases: ["pin", "zip"], kind: "text" },
  { key: "openingBalance", heading: "Opening Balance", aliases: ["opening bal"], kind: "number" },
  { key: "paymentTermsDays", heading: "Payment Terms (days)", aliases: ["payment terms", "credit days"], kind: "number" },
];
export const SUPPLIER_TEMPLATE_ROWS: (string | number)[][] = [
  ["Raj Distributors", "9000000001", "raj@distributors.example", "22AAAAA0000A1Z5", "12 MG Road", "Bengaluru", "Karnataka", "560001", 0, 30],
];

export type CustomerColumnKey = "name" | "phone" | "email" | "gstin" | "customerType" | "addressLine1" | "city" | "state" | "pincode" | "creditLimit" | "openingBalance" | "paymentTermsDays";
export const CUSTOMER_COLUMNS: ColumnSpec<CustomerColumnKey>[] = [
  { key: "name", heading: "Name", aliases: ["customer name", "customer"], required: true, kind: "text" },
  { key: "phone", heading: "Phone", aliases: ["mobile", "contact"], kind: "text" },
  { key: "email", heading: "Email", aliases: [], kind: "text" },
  { key: "gstin", heading: "GSTIN", aliases: ["gst no", "gst number"], kind: "text" },
  { key: "customerType", heading: "Type", aliases: ["customer type"], kind: "text", note: "retail, wholesale or b2b. Blank = retail." },
  { key: "addressLine1", heading: "Address", aliases: ["address line 1"], kind: "text" },
  { key: "city", heading: "City", aliases: [], kind: "text" },
  { key: "state", heading: "State", aliases: [], kind: "text" },
  { key: "pincode", heading: "Pincode", aliases: ["pin", "zip"], kind: "text" },
  { key: "creditLimit", heading: "Credit Limit", aliases: [], kind: "number" },
  { key: "openingBalance", heading: "Opening Balance", aliases: ["opening bal"], kind: "number" },
  { key: "paymentTermsDays", heading: "Payment Terms (days)", aliases: ["payment terms", "credit days"], kind: "number" },
];
export const CUSTOMER_TEMPLATE_ROWS: (string | number)[][] = [
  ["Anita Sharma", "9000000002", "anita@example.com", "", "retail", "14 Park Street", "Mumbai", "Maharashtra", "400001", 0, 0, 0],
];

export type NameOnlyColumnKey = "name";
const nameOnlyColumns = (noun: string): ColumnSpec<NameOnlyColumnKey>[] => [
  { key: "name", heading: "Name", aliases: [noun], required: true, kind: "text" },
];
export const CATEGORY_COLUMNS = nameOnlyColumns("category");
export const BRAND_COLUMNS = nameOnlyColumns("brand");
export const SIZE_COLUMNS = nameOnlyColumns("size");
export const NAME_ONLY_TEMPLATE_ROWS: (string | number)[][] = [["Example One"], ["Example Two"]];

export type UnitColumnKey = "name" | "shortCode";
export const UNIT_COLUMNS: ColumnSpec<UnitColumnKey>[] = [
  { key: "name", heading: "Name", aliases: ["unit name"], required: true, kind: "text" },
  { key: "shortCode", heading: "Short Code", aliases: ["uom", "code", "abbreviation"], required: true, kind: "text" },
];
export const UNIT_TEMPLATE_ROWS: (string | number)[][] = [["Piece", "PCS"], ["Kilogram", "KG"]];

export type ColorColumnKey = "name" | "hexCode";
export const COLOR_COLUMNS: ColumnSpec<ColorColumnKey>[] = [
  { key: "name", heading: "Name", aliases: ["color name", "colour", "colour name"], required: true, kind: "text" },
  { key: "hexCode", heading: "Hex Code", aliases: ["hex", "color code"], kind: "text", note: "e.g. #1E40AF. Optional." },
];
export const COLOR_TEMPLATE_ROWS: (string | number)[][] = [["Blue", "#1E40AF"], ["Red", "#DC2626"]];

export type SalespersonColumnKey = "name" | "phone" | "email";
export const SALESPERSON_COLUMNS: ColumnSpec<SalespersonColumnKey>[] = [
  { key: "name", heading: "Name", aliases: [], required: true, kind: "text" },
  { key: "phone", heading: "Phone", aliases: ["mobile"], kind: "text" },
  { key: "email", heading: "Email", aliases: [], kind: "text" },
];
export const SALESPERSON_TEMPLATE_ROWS: (string | number)[][] = [["Ramesh Kumar", "9000000003", "ramesh@example.com"]];

export type DoctorColumnKey = "name" | "phone" | "clinicName";
export const DOCTOR_COLUMNS: ColumnSpec<DoctorColumnKey>[] = [
  { key: "name", heading: "Name", aliases: ["doctor name"], required: true, kind: "text" },
  { key: "phone", heading: "Phone", aliases: ["mobile"], kind: "text" },
  { key: "clinicName", heading: "Clinic Name", aliases: ["clinic", "hospital"], kind: "text" },
];
export const DOCTOR_TEMPLATE_ROWS: (string | number)[][] = [["Dr. Priya Nair", "9000000004", "City Clinic"]];

export type TaxRateColumnKey = "name" | "ratePercent" | "cessPercent";
export const TAX_RATE_COLUMNS: ColumnSpec<TaxRateColumnKey>[] = [
  { key: "name", heading: "Name", aliases: ["tax name", "rate name"], required: true, kind: "text" },
  { key: "ratePercent", heading: "Rate %", aliases: ["gst", "gst %", "rate"], required: true, kind: "number" },
  { key: "cessPercent", heading: "Cess %", aliases: ["cess"], kind: "number" },
];
export const TAX_RATE_TEMPLATE_ROWS: (string | number)[][] = [["GST 5%", 5, 0], ["GST 18%", 18, 0]];

export type HsnCodeColumnKey = "code" | "description" | "taxRate";
export const HSN_CODE_COLUMNS: ColumnSpec<HsnCodeColumnKey>[] = [
  { key: "code", heading: "HSN/SAC Code", aliases: ["hsn", "sac", "code"], required: true, kind: "text" },
  { key: "description", heading: "Description", aliases: ["desc"], kind: "text" },
  { key: "taxRate", heading: "Tax Rate %", aliases: ["gst", "gst %", "tax %"], kind: "text", note: "A percentage (18) or a rate name. Must already exist under Tax Rates." },
];
export const HSN_CODE_TEMPLATE_ROWS: (string | number)[][] = [["6205", "Shirts", 5], ["8528", "Televisions", 18]];
