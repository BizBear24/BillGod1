CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"coupon_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"customer_id" text,
	"discount_amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" "coupon_type" DEFAULT 'percent' NOT NULL,
	"value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"max_discount_amount" numeric(12, 2),
	"min_bill_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_business_id_code_unique" UNIQUE("business_id","code")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"referrer_customer_id" text NOT NULL,
	"referred_customer_id" text NOT NULL,
	"code" text NOT NULL,
	"rewarded_sale_id" text,
	"rewarded_at" timestamp with time zone,
	"referrer_points" integer DEFAULT 0 NOT NULL,
	"referred_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_business_id_referred_customer_id_unique" UNIQUE("business_id","referred_customer_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "loyalty_settings" ADD COLUMN "referral_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_settings" ADD COLUMN "referrer_reward_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_settings" ADD COLUMN "referred_reward_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_customer_id_customers_id_fk" FOREIGN KEY ("referred_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_rewarded_sale_id_sales_id_fk" FOREIGN KEY ("rewarded_sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("business_id","coupon_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_referral_code_unique" UNIQUE("business_id","referral_code");