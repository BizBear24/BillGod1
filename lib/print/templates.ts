import { z } from "zod";

/**
 * The shape of a saved print design, for both the label canvas and the
 * structured invoice designer.
 *
 * Pure and shared: the designers build these objects, the renderers draw them,
 * and the server validates them with the same schemas before storing. Nothing
 * here touches the database or the DOM.
 *
 * All geometry is in millimetres, because that is what paper and label stock
 * are actually sold in. Pixels only appear at the moment of drawing.
 */

/* ------------------------------------------------------------------ Labels */

/**
 * What a label element can print.
 *
 * `field` pulls a value off the product being labelled; `text` is whatever was
 * typed. Keeping them apart is what lets one design print a whole catalogue.
 */
export const LABEL_FIELDS = [
  { key: "product.name", label: "Product name", sample: "Blue Cotton Shirt" },
  { key: "product.itemCode", label: "Item code", sample: "SKU-001" },
  { key: "product.barcode", label: "Barcode number", sample: "8901234567890" },
  { key: "product.sellingPrice", label: "Selling price", sample: "₹1000.00" },
  { key: "product.mrp", label: "MRP", sample: "₹1200.00" },
  { key: "product.unit", label: "Unit", sample: "Piece" },
  { key: "company.name", label: "Shop name", sample: "Verma Traders" },
] as const;

export type LabelFieldKey = (typeof LABEL_FIELDS)[number]["key"];

export const LABEL_ELEMENT_TYPES = ["text", "field", "barcode", "qr", "line", "box"] as const;
export type LabelElementType = (typeof LABEL_ELEMENT_TYPES)[number];

export const LABEL_ELEMENT_LABELS: Record<LabelElementType, string> = {
  text: "Text",
  field: "Product field",
  barcode: "Barcode",
  qr: "QR code",
  line: "Line",
  box: "Box",
};

export const labelElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(LABEL_ELEMENT_TYPES),
  /** Millimetres from the label's top-left corner. */
  x: z.number().min(-500).max(500),
  y: z.number().min(-500).max(500),
  w: z.number().min(0.5).max(500),
  h: z.number().min(0.5).max(500),
  /**
   * A literal for `text`, a field key for `field`, and for `barcode`/`qr` the
   * field whose value gets encoded.
   */
  value: z.string().max(300).default(""),
  fontSize: z.number().min(3).max(48).default(8),
  bold: z.boolean().default(false),
  align: z.enum(["left", "center", "right"]).default("left"),
  /** Barcode symbology; ignored by every other element type. */
  symbology: z.string().max(20).default("code128"),
  /** Whether a barcode prints its digits underneath. */
  showValue: z.boolean().default(true),
});
export type LabelElement = z.infer<typeof labelElementSchema>;

export const labelDesignSchema = z.object({
  widthMm: z.number().min(10).max(300),
  heightMm: z.number().min(10).max(300),
  /** How many labels sit across the sheet. */
  columns: z.number().int().min(1).max(12),
  gapMm: z.number().min(0).max(20),
  showBorder: z.boolean().default(true),
  elements: z.array(labelElementSchema).max(40),
});
export type LabelDesign = z.infer<typeof labelDesignSchema>;

let elementCounter = 0;
export function newElementId(): string {
  elementCounter += 1;
  return `el-${Date.now().toString(36)}-${elementCounter}`;
}

/** A sensible 50 × 25 mm shelf label, used for a brand-new design. */
export function defaultLabelDesign(): LabelDesign {
  return {
    widthMm: 50,
    heightMm: 25,
    columns: 3,
    gapMm: 2,
    showBorder: true,
    elements: [
      { id: newElementId(), type: "field", x: 2, y: 1.5, w: 46, h: 4, value: "product.name", fontSize: 8, bold: true, align: "center", symbology: "code128", showValue: true },
      { id: newElementId(), type: "barcode", x: 4, y: 6, w: 42, h: 10, value: "product.barcode", fontSize: 6, bold: false, align: "center", symbology: "code128", showValue: true },
      { id: newElementId(), type: "field", x: 2, y: 19.5, w: 46, h: 4, value: "product.sellingPrice", fontSize: 9, bold: true, align: "center", symbology: "code128", showValue: true },
    ],
  };
}

