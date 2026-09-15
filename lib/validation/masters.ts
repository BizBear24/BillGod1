import { z } from "zod";
import { optionalId, optionalNumber, optionalText, GST_TYPES } from "./common";

export const nameOnlySchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
});
export type NameOnlyInput = z.infer<typeof nameOnlySchema>;

export const categorySchema = nameOnlySchema;
export const brandSchema = nameOnlySchema;
export const sizeSchema = nameOnlySchema;

export const sectionSchema = nameOnlySchema;
export const subsectionSchema = z.object({
  sectionId: z.string().min(1, "Select a section"),
  name: z.string().trim().min(1, "Enter a name"),
});
export type SubsectionInput = z.infer<typeof subsectionSchema>;

export const unitSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  shortCode: z.string().trim().min(1, "Enter a short code"),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const colorSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  hexCode: optionalText,
});
export type ColorInput = z.infer<typeof colorSchema>;

export const rackSchema = z.object({
  warehouseId: z.string().min(1, "Select a warehouse"),
  name: z.string().trim().min(1, "Enter a name"),
});
export type RackInput = z.infer<typeof rackSchema>;

export const salespersonSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: optionalText,
  email: optionalText,
});
export type SalespersonInput = z.infer<typeof salespersonSchema>;

export const doctorSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: optionalText,
  clinicName: optionalText,
});
export type DoctorInput = z.infer<typeof doctorSchema>;

export const taxRateSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  ratePercent: z.coerce.number().min(0).max(100),
  cessPercent: optionalNumber(z.coerce.number().min(0).max(100)),
  /** Every rate is inevitably IGST or CGST+SGST — only the percent is what varies per rate. */
  gstType: z.enum(GST_TYPES).default("cgst_sgst"),
});
export type TaxRateInput = z.infer<typeof taxRateSchema>;

export const hsnCodeSchema = z.object({
  code: z.string().trim().min(1, "Enter an HSN/SAC code"),
  description: optionalText,
  taxRateId: optionalId,
});
export type HsnCodeInput = z.infer<typeof hsnCodeSchema>;
