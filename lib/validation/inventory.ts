import { z } from "zod";

export const transferItemSchema = z.object({
  productId: z.string().min(1),
  itemCode: z.string().min(1),
  name: z.string().min(1),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  batchNumber: z.string().trim().optional(),
});
export type TransferItemInput = z.infer<typeof transferItemSchema>;

export const createTransferSchema = z
  .object({
    fromWarehouseId: z.string().min(1, "Select a source warehouse"),
    toWarehouseId: z.string().min(1, "Select a destination warehouse"),
    notes: z.string().trim().optional(),
    items: z.array(transferItemSchema).min(1, "Add at least one item"),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "Source and destination warehouses must be different",
    path: ["toWarehouseId"],
  });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const adjustmentItemSchema = z.object({
  productId: z.string().min(1),
  itemCode: z.string().min(1),
  name: z.string().min(1),
  quantityDelta: z.coerce.number().refine((n) => n !== 0, "Enter a non-zero quantity"),
  batchNumber: z.string().trim().optional(),
});
export type AdjustmentItemInput = z.infer<typeof adjustmentItemSchema>;

export const ADJUSTMENT_REASONS = ["stock_take", "damaged", "lost", "found", "other"] as const;
export const ADJUSTMENT_REASON_LABELS: Record<(typeof ADJUSTMENT_REASONS)[number], string> = {
  stock_take: "Stock Take / Recount",
  damaged: "Damaged",
  lost: "Lost / Theft",
  found: "Found",
  other: "Other",
};

export const createAdjustmentSchema = z.object({
  warehouseId: z.string().min(1, "Select a warehouse"),
  reason: z.enum(ADJUSTMENT_REASONS),
  notes: z.string().trim().optional(),
  items: z.array(adjustmentItemSchema).min(1, "Add at least one item"),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
