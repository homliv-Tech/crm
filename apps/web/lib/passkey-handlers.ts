import { z } from "zod";
import { sameOrigin } from "./access-policy";

export type Passkey = {
  id: string;
  createdAt: string;
  lastVerifiedAt: string | null;
};
const elevated = z.string().min(1).max(8192);
const identifier = z.string().min(1).max(256);
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send-verification") }),
  z.object({
    action: z.literal("verify-email"),
    authenticationChallengeId: identifier,
    code: z.string().regex(/^\d{6}$/),
  }),
  z.object({ action: z.literal("register"), elevatedAccessToken: elevated }),
  z.object({
    action: z.literal("finish-registration"),
    elevatedAccessToken: elevated,
    challengeId: identifier,
    response: z
      .object({
        id: identifier,
        rawId: z.string().min(1),
        type: z.literal("public-key"),
        response: z
          .object({
            clientDataJSON: z.string().min(1),
            attestationObject: z.string().min(1),
          })
          .passthrough(),
        clientExtensionResults: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
  }),
  z.object({
    action: z.literal("delete"),
    elevatedAccessToken: elevated,
    passkeyId: identifier,
  }),
]);
const queries = {
  list: `query CrmPasskeys { passkeys { id createdAt lastVerifiedAt } }`,
  send: `mutation CrmSendVerification { sendVerificationCode { __typename ... on VerificationCodeSent { authenticationChallengeId expiresAt } } }`,
  verify: `mutation CrmVerifyEmail($input: VerifyCurrentEmailInput!) { verifyCurrentEmail(input: $input) { __typename ... on CurrentEmailVerified { elevatedAccessToken expiresAt } } }`,
  register: `mutation CrmRegisterPasskey($input: RegisterPasskeyInput!) { registerPasskey(input: $input) { __typename ... on PasskeyRegistrationOptions { challengeId options } } }`,
  finish: `mutation CrmVerifyPasskey($input: VerifyPasskeyInput!) { verifyPasskey(input: $input) { __typename ... on PasskeyVerified { success } } }`,
  remove: `mutation CrmDeletePasskey($input: DeletePasskeyInput!) { deletePasskey(input: $input) { __typename ... on PasskeyDeleted { success } } }`,
};
type GraphqlData = Record<string, unknown>;
type Dependencies = {
  authorize: () => Promise<{ accessToken: string } | Response>;
  execute: (
    token: string,
    query: string,
    variables: object,
    origin: string,
  ) => Promise<GraphqlData>;
};
export class PasskeyError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
// Fixed WorkOS endpoint and queries keep this from becoming a general API proxy.
export async function executePasskeyQuery(
  token: string,
  query: string,
  variables: object,
  origin: string,
): Promise<GraphqlData> {
  const response = await fetch("https://api.workos.com/client/graphql", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok)
    throw new PasskeyError(
      response.status === 429
        ? "Too many attempts. Wait a minute and try again."
        : "Passkey settings are temporarily unavailable.",
      response.status === 429 ? 429 : 503,
    );
  const result = await response.json();
  if (result.errors?.length || !result.data)
    throw new PasskeyError(
      "Could not access passkey settings. Sign in again and try again.",
    );
  return result.data;
}
function outcome(value: unknown, expected: string) {
  const result = z
    .object({ __typename: z.string() })
    .passthrough()
    .parse(value);
  if (result.__typename === expected) return result;
  if (
    ["ElevatedAccessTokenExpired", "ElevatedAccessTokenInvalid"].includes(
      result.__typename,
    )
  )
    throw new PasskeyError(
      "Verify your email again before changing passkeys.",
      403,
    );
  if (
    result.__typename === "DailyEmailQuotaExceeded" ||
    result.__typename === "VerificationTooManyAttempts"
  )
    throw new PasskeyError(
      "Too many verification attempts. Please try again later.",
      429,
    );
  if (result.__typename === "PasskeyNotFound")
    throw new PasskeyError(
      "This passkey was not found in your account. Reload the list.",
      404,
    );
  if (result.__typename.startsWith("VerificationCode"))
    throw new PasskeyError(
      "The verification code is incorrect, expired, or already used. Request a new code.",
      400,
    );
  if (
    ["PasskeyChallengeNotFound", "PasskeyVerificationFailed"].includes(
      result.__typename,
    )
  )
    throw new PasskeyError(
      "Passkey registration could not be verified. Start again.",
      400,
    );
  throw new PasskeyError("Could not update passkeys. Please try again.");
}
export function createPasskeyHandlers(deps: Dependencies) {
  async function handle(request: Request) {
    const access = await deps.authorize();
    if (access instanceof Response) return access;
    const json = (data: object, status = 200) =>
      Response.json(data, {
        status,
        headers: { "Cache-Control": "private, no-store" },
      });
    if (request.method !== "GET" && !sameOrigin(request))
      return json({ error: "Invalid request origin." }, 403);
    const execute = (query: string, variables: object = {}) =>
      deps.execute(
        access.accessToken,
        query,
        variables,
        new URL(request.url).origin,
      );
    try {
      if (request.method === "GET") {
        const result = await execute(queries.list);
        const passkeys = z
          .array(
            z.object({
              id: z.string(),
              createdAt: z.string(),
              lastVerifiedAt: z.string().nullable(),
            }),
          )
          .parse(result.passkeys);
        return json({ passkeys });
      }
      const text = await request.text();
      if (text.length > 131072)
        return json({ error: "Request is too large." }, 413);
      const body = mutation.parse(JSON.parse(text));
      switch (body.action) {
        case "send-verification": {
          const data = await execute(queries.send);
          const result = outcome(
            data.sendVerificationCode,
            "VerificationCodeSent",
          );
          return json(
            z
              .object({
                authenticationChallengeId: z.string(),
                expiresAt: z.string(),
              })
              .parse(result),
          );
        }
        case "verify-email": {
          const { authenticationChallengeId, code } = body;
          const data = await execute(queries.verify, {
            input: { authenticationChallengeId, code },
          });
          const result = outcome(
            data.verifyCurrentEmail,
            "CurrentEmailVerified",
          );
          return json(
            z
              .object({
                elevatedAccessToken: z.string(),
                expiresAt: z.string(),
              })
              .parse(result),
          );
        }
        case "register": {
          const data = await execute(queries.register, {
            input: { elevatedAccessToken: body.elevatedAccessToken },
          });
          const result = outcome(
            data.registerPasskey,
            "PasskeyRegistrationOptions",
          );
          return json(
            z
              .object({
                challengeId: z.string(),
                options: z.record(z.string(), z.unknown()),
              })
              .parse(result),
          );
        }
        case "finish-registration": {
          const { elevatedAccessToken, challengeId, response } = body;
          const data = await execute(queries.finish, {
            input: { elevatedAccessToken, challengeId, response },
          });
          const result = outcome(data.verifyPasskey, "PasskeyVerified");
          if (result.success !== true)
            throw new PasskeyError("Passkey registration failed.");
          return json({ ok: true });
        }
        case "delete": {
          const data = await execute(queries.remove, {
            input: {
              elevatedAccessToken: body.elevatedAccessToken,
              passkeyId: body.passkeyId,
            },
          });
          const result = outcome(data.deletePasskey, "PasskeyDeleted");
          if (result.success !== true)
            throw new PasskeyError("Could not remove this passkey.");
          return json({ ok: true });
        }
      }
    } catch (error) {
      if (error instanceof PasskeyError)
        return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError)
        return json({ error: "Invalid request." }, 400);
      if (error instanceof z.ZodError)
        return json(
          { error: "Invalid passkey request or provider response." },
          400,
        );
      return json(
        { error: "Could not access passkey settings. Please try again." },
        503,
      );
    }
  }
  return { GET: handle, POST: handle };
}
