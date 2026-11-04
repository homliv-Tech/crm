import { getDb } from "@/lib/db";
import { createEnquiryHandler } from "@/lib/crm/enquiry-handler";

export const runtime = "nodejs";
export const POST = createEnquiryHandler({
  getDb,
  secret: () => process.env.LANDING_ENQUIRY_SECRET,
});
