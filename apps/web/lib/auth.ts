import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";
import { authConfigured } from "./auth-config";
import { resolveWorkspaceAccess } from "./workspace-authorization";
import { can, type Permission } from "./access-policy";

export const getAccess = cache(async () => {
  await connection();
  if (!authConfigured())
    return {
      status: 503 as const,
      error: "WorkOS sign-in has not been configured.",
    };
  try {
    const { user, sessionId } = await withAuth();
    if (!user)
      return { status: 401 as const, error: "Sign in to your workspace." };
    const access = await resolveWorkspaceAccess(getWorkOS().userManagement, {
      userId: user.id,
      sessionId,
      organizationId: process.env.WORKOS_ORGANIZATION_ID!,
    });
    if (access.status !== 200) return access;
    return { ...access, user, sessionId };
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