/** Fresh element of a given type, dropped near the top-left of the label. */
export function newLabelElement(type: LabelElementType, design: LabelDesign): LabelElement {
  const base = {
    id: newElementId(),
    type,
    x: Math.min(2, design.widthMm - 6),
    y: Math.min(2, design.heightMm - 4),
    fontSize: 8,
    bold: false,
    align: "left" as const,
    symbology: "code128",
    showValue: true,
  };
  switch (type) {
    case "barcode":
      return { ...base, w: Math.min(40, design.widthMm - 4), h: 10, value: "product.barcode" };
    case "qr":
      return { ...base, w: 14, h: 14, value: "product.itemCode" };
    case "field":
      return { ...base, w: Math.min(30, design.widthMm - 4), h: 4, value: "product.name" };
    case "line":
      return { ...base, w: Math.min(30, design.widthMm - 4), h: 0.5, value: "" };
    case "box":
      return { ...base, w: Math.min(20, design.widthMm - 4), h: 8, value: "" };
    default:
      return { ...base, w: Math.min(30, design.widthMm - 4), h: 4, value: "Text" };
  }
}

/* ---------------------------------------------------------------- Invoices */

export const INVOICE_PAPERS = [
  { value: "a4", label: "A4 (210 mm)", widthMm: 210 },
  { value: "a5", label: "A5 (148 mm)", widthMm: 148 },
  { value: "80mm", label: "80 mm thermal", widthMm: 80 },
  { value: "58mm", label: "58 mm thermal", widthMm: 58 },
  // Width here is only the fallback for the live preview before a shop has
  // typed their own size — the real width always comes from customWidthMm.
  { value: "custom", label: "Custom size (mm)", widthMm: 105 },
] as const;

export type InvoicePaper = (typeof INVOICE_PAPERS)[number]["value"];

/**
 * Every column an invoice line can show.
 *
 * Deliberately a fixed catalogue rather than a free canvas: line items are a
 * repeating band, and a band's columns are chosen, ordered and sized — they
 * are not dragged individually. That is also why this survives a bill running
 * onto a second page, which free-floating boxes would not.
 */
export const INVOICE_COLUMNS = [
  { key: "serial", label: "#", align: "left" as const },
  { key: "itemCode", label: "Item Code", align: "left" as const },
  { key: "name", label: "Description", align: "left" as const },
  { key: "hsn", label: "HSN", align: "left" as const },
  { key: "quantity", label: "Qty", align: "right" as const },
  { key: "unitPrice", label: "Rate", align: "right" as const },
  { key: "discountPercent", label: "Disc %", align: "right" as const },
  { key: "billDiscountAmount", label: "Bill Disc", align: "right" as const },
  { key: "taxRatePercent", label: "GST %", align: "right" as const },
  { key: "gstType", label: "GST Type", align: "left" as const },
  { key: "taxAmount", label: "GST Amt", align: "right" as const },
  { key: "lineTotal", label: "Amount", align: "right" as const },
] as const;

export type InvoiceColumnKey = (typeof INVOICE_COLUMNS)[number]["key"];

export const invoiceColumnSchema = z.object({
  key: z.enum(INVOICE_COLUMNS.map((c) => c.key) as [InvoiceColumnKey, ...InvoiceColumnKey[]]),
  /** Overrides the built-in heading; blank falls back to it. */
  label: z.string().max(30).default(""),
  visible: z.boolean().default(true),
  /** Share of the table width. Normalised across visible columns when drawn. */
  widthPercent: z.number().min(2).max(90).default(10),
});
export type InvoiceColumn = z.infer<typeof invoiceColumnSchema>;

