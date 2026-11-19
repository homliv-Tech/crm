CREATE TABLE "phase_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase" "deal_stage" NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"assignee_id" text,
	"assignee_name" text DEFAULT 'Unassigned' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phase_schedules_project_phase_unique" UNIQUE("project_id","phase"),
	CONSTRAINT "schedule_delivery_phase" CHECK ("phase_schedules"."phase" not in ('On hold', 'Cancelled')),
	CONSTRAINT "schedule_planned_order" CHECK ("phase_schedules"."planned_start" is null or "phase_schedules"."planned_end" is null or "phase_schedules"."planned_end" >= "phase_schedules"."planned_start"),
	CONSTRAINT "schedule_actual_order" CHECK ("phase_schedules"."actual_end" is null or ("phase_schedules"."actual_start" is not null and "phase_schedules"."actual_end" >= "phase_schedules"."actual_start"))
);
--> statement-breakpoint
CREATE TABLE "project_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase" "deal_stage" NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"due_date" date,
	"assignee_id" text,
	"assignee_name" text DEFAULT 'Unassigned' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"template_key" text,
	"template_item_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_starter_unique" UNIQUE("project_id","template_key","template_item_key"),
	CONSTRAINT "deliverable_title_required" CHECK (length(trim("project_deliverables"."title")) > 0),
	CONSTRAINT "deliverable_delivery_phase" CHECK ("project_deliverables"."phase" not in ('On hold', 'Cancelled')),
	CONSTRAINT "deliverable_completion_date" CHECK (("project_deliverables"."completed" and "project_deliverables"."completed_at" is not null) or (not "project_deliverables"."completed" and "project_deliverables"."completed_at" is null)),
	CONSTRAINT "deliverable_template_pair" CHECK (("project_deliverables"."template_key" is null and "project_deliverables"."template_item_key" is null) or ("project_deliverables"."template_key" is not null and "project_deliverables"."template_item_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "phase_schedules" ADD CONSTRAINT "phase_schedules_project_client_fk" FOREIGN KEY ("project_id","company_id") REFERENCES "public"."deals"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "deliverables_project_client_fk" FOREIGN KEY ("project_id","company_id") REFERENCES "public"."deals"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phase_schedules_company_idx" ON "phase_schedules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "phase_schedules_assignee_idx" ON "phase_schedules" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "deliverables_company_idx" ON "project_deliverables" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "deliverables_project_phase_idx" ON "project_deliverables" USING btree ("project_id","phase");--> statement-breakpoint
CREATE INDEX "deliverables_due_idx" ON "project_deliverables" USING btree ("completed","due_date");--> statement-breakpoint
CREATE INDEX "deliverables_assignee_idx" ON "project_deliverables" USING btree ("assignee_id");