import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  bridgeRequestSchema,
  bridgeEndpoint,
} from "@crm/quotations/crm-bridge";
import { can, sameOrigin, type Role } from "../access-policy";
import type { getDb as databaseFactory } from "../db";
import { quotationConnections } from "../db/schema";
import { createQuotationHandlers } from "./quotation-handlers";

const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
type Access = { userId: string; sessionId: string; organizationId: string };
type Dependencies = {
  getDb: typeof databaseFactory;
  authorize: () => Promise<Access | Response>;
  validate: (
    context: Access,
  ) => Promise<{ status: number; role?: Role; error?: string }>;
  audience: () => string;
  organizationId: () => string;
  snapshot: () => Promise<unknown>;
};
const json = (data: object, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function createConnectionHandler(deps: Dependencies) {
  return async (request: Request, action: string): Promise<Response> => {
    try {
      if (!deps.audience())
        return json(
          { error: "The quotation maker URL is not configured." },
          503,
        );
      const db = deps.getDb();
      if (action === "issue") {
        if (!sameOrigin(request))
          return json({ error: "Invalid request origin." }, 403);
        const access = await deps.authorize();
        if (access instanceof Response) return access;
        const { challenge } = z
          .object({ challenge: secret })
          .parse(await request.json());
        const code = randomBytes(32).toString("base64url");
        await db.insert(quotationConnections).values({
          ...access,
          audience: deps.audience(),
          challenge,
          codeHash: hash(code),
          codeExpiresAt: new Date(Date.now() + 120_000),
          expiresAt: new Date(Date.now() + 7 * 86400_000),
        });
        return json({ code });
      }
      if (action === "exchange") {
        const body = z
          .object({ code: secret, verifier: secret, audience: z.string() })
          .parse(await request.json());
        if (body.audience !== deps.audience())
          return json({ error: "Invalid connection destination." }, 403);
        const token = randomBytes(32).toString("base64url");
        // Atomic consumption prevents replay, including simultaneous exchanges.
        const [connection] = await db
          .update(quotationConnections)
          .set({ tokenHash: hash(token) })
          .where(
            and(
              eq(quotationConnections.codeHash, hash(body.code)),
              eq(quotationConnections.challenge, hash(body.verifier)),
              eq(quotationConnections.audience, body.audience),
              eq(quotationConnections.organizationId, deps.organizationId()),
              isNull(quotationConnections.tokenHash),
              gt(quotationConnections.codeExpiresAt, new Date()),
              gt(quotationConnections.expiresAt, new Date()),
            ),
          )
          .returning({ expiresAt: quotationConnections.expiresAt });
        if (!connection)
          return json(
            {
              error:
                "This sign-in connection expired or was already used. Sign in again.",
            },
            401,
          );
        return json({ token, expiresAt: connection.expiresAt.toISOString() });
      }
      const token = secret.safeParse(
        request.headers
          .get("authorization")
          ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1],
      );
      if (!token.success)
        return json({ error: "Connect to Homliv CRM again." }, 401);
      const [connection] = await db
        .select()
        .from(quotationConnections)
        .where(
          and(
            eq(quotationConnections.tokenHash, hash(token.data)),
            eq(quotationConnections.organizationId, deps.organizationId()),
            eq(quotationConnections.audience, deps.audience()),
            gt(quotationConnections.expiresAt, new Date()),
          ),
        );
      if (!connection)
        return json(
          { error: "Your CRM connection has ended. Sign in again." },
          401,
        );
      if (action === "revoke") {
        await db
          .delete(quotationConnections)
          .where(eq(quotationConnections.id, connection.id));
        return json({ ok: true });
      }
      const access = await deps.validate(connection);
      if (access.status !== 200 || !access.role)
        return json(
          {
            error: access.error || "Your CRM connection has ended.",
            connectionEnded: access.status === 401 || access.status === 403,
          },
          access.status === 200 ? 403 : access.status,
        );
      if (action === "status") return json({ connected: true });
      if (action !== "operation")
        return json({ error: "Unknown connection operation." }, 404);
      const raw = await request.text();
      if (raw.length > 2_000_000)
        return json({ error: "Quotation is too large." }, 413);
      const command = bridgeRequestSchema.parse(JSON.parse(raw));
      if (command.action === "snapshot")
        return json({
          ...((await deps.snapshot()) as object),
          role: access.role,
        });
      const handlers = createQuotationHandlers({
        getDb: deps.getDb,
        authorize: async (permission) =>
          can(access.role!, permission)
            ? access
            : json({ error: "Your role does not allow this action." }, 403),
      });
      const { path, init } = bridgeEndpoint(command);
      const url = new URL(path, request.url);
      const forwarded = new Request(url, {
        ...init,
        headers: { ...init?.headers, Origin: url.origin },
      });
      return command.action === "save"
        ? handlers.POST(forwarded)
        : command.action === "delete"
          ? handlers.DELETE(forwarded)
          : handlers.GET(forwarded);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json({ error: "Invalid connection request." }, 400);
      return json(
        { error: "Could not connect to Homliv CRM. Please try again." },
        503,
      );
    }
  };
}
