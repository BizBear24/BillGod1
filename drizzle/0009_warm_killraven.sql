CREATE TYPE "public"."serial_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "serial_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"serial" text NOT NULL,
	"direction" serial_direction NOT NULL,
	"reference_type" "stock_reference_type" NOT NULL,
	"reference_id" text NOT NULL,
	"reference_label" text,
	"notes" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "serial_movements" ADD CONSTRAINT "serial_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_movements" ADD CONSTRAINT "serial_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_movements" ADD CONSTRAINT "serial_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_movements" ADD CONSTRAINT "serial_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "serial_movements_lookup_idx" ON "serial_movements" USING btree ("business_id","product_id","serial");--> statement-breakpoint
CREATE INDEX "serial_movements_reference_idx" ON "serial_movements" USING btree ("reference_type","reference_id");