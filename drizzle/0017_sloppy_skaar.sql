CREATE TYPE "public"."gst_type" AS ENUM('igst', 'cgst_sgst');--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "gst_type" "gst_type" DEFAULT 'cgst_sgst' NOT NULL;