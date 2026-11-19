import { can, membershipRole } from "@/lib/access-policy";

export type Teammate = { id: string; name: string; email: string };
type TeamUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};
type Membership = {
  userId: string;
  organizationId: string;
  status: string;
  role: { slug: string };
  roles?: { slug: string }[];
  user?: TeamUser;
};
type Provider = {
  listOrganizationMemberships: (args: {
    organizationId: string;
    statuses: ["active"];
  }) => Promise<{ autoPagination: () => Promise<Membership[]> }>;
  getUser: (id: string) => Promise<TeamUser>;
};
export async function listAssignableTeam(
  users: Provider,
  organizationId: string,
): Promise<Teammate[]> {
  const memberships = await users
    .listOrganizationMemberships({ organizationId, statuses: ["active"] })
    .then((page) => page.autoPagination());
  const allowed = memberships.filter((m) => {
    const role = membershipRole(m, organizationId, m.userId);
    return role && can(role, "crm:write");
  });
  const team = await Promise.all(
    allowed.map(async (m) => {
      const user = m.user ?? (await users.getUser(m.userId));
      if (user.id !== m.userId) throw new Error("Invalid teammate identity");
      return {
        id: user.id,
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email,
        email: user.email,
      };
    }),
  );
  return [...new Map(team.map((t) => [t.id, t])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
