import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { authConfigured } from "@/lib/auth-config";
import { createLoginHandler, createLoginLimiter } from "@/lib/login-handlers";
export const POST = createLoginHandler({
  configured: authConfigured,
  users: () => getWorkOS().userManagement,
  organizationId: () => process.env.WORKOS_ORGANIZATION_ID!,
  clientId: () => process.env.WORKOS_CLIENT_ID!,
  saveSession: (session, request) => saveSession(session, request.url),
  allowAttempt: createLoginLimiter(),
});
