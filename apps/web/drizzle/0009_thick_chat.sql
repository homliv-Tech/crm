CREATE TYPE "public"."coordination_role" AS ENUM('Structural engineer', 'Services consultant', 'Contractor', 'Vendor');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('Pending', 'Submitted', 'Changes requested', 'Accepted');--> statement-breakpoint
CREATE TABLE "project_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"firm" text DEFAULT '' NOT NULL,
	"role" "coordination_role" NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"responsibilities" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_partners_scope_unique" UNIQUE("id","project_id","company_id"),
	CONSTRAINT "partner_required_text" CHECK (length(trim("project_partners"."name")) > 0 and length(trim("project_partners"."responsibilities")) > 0)
);
--> statement-breakpoint
CREATE TABLE "project_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"status" "submission_status" DEFAULT 'Pending' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_title_required" CHECK (length(trim("project_submissions"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "project_partners" ADD CONSTRAINT "project_partners_project_fk" FOREIGN KEY ("project_id","company_id") REFERENCES "public"."deals"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_partner_scope_fk" FOREIGN KEY ("partner_id","project_id","company_id") REFERENCES "public"."project_partners"("id","project_id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_partners_company_idx" ON "project_partners" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "project_partners_project_idx" ON "project_partners" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_submissions_company_idx" ON "project_submissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "project_submissions_project_idx" ON "project_submissions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_submissions_partner_idx" ON "project_submissions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "project_submissions_due_idx" ON "project_submissions" USING btree ("status","due_date");