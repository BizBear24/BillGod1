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
  /** Default GST split for this product on a purchase line — still overridable per line. */
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
