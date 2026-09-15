ALTER TABLE "purchase_items" ADD COLUMN "gst_type" "gst_type" DEFAULT 'cgst_sgst' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "gst_type";