export const invoiceDesignSchema = z.object({
  paper: z.enum(["a4", "a5", "80mm", "58mm", "custom"]),
  /** Only meaningful when paper is "custom" — e.g. 105mm for a half-A4 cut sheet. */
  customWidthMm: z.number().min(40).max(500).default(105),
  /** Blank/omitted means a continuous roll: the page just grows with the bill. */
  customHeightMm: z.number().min(40).max(1000).nullable().default(null),
  marginMm: z.number().min(0).max(30).default(8),
  /** Multiplies every font size, for shops that want a denser or larger bill. */
  fontScale: z.number().min(0.6).max(1.8).default(1),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111111"),

  title: z.string().max(40).default("TAX INVOICE"),
  showCompanyBlock: z.boolean().default(true),
  showGstin: z.boolean().default(true),
  showCustomer: z.boolean().default(true),
  showSalesperson: z.boolean().default(false),
  showCounter: z.boolean().default(false),
  headerLines: z.array(z.string().max(120)).max(6).default([]),

  columns: z.array(invoiceColumnSchema).max(INVOICE_COLUMNS.length),

  showSubtotal: z.boolean().default(true),
  showDiscount: z.boolean().default(true),
  showTax: z.boolean().default(true),
  showRoundOff: z.boolean().default(false),
  showPaid: z.boolean().default(true),
  showBalance: z.boolean().default(true),
  showLoyalty: z.boolean().default(true),
  showAmountInWords: z.boolean().default(true),

  footerLines: z.array(z.string().max(160)).max(8).default([]),
  showBarcode: z.boolean().default(true),
  showSignature: z.boolean().default(false),
  signatureLabel: z.string().max(60).default("Authorised Signatory"),
});
export type InvoiceDesign = z.infer<typeof invoiceDesignSchema>;

const DEFAULT_VISIBLE: InvoiceColumnKey[] = ["serial", "name", "quantity", "unitPrice", "discountPercent", "taxRatePercent", "lineTotal"];
const DEFAULT_WIDTHS: Partial<Record<InvoiceColumnKey, number>> = {
  serial: 5,
  itemCode: 12,
  name: 38,
  hsn: 10,
  quantity: 8,
  unitPrice: 12,
  discountPercent: 8,
  billDiscountAmount: 10,
  taxRatePercent: 8,
  gstType: 12,
  taxAmount: 10,
  lineTotal: 14,
};

export function defaultInvoiceDesign(paper: InvoicePaper = "a4"): InvoiceDesign {
  const narrow = paper === "58mm" || paper === "80mm";
  return {
    paper,
    customWidthMm: 105,
    customHeightMm: null,
    marginMm: narrow ? 2 : 8,
    fontScale: narrow ? 0.9 : 1,
    accentColor: "#111111",
    title: narrow ? "INVOICE" : "TAX INVOICE",
    showCompanyBlock: true,
    showGstin: true,
    showCustomer: true,
    showSalesperson: false,
    showCounter: false,
    headerLines: [],
    columns: INVOICE_COLUMNS.map((c) => ({
      key: c.key,
      label: "",
      // A thermal roll has no room for the wide layout, so it starts leaner.
      visible: narrow ? ["name", "quantity", "unitPrice", "lineTotal"].includes(c.key) : DEFAULT_VISIBLE.includes(c.key),
      widthPercent: DEFAULT_WIDTHS[c.key] ?? 10,
    })),
    showSubtotal: true,
    showDiscount: true,
    showTax: true,
    showRoundOff: false,
    showPaid: true,
    showBalance: true,
    showLoyalty: true,
    showAmountInWords: !narrow,
    footerLines: narrow ? ["Thank you for your business!"] : ["Goods once sold will not be taken back.", "Thank you for your business!"],
    showBarcode: true,
    showSignature: !narrow,
    signatureLabel: "Authorised Signatory",
  };
}

/** Indian numbering — a bill for ₹1,20,000 reads "One Lakh Twenty Thousand Rupees Only". */
export function amountInWords(amount: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  };

  const chunk = (n: number, suffix: string): string => (n > 0 ? `${twoDigits(n)} ${suffix} ` : "");

  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const rupees = Math.floor(absolute);
  const paise = Math.round((absolute - rupees) * 100);

  let words = "";
  if (rupees === 0) {
    words = "Zero";
  } else {
    let remaining = rupees;
    words += chunk(Math.floor(remaining / 10000000), "Crore");
    remaining %= 10000000;
    words += chunk(Math.floor(remaining / 100000), "Lakh");
    remaining %= 100000;
    words += chunk(Math.floor(remaining / 1000), "Thousand");
    remaining %= 1000;
    words += chunk(Math.floor(remaining / 100), "Hundred");
    remaining %= 100;
    if (remaining > 0) words += twoDigits(remaining);
  }

  let result = `${negative ? "Minus " : ""}${words.trim()} Rupees`;
  if (paise > 0) result += ` and ${twoDigits(paise)} Paise`;
  return `${result} Only`;
}
