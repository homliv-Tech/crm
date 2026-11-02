import { test } from "node:test";
import assert from "node:assert/strict";
import { can, membershipRole } from "../lib/access-policy";
import { createAdminHandlers } from "../lib/admin-handlers";

const membership = {
  id: "membership",
  userId: "other",
  organizationId: "crm-org",
  status: "active",
  role: { slug: "member" },
};
test("only current active memberships in this workspace grant recognized roles", () => {
  assert.equal(membershipRole(membership, "crm-org", "other"), "member");
  for (const status of ["pending", "inactive"])
    assert.equal(
      membershipRole({ ...membership, status }, "crm-org", "other"),
      null,
    );
  assert.equal(membershipRole(membership, "another-org", "other"), null);
  assert.equal(membershipRole(membership, "crm-org", "someone-else"), null);
  assert.equal(
    membershipRole(
      { ...membership, role: { slug: "owner" } },
      "crm-org",
      "other",
    ),
    null,
  );
  assert.equal(
    membershipRole(
      { ...membership, roles: [{ slug: "viewer" }, { slug: "member" }] },
      "crm-org",
      "other",
    ),
    "member",
  );
  assert.equal(
    membershipRole(
      { ...membership, roles: [{ slug: "admin" }, { slug: "unknown" }] },
      "crm-org",
      "other",
    ),
    null,
  );
  // A demoted or suspended user's old token role does not influence this decision.
  assert.equal(
    membershipRole(
      { ...membership, role: { slug: "viewer" } },
      "crm-org",
      "other",
    ),
    "viewer",
  );
});
test("viewers cannot mutate CRM data, and only admins manage users", () => {
  for (const role of ["admin", "member", "viewer"] as const) {
    assert.equal(can(role, "crm:read"), true);
    assert.equal(can(role, "crm:write"), role !== "viewer");
    assert.equal(can(role, "users:manage"), role === "admin");
  }
});
function fixture(
  options: { denied?: number; target?: Partial<typeof membership> } = {},
) {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string, result: unknown) =>
    async (...args: unknown[]) => {
      calls.push({ name, args });
      return result;
    };
  const users = {
    getOrganizationMembership: record("get", {
      ...membership,
      ...options.target,
    }),
    updateOrganizationMembership: record("role", {}),
    deactivateOrganizationMembership: record("suspend", {}),
    reactivateOrganizationMembership: record("restore", {}),
    sendInvitation: record("invite", {}),
    getInvitation: record("get-invitation", {
      organizationId: options.target?.organizationId ?? "crm-org",
    }),
    revokeInvitation: record("revoke-invitation", {}),
    listOrganizationMemberships: async () => ({
      autoPagination: async () => [],
    }),
    listInvitations: async () => ({ autoPagination: async () => [] }),
  } as unknown as Parameters<typeof createAdminHandlers>[0]["users"];
  const handlers = createAdminHandlers({
    users,
    authorize: async () =>
      options.denied
        ? Response.json({}, { status: options.denied })
        : { userId: "admin", organizationId: "crm-org" },
  });
  const request = (
    body: unknown,
    method = "PATCH",
    origin = "https://crm.example",
  ) =>
    new Request("https://crm.example/api/admin/users", {
      method,
      headers: { origin },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
  return { handlers, calls, request };
}
test("admin endpoints reject signed-out users, non-admins, and foreign origins before provider calls", async () => {
  for (const denied of [401, 403, 503]) {
    const f = fixture({ denied });
    for (const method of ["GET", "POST", "PATCH"] as const)
      assert.equal(
        (await f.handlers[method](f.request({}, method))).status,
        denied,
      );
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  assert.equal(
    (
      await f.handlers.PATCH(
        f.request(
          { action: "suspend", id: "membership" },
          "PATCH",
          "https://evil.example",
        ),
      )
    ).status,
    403,
  );
  assert.deepEqual(f.calls, []);
});
test("admin mutations reject cross-organization targets and self-lockout", async () => {
  for (const action of ["role", "suspend", "restore", "revoke-invitation"]) {
    const f = fixture({ target: { organizationId: "foreign-org" } });
    assert.equal(
      (
        await f.handlers.PATCH(
          f.request({ action, id: "membership", role: "viewer" }),
        )
      ).status,
      404,
    );
    assert.equal(f.calls.length, 1);
  }
  for (const action of ["role", "suspend", "restore"]) {
    const f = fixture({ target: { userId: "admin" } });
    assert.equal(
      (
        await f.handlers.PATCH(
          f.request({ action, id: "membership", role: "viewer" }),
        )
      ).status,
      409,
    );
    assert.equal(f.calls.length, 1);
  }
});
test("invitations use validated roles and the server organization and inviter", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.handlers.POST(
        f.request(
          {
            email: "TEAM@example.com",
            role: "viewer",
            organizationId: "evil",
            inviterUserId: "evil",
          },
          "POST",
        ),
      )
    ).status,
    201,
  );
  assert.deepEqual(f.calls[0], {
    name: "invite",
    args: [
      {
        email: "team@example.com",
        roleSlug: "viewer",
        organizationId: "crm-org",
        inviterUserId: "admin",
        expiresInDays: 7,
      },
    ],
  });
  for (const body of [
    { email: "bad", role: "admin" },
    { email: "team@example.com", role: "owner" },
  ])
    assert.equal((await f.handlers.POST(f.request(body, "POST"))).status, 400);
  assert.equal(f.calls.length, 1);
});
test("admins can change others' roles, suspend, restore and revoke invitations", async () => {
  for (const action of ["role", "suspend", "restore", "revoke-invitation"]) {
    const f = fixture();
    assert.equal(
      (
        await f.handlers.PATCH(
          f.request({ action, id: "membership", role: "viewer" }),
        )
      ).status,
      200,
    );
    assert.equal(f.calls[1].name, action);
  }
});

