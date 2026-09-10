import { z } from "zod";

export const createBusinessSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name"),
  currency: z.string().trim().min(1, "Enter a currency code"),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, "Enter a company name"),
  gstin: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const createBranchSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().trim().min(2, "Enter a branch name"),
  addressLine1: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const counterSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a counter name"),
});
export type CounterInput = z.infer<typeof counterSchema>;

export const BUSINESS_TYPES = [
  "Kirana / Grocery",
  "Apparel",
  "Footwear",
  "Electronics",
  "Hardware",
  "Stationery",
  "Bakery",
  "General Retail",
  "Distributor / Wholesale",
  "Other",
] as const;
