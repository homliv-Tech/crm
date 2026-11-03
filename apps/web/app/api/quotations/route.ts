import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createQuotationHandlers } from "@/lib/crm/quotation-handlers";

export const { GET, POST } = createQuotationHandlers({
  authorize: requirePermission,
  getDb,
});
