import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginHandler, createLoginLimiter } from "../lib/login-handlers";

const member = {
  userId: "user",
  organizationId: "crm-org",
  status: "active",
  role: { slug: "member" },
};
const invite = {
  organizationId: "crm-org",
  email: "person@example.com",
  state: "pending",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
function fixture(
  options: {
    configured?: boolean;
    allowed?: boolean;
    membership?: Partial<typeof member>;
    invitation?: Partial<typeof invite>;
    noUser?: boolean;
    authError?: unknown;
  } = {},
) {
  const calls: { name: string; args: unknown }[] = [];
  const record = (name: string, result: unknown) => async (args: unknown) => {
    calls.push({ name, args });
    return result;
  };
  const users = {
    listUsers: record("listUsers", {
      data: options.noUser ? [] : [{ id: "user", email: "person@example.com" }],
    }),
    listOrganizationMemberships: record("memberships", {
      data: [{ ...member, ...options.membership }],
    }),
    findInvitationByToken: record("invitation", {
      ...invite,
      ...options.invitation,
    }),
    createMagicAuth: record("send", { code: "123456", secret: "never expose" }),
    authenticateWithMagicAuth: async (args: unknown) => {
      calls.push({ name: "verify", args });
      if (options.authError) throw options.authError;
      return {
        user: { id: "user" },
        accessToken: "private-token",
        refreshToken: "private-refresh",
      };
    },
  } as unknown as ReturnType<Parameters<typeof createLoginHandler>[0]["users"]>;
  const handler = createLoginHandler({
    configured: () => options.configured ?? true,
    users: () => users,
    organizationId: () => "crm-org",
    clientId: () => "client",
    allowAttempt: () => options.allowed ?? true,
    saveSession: async (session) => {
      calls.push({ name: "saveSession", args: session });
    },
  });
  const request = (body: unknown, origin = "https://crm.example") =>
    new Request("https://crm.example/api/auth/email", {
      method: "POST",
      headers: { origin },
      body: JSON.stringify(body),
    });
  return { calls, handler, request };
}
test("custom login sends a code without exposing WorkOS codes or tokens", async () => {
  const f = fixture();
  const response = await f.handler(
    f.request({ action: "send", email: "PERSON@example.com" }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(f.calls.at(-1), {
    name: "send",
    args: { email: "person@example.com" },
  });
  assert.ok(!f.calls.some((c) => c.name === "saveSession"));
});
test("unknown, suspended, and foreign-organization accounts receive the same send response", async () => {
  for (const options of [
    { noUser: true },
    { membership: { status: "inactive" } },
    { membership: { organizationId: "foreign" } },
    { membership: { role: { slug: "unknown" } } },
  ]) {
    const f = fixture(options);
    const response = await f.handler(
      f.request({ action: "send", email: "person@example.com" }),
    );
    assert.deepEqual(await response.json(), { ok: true });
    assert.ok(!f.calls.some((c) => c.name === "send"));
  }
});
test("a verified code saves the SDK session only after a fresh membership check", async () => {
  const f = fixture();
  const response = await f.handler(
    f.request({
      action: "verify",
      email: "person@example.com",
      code: "123456",
      role: "admin",
      organizationId: "evil",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(
    f.calls.map((c) => c.name),
    ["verify", "memberships", "saveSession"],
  );
  assert.deepEqual(f.calls[0].args, {
    email: "person@example.com",
    code: "123456",
    clientId: "client",
  });
  for (const membership of [
    { status: "inactive" },
    { organizationId: "evil" },
    { role: { slug: "unknown" } },
  ]) {
    const blocked = fixture({ membership });
    assert.equal(
      (
        await blocked.handler(
          blocked.request({
            action: "verify",
            email: "person@example.com",
            code: "123456",
          }),
        )
      ).status,
      403,
    );
    assert.ok(!blocked.calls.some((c) => c.name === "saveSession"));
  }
});
test("invited teammates can receive and verify codes using their invitation token", async () => {
  const f = fixture({ noUser: true });
  for (const action of ["send", "verify"]) {
    const response = await f.handler(
      f.request({
        action,
        email: "person@example.com",
        code: "123456",
        invitationToken: "invite-token",
      }),
    );
    assert.equal(response.status, 200);
  }
  assert.deepEqual(f.calls.find((c) => c.name === "send")?.args, {
    email: "person@example.com",
    invitationToken: "invite-token",
  });
  assert.deepEqual(f.calls.find((c) => c.name === "verify")?.args, {
    email: "person@example.com",
    code: "123456",
    clientId: "client",
    invitationToken: "invite-token",
  });
});
test("foreign, revoked, mismatched, and expired invitations cannot send codes or authenticate", async () => {
  for (const invitation of [
    { organizationId: "evil" },
    { email: "someone-else@example.com" },
    { state: "revoked" },
    { expiresAt: new Date(0).toISOString() },
  ]) {
    const f = fixture({ invitation, noUser: true });
    assert.equal(
      (
        await f.handler(
          f.request({
            action: "send",
            email: "person@example.com",
            invitationToken: "token",
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await f.handler(
          f.request({
            action: "verify",
            email: "person@example.com",
            code: "123456",
            invitationToken: "token",
          }),
        )
      ).status,
      400,
    );
    assert.ok(
      !f.calls.some((c) => ["send", "verify", "saveSession"].includes(c.name)),
    );
  }
});
test("login rejects foreign origins, missing configuration, malformed codes, and excess attempts", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.handler(
        f.request(
          { action: "send", email: "person@example.com" },
          "https://evil.example",
        ),
      )
    ).status,
    403,
  );
  for (const body of [
    { action: "send", email: "bad" },
    { action: "verify", email: "person@example.com", code: "x" },
    { action: "verify", email: "person@example.com" },
  ])
    assert.equal((await f.handler(f.request(body))).status, 400);
  assert.deepEqual(f.calls, []);
  for (const [options, status] of [
    [{ configured: false }, 503],
    [{ allowed: false }, 429],
  ] as const) {
    const denied = fixture(options);
    assert.equal(
      (
        await denied.handler(
          denied.request({ action: "send", email: "person@example.com" }),
        )
      ).status,
      status,
    );
    assert.deepEqual(denied.calls, []);
  }
});
test("invalid or expired provider codes and provider outages never save a session", async () => {
  for (const [authError, status] of [
    [{ status: 400, message: "private provider response" }, 400],
    [{ status: 429 }, 429],
    [{ status: 500 }, 503],
    [{ status: 400, code: "mfa_challenge" }, 403],
  ] as const) {
    const f = fixture({ authError });
    const response = await f.handler(
      f.request({
        action: "verify",
        email: "person@example.com",
        code: "123456",
      }),
    );
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes("private provider response"));
    assert.ok(!f.calls.some((c) => c.name === "saveSession"));
  }
});
test("login throttling bounds both recipient attempts and total process requests", () => {
  const allow = createLoginLimiter();
  for (let i = 0; i < 3; i++)
    assert.equal(allow("send", "person@example.com"), true);
  assert.equal(allow("send", "person@example.com"), false);
  for (let i = 0; i < 10; i++)
    assert.equal(allow("verify", "person@example.com"), true);
  assert.equal(allow("verify", "person@example.com"), false);
  const global = createLoginLimiter();
  for (let i = 0; i < 60; i++)
    assert.equal(global("send", `person-${i}@example.com`), true);
  assert.equal(global("send", "another@example.com"), false);
});

test("active members can send and verify codes from old invitation links without reusing the token", async () => {
  for (const invitation of [
    { state: "accepted" },
    { expiresAt: new Date(0).toISOString() },
    { state: "revoked" },
    { organizationId: "other-org", email: "someone-else@example.com" },
  ]) {
    const f = fixture({ invitation });
    for (const action of ["send", "verify"]) {
      const response = await f.handler(
        f.request({
          action,
          email: "person@example.com",
          code: "123456",
          invitationToken: "old-token",
        }),
      );
      assert.equal(response.status, 200);
    }
    assert.ok(!f.calls.some((c) => c.name === "invitation"));
    assert.deepEqual(f.calls.find((c) => c.name === "send")?.args, {
      email: "person@example.com",
    });
    assert.deepEqual(f.calls.find((c) => c.name === "verify")?.args, {
      clientId: "client",
      email: "person@example.com",
      code: "123456",
    });
    assert.equal(f.calls.filter((c) => c.name === "saveSession").length, 1);
  }
});
test("an invitation accepted between requesting and verifying a code does not block the new active member", async () => {
  const requesting = fixture({ noUser: true });
  assert.equal(
    (
      await requesting.handler(
        requesting.request({
          action: "send",
          email: "person@example.com",
          invitationToken: "token",
        }),
      )
    ).status,
    200,
  );
  // Membership is now active, while the browser still holds the old link's token.
  const verifying = fixture({ invitation: { state: "accepted" } });
  assert.equal(
    (
      await verifying.handler(
        verifying.request({
          action: "verify",
          email: "person@example.com",
          code: "123456",
          invitationToken: "token",
        }),
      )
    ).status,
    200,
  );
  assert.ok(verifying.calls.some((c) => c.name === "saveSession"));
  assert.ok(!verifying.calls.some((c) => c.name === "invitation"));
});
test("an accepted invitation does not restore suspended, foreign, or unrecognized memberships", async () => {
  for (const membership of [
    { status: "inactive" },
    { organizationId: "other-org" },
    { role: { slug: "unknown" } },
  ]) {
    const f = fixture({ membership, invitation: { state: "accepted" } });
    for (const action of ["send", "verify"]) {
      const response = await f.handler(
        f.request({
          action,
          email: "person@example.com",
          code: "123456",
          invitationToken: "old-token",
        }),
      );
      assert.equal(response.status, action === "send" ? 200 : 400);
    }
    assert.ok(
      !f.calls.some((c) => ["send", "verify", "saveSession"].includes(c.name)),
    );
  }
});
test("a stale invitation never substitutes for a valid verification code for an active member", async () => {
  const f = fixture({
    invitation: { state: "accepted" },
    authError: { status: 400 },
  });
  assert.equal(
    (
      await f.handler(
        f.request({
          action: "verify",
          email: "person@example.com",
          code: "000000",
          invitationToken: "old-token",
        }),
      )
    ).status,
    400,
  );
  assert.ok(!f.calls.some((c) => c.name === "saveSession"));
});
