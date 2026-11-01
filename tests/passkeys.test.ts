import { test } from "node:test";
import assert from "node:assert/strict";
import { createPasskeyHandlers, PasskeyError } from "../lib/passkey-handlers";

type Data = Record<string, unknown>;
function fixture(
  options: { denied?: number; result?: Data; failure?: Error } = {},
) {
  const calls: {
    token: string;
    query: string;
    variables: object;
    origin: string;
  }[] = [];
  const handlers = createPasskeyHandlers({
    authorize: async () =>
      options.denied
        ? Response.json({ error: "Access denied." }, { status: options.denied })
        : { accessToken: "current-user-session" },
    execute: async (token, query, variables, origin) => {
      calls.push({ token, query, variables, origin });
      if (options.failure) throw options.failure;
      return options.result ?? {};
    },
  });
  const request = (body?: object, origin = "https://crm.example") =>
    new Request("https://crm.example/api/account/passkeys", {
      method: body ? "POST" : "GET",
      headers: { origin },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { calls, handlers, request };
}
test("passkey endpoints reject signed-out, suspended and unconfigured access without contacting WorkOS", async () => {
  for (const denied of [401, 403, 503]) {
    const f = fixture({ denied });
    assert.equal((await f.handlers.GET(f.request())).status, denied);
    assert.equal(
      (await f.handlers.POST(f.request({ action: "send-verification" })))
        .status,
      denied,
    );
    assert.deepEqual(f.calls, []);
  }
});
test("passkey listing uses only the signed-in session and does not expose provider secrets", async () => {
  const f = fixture({
    result: {
      passkeys: [
        {
          id: "key",
          createdAt: "2026-11-01T00:00:00Z",
          lastVerifiedAt: null,
          private: "secret",
        },
      ],
    },
  });
  const response = await f.handlers.GET(f.request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    passkeys: [
      { id: "key", createdAt: "2026-11-01T00:00:00Z", lastVerifiedAt: null },
    ],
  });
  assert.equal(f.calls[0].token, "current-user-session");
  assert.deepEqual(f.calls[0].variables, {});
});
test("foreign origins and missing elevation cannot create or remove passkeys", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.handlers.POST(
        f.request({ action: "send-verification" }, "https://evil.example"),
      )
    ).status,
    403,
  );
  for (const body of [
    { action: "register" },
    { action: "delete", passkeyId: "key" },
    {
      action: "verify-email",
      code: "abc",
      authenticationChallengeId: "challenge",
    },
    {
      action: "finish-registration",
      elevatedAccessToken: "proof",
      challengeId: "challenge",
      response: {},
    },
    { action: "arbitrary-query", query: "query { me { id } }" },
  ])
    assert.equal((await f.handlers.POST(f.request(body))).status, 400);
  assert.deepEqual(f.calls, []);
});
test("verification is bound to the current user's session, never a browser-supplied user or email", async () => {
  const f = fixture({
    result: {
      sendVerificationCode: {
        __typename: "VerificationCodeSent",
        authenticationChallengeId: "challenge",
        expiresAt: "2026-11-01T12:00:00Z",
      },
    },
  });
  const response = await f.handlers.POST(
    f.request({
      action: "send-verification",
      userId: "victim",
      email: "victim@example.com",
      accessToken: "other-user",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(f.calls[0].token, "current-user-session");
  assert.deepEqual(f.calls[0].variables, {});
  const verified = fixture({
    result: {
      verifyCurrentEmail: {
        __typename: "CurrentEmailVerified",
        elevatedAccessToken: "short-lived-proof",
        expiresAt: "2026-11-01T12:00:00Z",
      },
    },
  });
  assert.equal(
    (
      await verified.handlers.POST(
        verified.request({
          action: "verify-email",
          code: "123456",
          authenticationChallengeId: "challenge",
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(verified.calls[0].variables, {
    input: { authenticationChallengeId: "challenge", code: "123456" },
  });
});
test("registration passes WorkOS's challenge and attestation through without changing credential options", async () => {
  const options = {
    challenge: "webauthn-challenge",
    rp: { id: "crm.example", name: "CRM" },
  };
  const start = fixture({
    result: {
      registerPasskey: {
        __typename: "PasskeyRegistrationOptions",
        challengeId: "challenge",
        options,
      },
    },
  });
  const response = await start.handlers.POST(
    start.request({ action: "register", elevatedAccessToken: "proof" }),
  );
  assert.deepEqual(await response.json(), {
    challengeId: "challenge",
    options,
  });
  assert.deepEqual(start.calls[0].variables, {
    input: { elevatedAccessToken: "proof" },
  });
  const attestation = {
    id: "credential",
    rawId: "encoded",
    type: "public-key",
    response: {
      clientDataJSON: "client-data",
      attestationObject: "attestation",
      transports: ["internal"],
    },
    clientExtensionResults: {},
  };
  const finish = fixture({
    result: { verifyPasskey: { __typename: "PasskeyVerified", success: true } },
  });
  assert.equal(
    (
      await finish.handlers.POST(
        finish.request({
          action: "finish-registration",
          elevatedAccessToken: "proof",
          challengeId: "challenge",
          response: attestation,
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(finish.calls[0].variables, {
    input: {
      elevatedAccessToken: "proof",
      challengeId: "challenge",
      response: attestation,
    },
  });
});
test("passkey removal is scoped to the current session and requires proof; missing keys are rejected", async () => {
  const f = fixture({
    result: { deletePasskey: { __typename: "PasskeyDeleted", success: true } },
  });
  assert.equal(
    (
      await f.handlers.POST(
        f.request({
          action: "delete",
          elevatedAccessToken: "proof",
          passkeyId: "key",
          userId: "victim",
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(f.calls[0].variables, {
    input: { elevatedAccessToken: "proof", passkeyId: "key" },
  });
  const missing = fixture({
    result: { deletePasskey: { __typename: "PasskeyNotFound" } },
  });
  assert.equal(
    (
      await missing.handlers.POST(
        missing.request({
          action: "delete",
          elevatedAccessToken: "proof",
          passkeyId: "other-users-key",
        }),
      )
    ).status,
    404,
  );
});
test("expired elevation, bad verification codes, and failed attestations never report success", async () => {
  for (const [field, tag, body, status] of [
    [
      "registerPasskey",
      "ElevatedAccessTokenExpired",
      { action: "register", elevatedAccessToken: "old-proof" },
      403,
    ],
    [
      "deletePasskey",
      "ElevatedAccessTokenInvalid",
      {
        action: "delete",
        elevatedAccessToken: "wrong-proof",
        passkeyId: "key",
      },
      403,
    ],
    [
      "verifyCurrentEmail",
      "VerificationCodeIncorrect",
      {
        action: "verify-email",
        authenticationChallengeId: "challenge",
        code: "000000",
      },
      400,
    ],
    [
      "sendVerificationCode",
      "DailyEmailQuotaExceeded",
      { action: "send-verification" },
      429,
    ],
  ] as const) {
    const f = fixture({ result: { [field]: { __typename: tag } } });
    assert.equal((await f.handlers.POST(f.request(body))).status, status);
  }
  const f = fixture({ failure: new Error("private-provider-token") });
  const response = await f.handlers.GET(f.request());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private-provider-token"));
  const limited = fixture({
    failure: new PasskeyError("Wait and retry.", 429),
  });
  assert.equal((await limited.handlers.GET(limited.request())).status, 429);
});
