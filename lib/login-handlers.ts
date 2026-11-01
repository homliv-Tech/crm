import type { AuthenticationResponse, WorkOS } from "@workos-inc/node";
import { z } from "zod";
import { membershipRole, sameOrigin } from "./access-policy";

const input = z.object({
  action: z.enum(["send", "verify"]),
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  invitationToken: z.string().min(1).max(2048).optional(),
});
type Users = Pick<
  WorkOS["userManagement"],
  | "createMagicAuth"
  | "authenticateWithMagicAuth"
  | "listUsers"
  | "listOrganizationMemberships"
  | "findInvitationByToken"
>;
type Dependencies = {
  configured: () => boolean;
  users: () => Users;
  organizationId: () => string;
  clientId: () => string;
  saveSession: (
    session: AuthenticationResponse,
    request: Request,
  ) => Promise<void>;
  allowAttempt: (action: "send" | "verify", email: string) => boolean;
};
// WorkOS also enforces provider-side limits. This cap bounds abuse per app process
// without relying on potentially spoofed forwarding headers.
export function createLoginLimiter() {
  const attempts = new Map<string, { count: number; until: number }>();
  return (action: "send" | "verify", email: string) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const take = (key: string, limit: number) => {
      const value = attempts.get(key) ?? { count: 0, until: now + 60_000 };
      if (value.count >= limit) return false;
      value.count++;
      attempts.set(key, value);
      return true;
    };
    return (
      take(`global:${action}`, action === "send" ? 60 : 120) &&
      take(`${action}:${email}`, action === "send" ? 3 : 10)
    );
  };
}
export function createLoginHandler(deps: Dependencies) {
  return async (request: Request) => {
    const json = (data: object, status = 200) =>
      Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    if (!sameOrigin(request))
      return json({ error: "Invalid request origin." }, 403);
    if (!deps.configured())
      return json({ error: "Workspace sign-in is not configured yet." }, 503);
    try {
      const raw = await request.text();
      if (raw.length > 4096)
        return json({ error: "Request is too large." }, 413);
      const { action, email, code, invitationToken } = input.parse(
        JSON.parse(raw),
      );
      if (action === "verify" && !code)
        return json(
          { error: "Enter the six-digit code from your email." },
          400,
        );
      if (!deps.allowAttempt(action, email))
        return json(
          { error: "Too many attempts. Wait a minute and try again." },
          429,
        );
      const users = deps.users();
      const organizationId = deps.organizationId();
      // An invitation is only needed to join. Active members may still have an
      // accepted/expired invitation token in their URL; do not reuse that token.
      let activeMember = false;
      if (action === "send" || invitationToken) {
        const accounts = await users.listUsers({ email });
        const user = accounts.data.find(
          (user) => user.email.toLowerCase() === email,
        );
        if (user) {
          const memberships = await users.listOrganizationMemberships({
            organizationId,
            userId: user.id,
          });
          activeMember = memberships.data.some((m) =>
            membershipRole(m, organizationId, user.id),
          );
        }
      }
      const joinToken = activeMember ? undefined : invitationToken;
      if (joinToken) {
        const invitation = await users.findInvitationByToken(joinToken);
        if (
          invitation.organizationId !== organizationId ||
          invitation.email.toLowerCase() !== email ||
          invitation.state !== "pending" ||
          new Date(invitation.expiresAt).getTime() <= Date.now()
        ) {
          // Keep code-request responses identical for eligible and blocked users.
          if (action === "send") return json({ ok: true });
          return json(
            {
              error:
                "This invitation is invalid or expired. Ask your administrator for a new one.",
            },
            400,
          );
        }
      }
      if (action === "send") {
        if (!activeMember && !joinToken) return json({ ok: true });
        // The returned object contains the actual code: never return or log it.
        await users.createMagicAuth({
          email,
          ...(joinToken ? { invitationToken: joinToken } : {}),
        });
        return json({ ok: true });
      }
      const session = await users.authenticateWithMagicAuth({
        clientId: deps.clientId(),
        email,
        code: code!,
        ...(joinToken ? { invitationToken: joinToken } : {}),
      });
      const memberships = await users.listOrganizationMemberships({
        organizationId,
        userId: session.user.id,
      });
      if (
        !memberships.data.some((m) =>
          membershipRole(m, organizationId, session.user.id),
        )
      )
        return json(
          {
            error:
              "You do not have access to this workspace. Contact your administrator.",
          },
          403,
        );
      await deps.saveSession(session, request);
      return json({ ok: true });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError)
        return json(
          { error: "Enter a valid email address and six-digit code." },
          400,
        );
      const failure = error as { status?: number; code?: string };
      if (failure.status === 429)
        return json(
          { error: "Too many attempts. Wait a minute and try again." },
          429,
        );
      if (
        failure.code === "mfa_enrollment" ||
        failure.code === "mfa_challenge" ||
        failure.code === "sso_required"
      )
        return json(
          {
            error:
              "Your organization requires another sign-in method. Contact your administrator.",
          },
          403,
        );
      if (failure.status && [400, 401, 404, 422].includes(failure.status))
        return json(
          {
            error:
              "The code or invitation is invalid or expired. Request a new code and try again.",
          },
          400,
        );
      return json(
        { error: "Sign-in is temporarily unavailable. Please try again." },
        503,
      );
    }
  };
}
