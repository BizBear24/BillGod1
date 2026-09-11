import { z } from "zod";
import { optionalNumber, optionalText } from "./common";

export const CUSTOMER_TYPES = ["retail", "wholesale", "b2b"] as const;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: optionalText,
  email: optionalText,
  gstin: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  state: optionalText,
  pincode: optionalText,
  customerType: z.enum(CUSTOMER_TYPES).default("retail"),
  creditLimit: optionalNumber(z.coerce.number().min(0)),
  openingBalance: optionalNumber(z.coerce.number()),
  paymentTermsDays: optionalNumber(z.coerce.number().min(0)),
  /**
   * The referral code the customer was given by a friend. Not a column on the
   * customer — it is looked up and turned into a referral record on create.
   */
  referredByCode: optionalText.transform((v) => (v ? v.toUpperCase() : undefined)),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: optionalText,
  email: optionalText,
  gstin: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  state: optionalText,
  pincode: optionalText,
  openingBalance: optionalNumber(z.coerce.number()),
  paymentTermsDays: optionalNumber(z.coerce.number().min(0)),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
