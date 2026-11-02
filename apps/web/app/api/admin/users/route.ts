import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { requirePermission } from "@/lib/auth";
import { createAdminHandlers } from "@/lib/admin-handlers";
async function handle(request: Request) {
  // Authorize before constructing the management client (also works before setup).
  const access = await requirePermission("users:manage");
  if (access instanceof Response) return access;
  const handlers = createAdminHandlers({
    authorize: async () => ({
      userId: access.user.id,
      organizationId: access.organizationId,
    }),
    users: getWorkOS().userManagement,
  });
  return handlers[request.method as "GET" | "POST" | "PATCH"](request);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
