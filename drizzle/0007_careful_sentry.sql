ALTER TYPE "public"."stock_movement_type" ADD VALUE 'cancel_in';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'cancel_out';--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "bill_discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "original_sale_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "loyalty_tier_name" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "tier_discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "coupon_discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_by_user_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "cancelled_by_user_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_original_sale_id_sales_id_fk" FOREIGN KEY ("original_sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;