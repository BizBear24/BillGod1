import { z } from "zod";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined));

export const productSchema = z.object({
  itemCode: z.string().trim().min(1, "Enter an item code"),
  name: z.string().trim().min(1, "Enter a product name"),
  description: z.string().trim().optional(),

  categoryId: optionalId,
  sectionId: optionalId,
  subsectionId: optionalId,
  brandId: optionalId,
  unitId: optionalId,
  sizeId: optionalId,
  colorId: optionalId,
  hsnId: optionalId,
  taxRateId: optionalId,

  barcode: z.string().trim().optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).optional(),
  wholesalePrice: z.coerce.number().min(0).optional(),

  openingStock: z.coerce.number().optional(),
  minStock: z.coerce.number().optional(),
  reorderLevel: z.coerce.number().optional(),

  trackBatch: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  trackSerial: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;
