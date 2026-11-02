export const ROLES = ["admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export type Permission = "crm:read" | "crm:write" | "users:manage";
export function isRole(value: string): value is Role {
  return ROLES.includes(value as Role);
}
export function can(role: Role, permission: Permission) {
  return (
    permission === "crm:read" ||
    role === "admin" ||
    (permission === "crm:write" && role === "member")
  );
}
// Use current provider data, never a role supplied by the browser or an old JWT.
export function membershipRole(
  membership: {
    organizationId: string;
    userId: string;
    status: string;
    role: { slug: string };
    roles?: { slug: string }[];
  },
  organizationId: string,
  userId: string,
): Role | null {
  if (
    membership.organizationId !== organizationId ||
    membership.userId !== userId ||
    membership.status !== "active"
  )
    return null;
  const roles = membership.roles?.length ? membership.roles : [membership.role];
  if (roles.some((role) => !isRole(role.slug))) return null;
  return (
    ROLES.find((role) => roles.some((assigned) => assigned.slug === role)) ??
    null
  );
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
