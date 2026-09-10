import { pgTable, text, timestamp, numeric, integer, boolean, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { businesses } from "./tenancy";
import { customers } from "./parties";
import { sales } from "./sales";
import { users } from "./auth";

/**
 * Loyalty & Communications — spec Phase 9.
 *
 * Points follow the same rule as stock and money: `loyaltyTransactions` is the
 * ledger, and a customer's balance is the sum of it. `customers.loyaltyPoints`
 * is kept in step as a cached total so the POS can show a balance without
 * aggregating on every keystroke.
 */
export const loyaltySettings = pgTable("loyalty_settings", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  /** Points earned per ₹1 of billed value. */
  pointsPerCurrency: numeric("points_per_currency", { precision: 10, scale: 4 }).notNull().default("1"),
  /** Rupees a single point is worth when redeemed. */
  currencyPerPoint: numeric("currency_per_point", { precision: 10, scale: 4 }).notNull().default("0.25"),
  minPointsToRedeem: integer("min_points_to_redeem").notNull().default(100),
  /** 0 means points never expire. */
  expiryDays: integer("expiry_days").notNull().default(0),

  /**
   * Referrals ride on the same points ledger: both sides are paid in points
   * when the referred customer's first bill completes, so nothing new has to
   * be reconciled.
   */
  referralEnabled: boolean("referral_enabled").notNull().default(false),
  referrerRewardPoints: integer("referrer_reward_points").notNull().default(0),
  referredRewardPoints: integer("referred_reward_points").notNull().default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTierTable = pgTable(
  "loyalty_tiers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    minPoints: integer("min_points").notNull().default(0),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.name)]
);

export const loyaltyTransactionTypeEnum = pgEnum("loyalty_transaction_type", ["earn", "redeem", "expire", "adjust"]);

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    saleId: text("sale_id").references(() => sales.id, { onDelete: "set null" }),
    /**
     * Set on the rows that claw points back — a return against the bill that
     * awarded them, or a void of the bill itself. Summing these per original
     * sale is how a second partial return knows what is left to reverse.
     */
    reversesSaleId: text("reverses_sale_id").references(() => sales.id, { onDelete: "set null" }),

    type: loyaltyTransactionTypeEnum("type").notNull(),
    /** Signed: positive adds points, negative spends them. */
    points: integer("points").notNull(),
    note: text("note"),
    /** Null when points never expire. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("loyalty_transactions_customer_idx").on(table.businessId, table.customerId)]
);

/* ------------------------------------------------------------ Communications */

export const messageChannelEnum = pgEnum("message_channel", ["sms", "email"]);
export const messageStatusEnum = pgEnum("message_status", ["queued", "sent", "failed"]);

/**
 * Templates are keyed by the event they serve, so the send path can look one
 * up without hardcoding copy. `{{placeholders}}` are filled at send time.
 */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    channel: messageChannelEnum("channel").notNull(),
    eventKey: text("event_key").notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.channel, table.eventKey)]
);

export const messageLog = pgTable(
  "message_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    channel: messageChannelEnum("channel").notNull(),
    eventKey: text("event_key"),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull().default("queued"),
    error: text("error"),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    sentByUserId: text("sent_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("message_log_business_idx").on(table.businessId, table.createdAt)]
);

/** Dev-only SMS outbox, mirroring the email one so nothing leaves the machine in development. */
export const devSmsOutbox = pgTable("dev_sms_outbox", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  to: text("to").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


/* ------------------------------------------------------------------ Coupons */

export const couponTypeEnum = pgEnum("coupon_type", ["percent", "amount"]);

/**
 * Discount codes. The rules live here and are enforced server-side at billing
 * time — the POS only ever says which code was typed, never what it is worth.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    /** Stored upper-cased so codes are effectively case-insensitive. */
    code: text("code").notNull(),
    description: text("description"),

    type: couponTypeEnum("type").notNull().default("percent"),
    /** A percentage when type is "percent", rupees when it is "amount". */
    value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Ceiling for a percentage coupon; null means uncapped. */
    maxDiscountAmount: numeric("max_discount_amount", { precision: 12, scale: 2 }),
    minBillAmount: numeric("min_bill_amount", { precision: 14, scale: 2 }).notNull().default("0"),

    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** 0 means unlimited. Usage is counted from the redemption ledger, never stored. */
    maxRedemptions: integer("max_redemptions").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.code)]
);

/**
 * One row per use. Counting these (excluding cancelled bills) is what enforces
 * the redemption limits — there is no usage counter to drift.
 */
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    couponId: text("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    saleId: text("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("coupon_redemptions_coupon_idx").on(table.businessId, table.couponId)]
);

/* ---------------------------------------------------------------- Referrals */

/**
 * Who introduced whom. A customer can only be referred once, and the reward
 * is paid when their first bill completes — recording `rewardedSaleId` is what
 * makes that once-only rather than every time they shop.
 */
export const referrals = pgTable(
  "referrals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    referrerCustomerId: text("referrer_customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    referredCustomerId: text("referred_customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    /** The code as it was typed, kept for the audit trail. */
    code: text("code").notNull(),

    rewardedSaleId: text("rewarded_sale_id").references(() => sales.id, { onDelete: "set null" }),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
    referrerPoints: integer("referrer_points").notNull().default(0),
    referredPoints: integer("referred_points").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.businessId, table.referredCustomerId)]
);
