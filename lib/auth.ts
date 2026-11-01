import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";
import { authConfigured } from "./auth-config";
import { can, membershipRole, type Permission } from "./access-policy";

export const getAccess = cache(async () => {
  await connection();
  if (!authConfigured())
    return {
      status: 503 as const,
      error: "WorkOS sign-in has not been configured.",
    };
  try {
    const { user } = await withAuth();
    if (!user)
      return { status: 401 as const, error: "Sign in to your workspace." };
    const organizationId = process.env.WORKOS_ORGANIZATION_ID!;
    const memberships =
      await getWorkOS().userManagement.listOrganizationMemberships({
        organizationId,
        userId: user.id,
      });
    const membership = memberships.data.find((m) => m.status === "active");
    const role =
      membership && membershipRole(membership, organizationId, user.id);
    if (!role)
      return {
        status: 403 as const,
        error:
          "You do not have access to this workspace. Contact your administrator.",
      };
    return {
      status: 200 as const,
      user,
      role,
      membershipId: membership.id,
      organizationId,
    };
  } catch {
    return {
      status: 503 as const,
      error: "Could not verify workspace access. Try again shortly.",
    };
  }
});
export async function requirePermission(permission: Permission) {
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json({ error: access.error }, { status: access.status });
  if (!can(access.role, permission))
    return Response.json(
      { error: "Your role does not allow this action." },
      { status: 403 },
    );
  return access;
}
