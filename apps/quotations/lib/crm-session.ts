import { createHash, randomBytes } from "node:crypto";
import { connectionOrigin } from "./crm-bridge";

const SESSION = "homliv-quotation-session";
const PROOF = "homliv-quotation-proof";
const secret = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
function cookieValue(request: Request, name: string) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value && secret.test(value) ? value : undefined;
}
function cookie(request: Request, name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/api/crm; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
const json = (data: object, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function createCrmSessionHandler({
  crmUrl,
  fetchRemote = fetch,
}: {
  crmUrl: () => string | undefined;
  fetchRemote?: typeof fetch;
}) {
  return async (request: Request, action: string): Promise<Response> => {
    const origin = connectionOrigin(crmUrl());
    if (!origin) return json({ error: "Homliv CRM is not configured." }, 503);
    if (
      request.method === "POST" &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      return json({ error: "Invalid request origin." }, 403);
    const token = cookieValue(request, SESSION);
    async function remote(action: string, body?: object, credential = token) {
      return fetchRemote(`${origin}/api/quotation-connection/${action}`, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
        body: JSON.stringify(body ?? {}),
      });
    }
    try {
      if (action === "connect" && request.method === "GET") {
        const verifier = randomBytes(32).toString("base64url");
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${origin}/quotations/connect?challenge=${hash(verifier)}`,
            "Set-Cookie": cookie(request, PROOF, verifier, 600),
            "Cache-Control": "no-store",
          },
        });
      }
      if (action === "connect" && request.method === "POST") {
        const verifier = cookieValue(request, PROOF);
        const raw = await request.text();
        if (raw.length > 1000)
          return json({ error: "Invalid sign-in response." }, 400);
        const body = JSON.parse(raw);
        if (
          !verifier ||
          typeof body.code !== "string" ||
          !secret.test(body.code)
        )
          return json({ error: "Sign-in expired. Please connect again." }, 401);
        const response = await remote(
          "exchange",
          { code: body.code, verifier, audience: new URL(request.url).origin },
          undefined,
        );
        const data = await response.json();
        if (!response.ok)
          return json(
            { error: data.error || "Could not complete sign-in." },
            response.status,
          );
        if (
          typeof data.token !== "string" ||
          !secret.test(data.token) ||
          !Number.isFinite(Date.parse(data.expiresAt))
        )
          return json({ error: "Invalid CRM connection response." }, 502);
        const result = json({ connected: true });
        result.headers.append(
          "Set-Cookie",
          cookie(
            request,
            SESSION,
            data.token,
            Math.max(
              0,
              Math.floor((Date.parse(data.expiresAt) - Date.now()) / 1000),
            ),
          ),
        );
        result.headers.append("Set-Cookie", cookie(request, PROOF, "", 0));
        return result;
      }
      if (action === "disconnect" && request.method === "POST") {
        let revoked = true;
        if (token) {
          try {
            const response = await remote("revoke");
            revoked = response.ok || response.status === 401;
          } catch {
            revoked = false;
          }
        }
        const result = json({ connected: false, revoked });
        result.headers.append("Set-Cookie", cookie(request, SESSION, "", 0));
        result.headers.append("Set-Cookie", cookie(request, PROOF, "", 0));
        return result;
      }
      if (action !== "connection" && action !== "operation")
        return json({ error: "Unknown connection operation." }, 404);
      if (
        (action === "connection" && request.method !== "GET") ||
        (action === "operation" && request.method !== "POST")
      )
        return json({ error: "Method not allowed." }, 405);
      if (!token)
        return action === "connection"
          ? json({ connected: false })
          : json({ error: "Sign in with Homliv CRM first." }, 401);
      let body: object | undefined;
      if (action === "operation") {
        const raw = await request.text();
        if (raw.length > 2_000_000)
          return json({ error: "Quotation is too large." }, 413);
        body = JSON.parse(raw);
      }
      const response = await remote(
        action === "connection" ? "status" : "operation",
        body,
      );
      const data = await response.json();
      const result = json(
        response.ok
          ? data
          : {
              error: data.error || "CRM request failed.",
              connectionEnded: data.connectionEnded === true,
            },
        response.status,
      );
      if (response.status === 401 || data.connectionEnded === true)
        result.headers.append("Set-Cookie", cookie(request, SESSION, "", 0));
      return result;
    } catch (error) {
      return json(
        {
          error:
            error instanceof SyntaxError
              ? "Invalid connection request."
              : "Could not reach Homliv CRM. Your local quotation is preserved.",
        },
        error instanceof SyntaxError ? 400 : 503,
      );
    }
  };
}
