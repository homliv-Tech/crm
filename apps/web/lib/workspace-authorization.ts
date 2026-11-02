import type { WorkOS } from "@workos-inc/node";
import { membershipRole } from "./access-policy";

type Users = Pick<
  WorkOS["userManagement"],
  "listSessions" | "listOrganizationMemberships"
>;
// A signature-valid access token can outlive remote session revocation. Verify
// both the current WorkOS session and membership before granting any CRM access.
export async function resolveWorkspaceAccess(
  users: Users,
  context: { userId: string; sessionId: string; organizationId: string },
) {
  const { userId, sessionId, organizationId } = context;
  const [sessions, memberships] = await Promise.all([
    users.listSessions(userId).then((page) => page.autoPagination()),
    users.listOrganizationMemberships({ organizationId, userId }),
  ]);
  const session = sessions.find(
    (s) => s.id === sessionId && s.userId === userId,
  );
  if (
    !session ||
    session.status !== "active" ||
    session.endedAt ||
    !(session.expiresAt.getTime() > Date.now())
  )
    return {
      status: 401 as const,
      error: "Your session has ended. Sign in again.",
    };
  const membership = memberships.data.find((m) => m.status === "active");
  const role = membership && membershipRole(membership, organizationId, userId);
  if (!role)
    return {
      status: 403 as const,
      error:
        "You do not have access to this workspace. Contact your administrator.",
    };
  return {
    status: 200 as const,
    role,
    membershipId: membership.id,
    organizationId,
  };
}
