ALTER TYPE "public"."sale_doc_type" ADD VALUE 'estimate' BEFORE 'sale_order';--> statement-breakpoint
CREATE TABLE "product_images" (
	"product_id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"data_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;