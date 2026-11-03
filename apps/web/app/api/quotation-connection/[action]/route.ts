import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { connectionOrigin } from "@crm/quotations/crm-bridge";
import { getAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSnapshot } from "@/lib/crm/snapshot";
import { resolveWorkspaceAccess } from "@/lib/workspace-authorization";
import { createConnectionHandler } from "@/lib/crm/connection-handlers";

const handle = createConnectionHandler({
  getDb,
  snapshot: getSnapshot,
  authorize: async () => {
    const access = await getAccess();
    if (access.status !== 200)
      return Response.json({ error: access.error }, { status: access.status });
    return {
      userId: access.user.id,
      sessionId: access.sessionId,
      organizationId: access.organizationId,
    };
  },
  validate: (context) =>
    resolveWorkspaceAccess(getWorkOS().userManagement, context),
  audience: () =>
    connectionOrigin(
      process.env.QUOTATIONS_ORIGIN ||
        (process.env.NODE_ENV === "development" ? "http://localhost:3001" : ""),
    ),
  organizationId: () => process.env.WORKOS_ORGANIZATION_ID!,
});
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return handle(request, (await context.params).action);
}
