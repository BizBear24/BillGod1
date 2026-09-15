ALTER TABLE "tax_rates" ADD COLUMN "gst_type" "gst_type" DEFAULT 'cgst_sgst' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "gst_type";