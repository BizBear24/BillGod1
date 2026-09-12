ALTER TABLE "purchases" ADD COLUMN "original_purchase_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "round_off" numeric(6, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_original_purchase_id_purchases_id_fk" FOREIGN KEY ("original_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;