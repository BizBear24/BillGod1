ALTER TABLE "products" ADD COLUMN "gst_type" "gst_type" DEFAULT 'cgst_sgst' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "gst_type" "gst_type" DEFAULT 'cgst_sgst' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_rates" DROP COLUMN "gst_type";