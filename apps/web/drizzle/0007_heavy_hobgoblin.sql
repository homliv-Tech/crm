CREATE TYPE "public"."payment_method" AS ENUM('Bank transfer', 'UPI', 'Cash', 'Cheque', 'Card', 'Other');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('Recorded', 'Voided');--> statement-breakpoint
CREATE TABLE "fee_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"phase" "deal_stage" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"received_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"due_date" date NOT NULL,
	"invoice_number" text,
	"invoice_date" date,
	"quotation_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_milestones_identity_unique" UNIQUE("id","project_id","company_id"),
	CONSTRAINT "fee_milestones_invoice_unique" UNIQUE("invoice_number"),
	CONSTRAINT "milestone_title_required" CHECK (length(trim("fee_milestones"."title")) > 0),
	CONSTRAINT "milestone_amount_positive" CHECK ("fee_milestones"."amount" > 0),
	CONSTRAINT "milestone_received_range" CHECK ("fee_milestones"."received_amount" >= 0 and "fee_milestones"."received_amount" <= "fee_milestones"."amount"),
	CONSTRAINT "milestone_invoice_pair" CHECK (("fee_milestones"."invoice_number" is null and "fee_milestones"."invoice_date" is null) or (length(trim("fee_milestones"."invoice_number")) > 0 and "fee_milestones"."invoice_number" is not null and "fee_milestones"."invoice_date" is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"received_date" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "receipt_status" DEFAULT 'Recorded' NOT NULL,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipts_number_unique" UNIQUE("project_id","receipt_number"),
	CONSTRAINT "receipt_number_required" CHECK (length(trim("payment_receipts"."receipt_number")) > 0),
	CONSTRAINT "receipt_amount_positive" CHECK ("payment_receipts"."amount" > 0),
	CONSTRAINT "receipt_void_reason" CHECK (("payment_receipts"."status" = 'Recorded' and "payment_receipts"."void_reason" = '') or ("payment_receipts"."status" = 'Voided' and length(trim("payment_receipts"."void_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "fee_milestones" ADD CONSTRAINT "fee_milestones_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_milestones" ADD CONSTRAINT "fee_milestones_project_client_fk" FOREIGN KEY ("project_id","company_id") REFERENCES "public"."deals"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_milestone_scope_fk" FOREIGN KEY ("milestone_id","project_id","company_id") REFERENCES "public"."fee_milestones"("id","project_id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_milestones_company_idx" ON "fee_milestones" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "fee_milestones_project_idx" ON "fee_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fee_milestones_quotation_idx" ON "fee_milestones" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "payment_receipts_company_idx" ON "payment_receipts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payment_receipts_project_idx" ON "payment_receipts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payment_receipts_milestone_idx" ON "payment_receipts" USING btree ("milestone_id");
--> statement-breakpoint
-- Atomically adjust the parent's received total. Its CHECK constraint prevents
-- overpayments and amount reductions below receipts, including concurrent writes.
CREATE FUNCTION sync_milestone_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  delta numeric(14,2) := 0;
  target_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.milestone_id <> NEW.milestone_id OR OLD.project_id <> NEW.project_id OR OLD.company_id <> NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'receipt_scope_immutable', MESSAGE = 'A receipt must stay with its original milestone';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    target_id := OLD.milestone_id;
    IF OLD.status = 'Recorded' THEN delta := delta - OLD.amount; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    target_id := NEW.milestone_id;
    IF NEW.status = 'Recorded' THEN delta := delta + NEW.amount; END IF;
  END IF;
  IF delta <> 0 THEN
    UPDATE fee_milestones SET received_amount = received_amount + delta, updated_at = now() WHERE id = target_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_milestone_receipts AFTER INSERT OR UPDATE OR DELETE ON payment_receipts FOR EACH ROW EXECUTE FUNCTION sync_milestone_receipts();
--> statement-breakpoint
CREATE FUNCTION keep_milestone_receipt_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A project/client deletion may cascade; direct milestone deletion keeps receipts.
  IF EXISTS (SELECT 1 FROM deals WHERE id = OLD.project_id) AND EXISTS (SELECT 1 FROM payment_receipts WHERE milestone_id = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'milestone_has_receipts', MESSAGE = 'Milestones with receipts cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER keep_milestone_receipt_history BEFORE DELETE ON fee_milestones FOR EACH ROW EXECUTE FUNCTION keep_milestone_receipt_history();
