import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspaceAccess } from "../lib/workspace-authorization";

const context = {
  userId: "user",
  sessionId: "current-session",
  organizationId: "crm-org",
};
const session = {
  id: "current-session",
  userId: "user",
  status: "active",
  expiresAt: new Date(Date.now() + 60_000),
  endedAt: null,
};
const membership = {
  id: "membership",
  userId: "user",
  organizationId: "crm-org",
  status: "active",
  role: { slug: "member" },
};
function fixture(
  sessions: unknown[] = [session],
  memberships: unknown[] = [membership],
) {
  const calls: unknown[] = [];
  const users = {
    listSessions: async (userId: string) => {
      calls.push({ sessionsFor: userId });
      return { data: [], autoPagination: async () => sessions };
    },
    listOrganizationMemberships: async (options: unknown) => {
      calls.push(options);
      return { data: memberships };
    },
  } as unknown as Parameters<typeof resolveWorkspaceAccess>[0];
  return { users, calls };
}
test("workspace authorization checks the current session across all pages and the configured membership", async () => {
  const f = fixture();
  assert.deepEqual(await resolveWorkspaceAccess(f.users, context), {
    status: 200,
    role: "member",
    membershipId: "membership",
    organizationId: "crm-org",
  });
  assert.deepEqual(f.calls, [
    { sessionsFor: "user" },
    { userId: "user", organizationId: "crm-org" },
  ]);
});
test("revoked or expired sessions cannot read CRM data even while membership stays active", async () => {
  for (const invalid of [
    [],
    [{ ...session, status: "revoked" }],
    [{ ...session, status: "expired" }],
    [{ ...session, expiresAt: new Date(0) }],
    [{ ...session, endedAt: new Date() }],
    [{ ...session, userId: "someone-else" }],
    [{ ...session, id: "another-active-session" }],
    [
      { ...session, status: "revoked" },
      { ...session, id: "another-active-session" },
    ],
  ]) {
    const f = fixture(invalid);
    assert.equal((await resolveWorkspaceAccess(f.users, context)).status, 401);
  }
});
test("suspended, removed, or foreign memberships cannot read using an otherwise active session", async () => {
  for (const invalid of [
    [],
    [{ ...membership, status: "inactive" }],
    [{ ...membership, status: "pending" }],
    [{ ...membership, organizationId: "foreign" }],
    [{ ...membership, userId: "someone-else" }],
  ]) {
    const f = fixture([session], invalid);
    assert.equal((await resolveWorkspaceAccess(f.users, context)).status, 403);
  }
});
