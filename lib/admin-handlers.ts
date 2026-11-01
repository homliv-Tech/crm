import type { WorkOS } from "@workos-inc/node";
import { z } from "zod";
import { ROLES, sameOrigin } from "./access-policy";

type Admin = { userId: string; organizationId: string };
type Dependencies = {
  authorize: () => Promise<Admin | Response>;
  users: Pick<
    WorkOS["userManagement"],
    | "listOrganizationMemberships"
    | "getUser"
    | "listInvitations"
    | "sendInvitation"
    | "getOrganizationMembership"
    | "updateOrganizationMembership"
    | "deactivateOrganizationMembership"
    | "reactivateOrganizationMembership"
    | "getInvitation"
    | "revokeInvitation"
  >;
};
const changeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("role"),
    id: z.string().min(1).max(128),
    role: z.enum(ROLES),
  }),
  z.object({
    action: z.enum(["suspend", "restore", "revoke-invitation"]),
    id: z.string().min(1).max(128),
  }),
]);
const inviteSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  role: z.enum(ROLES),
});
export type AdminData = {
  currentUserId: string;
  users: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    status: string;
  }[];
  invitations: { id: string; email: string; state: string }[];
};
export function createAdminHandlers({ authorize, users }: Dependencies) {
  async function handle(request: Request) {
    const admin = await authorize();
    if (admin instanceof Response) return admin;
    if (request.method !== "GET" && !sameOrigin(request))
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    try {
      if (request.method === "GET") {
        const [memberships, invitations] = await Promise.all([
          users
            .listOrganizationMemberships({
              organizationId: admin.organizationId,
              statuses: ["active", "inactive", "pending"],
            })
            .then((page) => page.autoPagination()),
          users
            .listInvitations({ organizationId: admin.organizationId })
            .then((page) => page.autoPagination()),
        ]);
        const records = await Promise.all(
          memberships.map(async (membership) => {
            const user =
              membership.user ?? (await users.getUser(membership.userId));
            return {
              id: membership.id,
              userId: user.id,
              name:
                [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                user.email,
              email: user.email,
              role: membership.role.slug,
              status: membership.status,
            };
          }),
        );
        return Response.json(
          {
            currentUserId: admin.userId,
            users: records,
            invitations: invitations
              .filter((i) => i.state === "pending")
              .map(({ id, email, state }) => ({ id, email, state })),
          } satisfies AdminData,
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      const text = await request.text();
      if (text.length > 4096)
        return Response.json(
          { error: "Request is too large." },
          { status: 413 },
        );
      const body: unknown = JSON.parse(text);
      if (request.method === "POST") {
        const { email, role } = inviteSchema.parse(body);
        await users.sendInvitation({
          email,
          roleSlug: role,
          organizationId: admin.organizationId,
          inviterUserId: admin.userId,
          expiresInDays: 7,
        });
        return Response.json({ ok: true }, { status: 201 });
      }
      const change = changeSchema.parse(body);
      if (change.action === "revoke-invitation") {
        const invitation = await users.getInvitation(change.id);
        if (invitation.organizationId !== admin.organizationId)
          return Response.json(
            { error: "Invitation not found." },
            { status: 404 },
          );
        await users.revokeInvitation(change.id);
      } else {
        const membership = await users.getOrganizationMembership(change.id);
        if (membership.organizationId !== admin.organizationId)
          return Response.json({ error: "User not found." }, { status: 404 });
        if (membership.userId === admin.userId)
          return Response.json(
            {
              error: "Ask another administrator to change your role or access.",
            },
            { status: 409 },
          );
        if (change.action === "role")
          await users.updateOrganizationMembership(change.id, {
            roleSlug: change.role,
          });
        else if (change.action === "suspend")
          await users.deactivateOrganizationMembership(change.id);
        else await users.reactivateOrganizationMembership(change.id);
      }
      return Response.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return Response.json(
          { error: "Enter a valid email, role, and action." },
          { status: 400 },
        );
      // Never expose provider responses, tokens, or invitation URLs to the client.
      return Response.json(
        {
          error:
            "Could not update users. Check your WorkOS configuration and try again.",
        },
        { status: 503 },
      );
    }
  }
  return { GET: handle, POST: handle, PATCH: handle };
}
