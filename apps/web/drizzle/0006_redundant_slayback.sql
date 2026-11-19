CREATE TYPE "public"."decision_kind" AS ENUM('Approval', 'Stage sign-off', 'Design change');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('Pending', 'Approved', 'Rejected', 'Withdrawn');--> statement-breakpoint
CREATE TABLE "project_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "decision_kind" NOT NULL,
	"phase" "deal_stage" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"decision_maker" text NOT NULL,
	"due_date" date NOT NULL,
	"revision" text NOT NULL,
	"status" "decision_status" DEFAULT 'Pending' NOT NULL,
	"approved_revision" text DEFAULT '' NOT NULL,
	"decision_date" date,
	"decision_note" text DEFAULT '' NOT NULL,
	"additional_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"schedule_impact_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_required_text" CHECK (length(trim("project_decisions"."title")) > 0 and length(trim("project_decisions"."decision_maker")) > 0 and length(trim("project_decisions"."revision")) > 0),
	CONSTRAINT "decision_approved_revision" CHECK (("project_decisions"."status" = 'Approved' and length(trim("project_decisions"."approved_revision")) > 0) or ("project_decisions"."status" <> 'Approved' and "project_decisions"."approved_revision" = '')),
	CONSTRAINT "decision_date_matches_status" CHECK (("project_decisions"."status" = 'Pending' and "project_decisions"."decision_date" is null) or ("project_decisions"."status" <> 'Pending' and "project_decisions"."decision_date" is not null)),
	CONSTRAINT "decision_fee_nonnegative" CHECK ("project_decisions"."additional_fee" >= 0),
	CONSTRAINT "decision_schedule_range" CHECK ("project_decisions"."schedule_impact_days" between -3650 and 3650),
	CONSTRAINT "decision_change_impacts_only" CHECK ("project_decisions"."kind" = 'Design change' or ("project_decisions"."additional_fee" = 0 and "project_decisions"."schedule_impact_days" = 0))
);
--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_project_id_deals_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_project_client_fk" FOREIGN KEY ("project_id","company_id") REFERENCES "public"."deals"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_decisions_company_idx" ON "project_decisions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "project_decisions_project_idx" ON "project_decisions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_decisions_due_idx" ON "project_decisions" USING btree ("status","due_date");