test("admin listing includes inactive users and only exposes safe invitation fields", async () => {
  const listCalls: unknown[] = [];
  const users = {
    listOrganizationMemberships: async (options: unknown) => {
      listCalls.push(options);
      return {
        autoPagination: async () => [
          {
            ...membership,
            status: "inactive",
            user: {
              id: "other",
              email: "teammate@example.com",
              firstName: "Team",
              lastName: "Mate",
            },
          },
        ],
      };
    },
    listInvitations: async (options: unknown) => {
      listCalls.push(options);
      return {
        autoPagination: async () => [
          {
            id: "pending",
            email: "invite@example.com",
            state: "pending",
            token: "secret",
            acceptInvitationUrl: "secret-url",
          },
          { id: "accepted", email: "old@example.com", state: "accepted" },
        ],
      };
    },
  } as unknown as Parameters<typeof createAdminHandlers>[0]["users"];
  const handlers = createAdminHandlers({
    users,
    authorize: async () => ({ userId: "admin", organizationId: "crm-org" }),
  });
  const response = await handlers.GET(
    new Request("https://crm.example/api/admin/users"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(listCalls, [
    { organizationId: "crm-org", statuses: ["active", "inactive", "pending"] },
    { organizationId: "crm-org" },
  ]);
  assert.deepEqual(await response.json(), {
    currentUserId: "admin",
    users: [
      {
        id: "membership",
        userId: "other",
        name: "Team Mate",
        email: "teammate@example.com",
        role: "member",
        status: "inactive",
      },
    ],
    invitations: [
      { id: "pending", email: "invite@example.com", state: "pending" },
    ],
  });
});
test("invalid admin payloads make no changes and provider errors fail closed", async () => {
  const f = fixture();
  const malformed = new Request("https://crm.example/api/admin/users", {
    method: "PATCH",
    headers: { origin: "https://crm.example" },
    body: "{",
  });
  assert.equal((await f.handlers.PATCH(malformed)).status, 400);
  assert.equal(
    (await f.handlers.PATCH(f.request({ action: "delete", id: "membership" })))
      .status,
    400,
  );
  assert.equal(
    (
      await f.handlers.PATCH(
        f.request({ action: "role", id: "membership", role: "unknown" }),
      )
    ).status,
    400,
  );
  assert.deepEqual(f.calls, []);
  const handlers = createAdminHandlers({
    authorize: async () => ({ userId: "admin", organizationId: "crm-org" }),
    users: {
      sendInvitation: async () => {
        throw new Error("provider secret");
      },
    } as unknown as Parameters<typeof createAdminHandlers>[0]["users"],
  });
  const response = await handlers.POST(
    f.request({ email: "team@example.com", role: "member" }, "POST"),
  );
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("provider secret"));
});
