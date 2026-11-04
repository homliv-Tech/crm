CREATE TABLE "landing_enquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"apartment_type" text NOT NULL,
	"budget" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_enquiries_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "landing_enquiries" ADD CONSTRAINT "landing_enquiries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;