import { z } from "zod";

export const CUSTOMER_TYPES = ["retail", "wholesale", "b2b"] as const;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  customerType: z.enum(CUSTOMER_TYPES).default("retail"),
  creditLimit: z.coerce.number().min(0).optional(),
  openingBalance: z.coerce.number().optional(),
  paymentTermsDays: z.coerce.number().min(0).optional(),
  /**
   * The referral code the customer was given by a friend. Not a column on the
   * customer — it is looked up and turned into a referral record on create.
   */
  referredByCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  openingBalance: z.coerce.number().optional(),
  paymentTermsDays: z.coerce.number().min(0).optional(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
