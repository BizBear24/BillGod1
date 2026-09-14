import { z } from "zod";

export const SALE_DOC_TYPES = ["sale", "sale_return", "quotation", "estimate", "sale_order", "challan"] as const;
export const SALE_DOC_TYPE_LABELS: Record<(typeof SALE_DOC_TYPES)[number], string> = {
  sale: "Sale",
  sale_return: "Sale Return",
  quotation: "Quotation",
  estimate: "Estimate",
  sale_order: "Sale Order",
  challan: "Challan",
};

export const SALE_PAYMENT_METHODS = ["cash", "upi", "card", "credit"] as const;
export const SALE_PAYMENT_METHOD_LABELS: Record<(typeof SALE_PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit (on account)",
};

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  itemCode: z.string().min(1),
  name: z.string().min(1),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
  /** Free text for serial-tracked products; the server parses and verifies it. */
  serialNumbers: z.string().trim().optional(),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

export const salePaymentSchema = z.object({
  method: z.enum(SALE_PAYMENT_METHODS),
  amount: z.coerce.number().min(0),
});
export type SalePaymentInput = z.infer<typeof salePaymentSchema>;

export const createSaleSchema = z.object({
  docType: z.enum(SALE_DOC_TYPES).default("sale"),
  isDraft: z.boolean().optional(),
  warehouseId: z.string().optional(),
  counterId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : undefined)),
  /** The bill a return is raised against, so its loyalty points can be reversed exactly. */
  originalSaleId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : undefined)),
  customerId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "walkin" ? v : undefined)),
  salespersonId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : undefined)),
  notes: z.string().trim().optional(),
  /**
   * Only the code the cashier typed. What it is worth is decided server-side
   * against the coupon's own rules, never sent from the client.
   */
  couponCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  /** Loyalty points the customer is spending on this bill. */
  redeemPoints: z.coerce.number().int().min(0).optional(),
  /** A manual "% off everything" the cashier typed in, on top of any loyalty tier discount. */
  billDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  items: z.array(saleItemSchema).min(1, "Add at least one item"),
  payments: z.array(salePaymentSchema).optional(),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
