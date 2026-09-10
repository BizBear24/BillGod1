import { z } from "zod";

export const loyaltySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  pointsPerCurrency: z.coerce.number().min(0).max(1000),
  currencyPerPoint: z.coerce.number().min(0).max(1000),
  minPointsToRedeem: z.coerce.number().int().min(0),
  expiryDays: z.coerce.number().int().min(0),
  referralEnabled: z.boolean().optional(),
  referrerRewardPoints: z.coerce.number().int().min(0).max(1_000_000),
  referredRewardPoints: z.coerce.number().int().min(0).max(1_000_000),
});
export type LoyaltySettingsInput = z.infer<typeof loyaltySettingsSchema>;

export const COUPON_TYPES = ["percent", "amount"] as const;
export const COUPON_TYPE_LABELS: Record<(typeof COUPON_TYPES)[number], string> = {
  percent: "Percentage off",
  amount: "Flat amount off",
};

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "A code needs at least 3 characters")
      .max(24, "Keep the code under 24 characters")
      .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens and underscores only")
      .transform((v) => v.toUpperCase()),
    description: z.string().trim().optional(),
    type: z.enum(COUPON_TYPES).default("percent"),
    value: z.coerce.number().min(0, "Enter a value"),
    maxDiscountAmount: z.coerce.number().min(0).optional(),
    minBillAmount: z.coerce.number().min(0).optional(),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
    maxRedemptions: z.coerce.number().int().min(0).optional(),
    perCustomerLimit: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.type !== "percent" || data.value <= 100, {
    message: "A percentage coupon cannot be more than 100%",
    path: ["value"],
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.startsAt <= data.endsAt, {
    message: "The end date cannot be before the start date",
    path: ["endsAt"],
  });
export type CouponInput = z.infer<typeof couponSchema>;

export const loyaltyTierSchema = z.object({
  name: z.string().trim().min(1, "Enter a tier name"),
  minPoints: z.coerce.number().int().min(0),
  discountPercent: z.coerce.number().min(0).max(100),
});
export type LoyaltyTierInput = z.infer<typeof loyaltyTierSchema>;

export const loyaltyAdjustmentSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  points: z.coerce.number().int().refine((n) => n !== 0, "Enter a non-zero number of points"),
  note: z.string().trim().optional(),
});
export type LoyaltyAdjustmentInput = z.infer<typeof loyaltyAdjustmentSchema>;

/* ------------------------------------------------------------ Communications */

export const MESSAGE_CHANNELS = ["sms", "email"] as const;
export const MESSAGE_CHANNEL_LABELS: Record<(typeof MESSAGE_CHANNELS)[number], string> = {
  sms: "SMS",
  email: "Email",
};

/** The events a shop actually sends about — each maps to one template per channel. */
export const MESSAGE_EVENTS = ["invoice", "payment_receipt", "outstanding_reminder", "promotion"] as const;
export const MESSAGE_EVENT_LABELS: Record<(typeof MESSAGE_EVENTS)[number], string> = {
  invoice: "Invoice",
  payment_receipt: "Payment receipt",
  outstanding_reminder: "Outstanding reminder",
  promotion: "Promotion",
};

export const messageTemplateSchema = z.object({
  channel: z.enum(MESSAGE_CHANNELS),
  eventKey: z.enum(MESSAGE_EVENTS),
  name: z.string().trim().min(1, "Enter a template name"),
  subject: z.string().trim().optional(),
  body: z.string().trim().min(1, "Enter the message body"),
});
export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>;

export const sendMessageSchema = z.object({
  channel: z.enum(MESSAGE_CHANNELS),
  eventKey: z.enum(MESSAGE_EVENTS),
  customerId: z.string().optional(),
  recipient: z.string().trim().min(1, "Enter a recipient"),
  subject: z.string().trim().optional(),
  body: z.string().trim().min(1, "Enter a message"),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Fills `{{placeholders}}`; anything unknown is left visible rather than silently blanked. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export const TEMPLATE_PLACEHOLDERS = [
  "customer_name",
  "business_name",
  "doc_number",
  "total_amount",
  "amount_paid",
  "balance_due",
  "loyalty_points",
  "date",
] as const;
