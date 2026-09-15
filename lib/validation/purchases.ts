import { z } from "zod";
import { GST_TYPES } from "./common";

export { GST_TYPES, GST_TYPE_LABELS } from "./common";

export const PURCHASE_DOC_TYPES = ["purchase_order", "purchase", "purchase_return"] as const;
export const PURCHASE_DOC_TYPE_LABELS: Record<(typeof PURCHASE_DOC_TYPES)[number], string> = {
  purchase_order: "Purchase Order",
  purchase: "Purchase",
  purchase_return: "Purchase Return",
};

export const PURCHASE_PAYMENT_METHODS = ["cash", "upi", "card", "credit"] as const;
export const PURCHASE_PAYMENT_METHOD_LABELS: Record<(typeof PURCHASE_PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit (on account)",
};

export const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  itemCode: z.string().min(1),
  name: z.string().min(1),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitCost: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
  /** Decided per item, not per document — a receipt can mix in-state and out-of-state lines. */
  gstType: z.enum(GST_TYPES).default("cgst_sgst"),
  batchNumber: z.string().trim().optional(),
  expiryDate: z.string().trim().optional(),
  serialNumbers: z.string().trim().optional(),
});
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;

export const purchasePaymentSchema = z.object({
  method: z.enum(PURCHASE_PAYMENT_METHODS),
  amount: z.coerce.number().min(0),
});
export type PurchasePaymentInput = z.infer<typeof purchasePaymentSchema>;

export const createPurchaseSchema = z.object({
  docType: z.enum(PURCHASE_DOC_TYPES).default("purchase"),
  isDraft: z.boolean().optional(),
  warehouseId: z.string().optional(),
  /** The purchase a return is raised against, so it can be validated against what was actually received. */
  originalPurchaseId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : undefined)),
  supplierId: z.string().min(1, "Select a supplier"),
  supplierInvoiceNumber: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(purchaseItemSchema).min(1, "Add at least one item"),
  payments: z.array(purchasePaymentSchema).optional(),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
