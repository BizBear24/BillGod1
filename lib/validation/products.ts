import { z } from "zod";
import { optionalId, optionalNumber, optionalText, GST_TYPES } from "./common";

export const productSchema = z.object({
  itemCode: z.string().trim().min(1, "Enter an item code"),
  name: z.string().trim().min(1, "Enter a product name"),
  description: optionalText,

  categoryId: optionalId,
  sectionId: optionalId,
  subsectionId: optionalId,
  brandId: optionalId,
  unitId: optionalId,
  sizeId: optionalId,
  colorId: optionalId,
  hsnId: optionalId,
  taxRateId: optionalId,
  /** IGST vs CGST+SGST for this product's tax rate — a rate can be either depending on the transaction, so it's picked here, not on the Tax Rate master. */
  gstType: z.enum(GST_TYPES).default("cgst_sgst"),

  barcode: optionalText,
  purchasePrice: optionalNumber(z.coerce.number().min(0)),
  sellingPrice: optionalNumber(z.coerce.number().min(0)),
  mrp: optionalNumber(z.coerce.number().min(0)),
  wholesalePrice: optionalNumber(z.coerce.number().min(0)),
  /** A standing discount this product always gets at billing time (spec: "discount on items in general"). */
  defaultDiscountPercent: optionalNumber(z.coerce.number().min(0).max(100)),

  openingStock: optionalNumber(z.coerce.number()),
  minStock: optionalNumber(z.coerce.number()),
  reorderLevel: optionalNumber(z.coerce.number()),

  trackBatch: z.coerce.boolean().optional(),
  trackExpiry: z.coerce.boolean().optional(),
  trackSerial: z.coerce.boolean().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;
