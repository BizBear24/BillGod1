CREATE TYPE "public"."print_template_kind" AS ENUM('label', 'invoice');--> statement-breakpoint
CREATE TABLE "print_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"kind" "print_template_kind" NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_templates_business_id_kind_name_unique" UNIQUE("business_id","kind","name")
);
--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;