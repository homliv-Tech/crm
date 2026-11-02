import { requirePermission } from "@/lib/auth";
import { getSnapshot } from "@/lib/crm/snapshot";
import { createExportHandler } from "@/lib/crm/export-handler";
export const POST = createExportHandler({
  authorize: () => requirePermission("crm:read"),
  getSnapshot,
});
