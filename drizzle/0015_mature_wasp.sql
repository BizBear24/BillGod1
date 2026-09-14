CREATE TABLE "product_import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"file_name" text NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_import_batch_id_product_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."product_import_batches"("id") ON DELETE set null ON UPDATE no action;