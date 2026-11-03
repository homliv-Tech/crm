ALTER TABLE "deals" ALTER COLUMN "stage" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "stage" SET DEFAULT 'Briefing'::text;--> statement-breakpoint
DROP TYPE "public"."deal_stage";--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('Briefing', 'Concept design', 'Detailed design', 'Approvals', 'Construction', 'Handover', 'On hold', 'Cancelled');--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "stage" SET DEFAULT 'Briefing'::"public"."deal_stage";--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "brief" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "deals" SET "brief" = 'Imported from sales CRM. Previous stage: ' || "stage" || '; win probability: ' || "probability" || '%; expected close date: ' || coalesce("close_date"::text, 'not set') || '. Review the project phase, architectural fee, progress, and handover date.', "stage" = CASE WHEN "stage" = 'Lost' THEN 'Cancelled' ELSE 'Briefing' END, "probability" = 0, "close_date" = NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "stage" SET DATA TYPE "public"."deal_stage" USING "stage"::"public"."deal_stage";--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "probability" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "site_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "companies" SET "description" = concat_ws(E'\n\n', nullif("description", ''), 'Imported sales categories: ' || array_to_string("tags", ', ') || '. Review the client type and relationship status.'), "tags" = ARRAY(SELECT tag FROM unnest("tags") AS tag WHERE tag NOT IN ('Enterprise', 'Mid-Market', 'SMB', 'Strategic', 'New Logo', 'Upsell', 'Expansion', 'Renewal', 'Pilot', 'Co-Sell', 'Land & Expand')) WHERE "tags" && ARRAY['Enterprise', 'Mid-Market', 'SMB', 'Strategic', 'New Logo', 'Upsell', 'Expansion', 'Renewal', 'Pilot', 'Co-Sell', 'Land & Expand']::text[];
