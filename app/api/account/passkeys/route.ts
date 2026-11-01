import { withAuth } from "@workos-inc/authkit-nextjs";
import { requirePermission } from "@/lib/auth";
import {
  createPasskeyHandlers,
  executePasskeyQuery,
} from "@/lib/passkey-handlers";
const handlers = createPasskeyHandlers({
  authorize: async () => {
    const access = await requirePermission("crm:read");
    if (access instanceof Response) return access;
    const session = await withAuth();
    if (!session.user || session.user.id !== access.user.id)
      return Response.json(
        { error: "Sign in to your workspace." },
        { status: 401 },
      );
    return { accessToken: session.accessToken };
  },
  execute: executePasskeyQuery,
});
export const GET = handlers.GET;
export const POST = handlers.POST;
