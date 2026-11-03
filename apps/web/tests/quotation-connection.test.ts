import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createConnectionHandler } from "../lib/crm/connection-handlers";
import { createCrmSessionHandler } from "../../quotations/lib/crm-session";
import { quotationConnections } from "../lib/db/schema";
import type { getDb } from "../lib/db";

const crm = "https://crm.example";
const maker = "https://quotes.example";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const secret = () => randomBytes(32).toString("base64url");
function request(
  base: string,
  action: string,
  body?: object,
  headers: Record<string, string> = {},
) {
  return new Request(`${base}/api/${action}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: base, "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("connection sessions survive popup closure and server restarts, keep secrets HttpOnly, and revoke on disconnect", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const access = {
      userId: "user_1",
      sessionId: "session_1",
      organizationId: "org_1",
    };
    let role: "member" | "viewer" = "member";
    let sessionActive = true;
    const remote = createConnectionHandler({
      getDb: () => db as unknown as ReturnType<typeof getDb>,
      authorize: async () => access,
      validate: async () =>
        sessionActive
          ? { status: 200, role }
          : { status: 401, error: "Revoked session" },
      audience: () => maker,
      organizationId: () => access.organizationId,
      snapshot: async () => ({ companies: [{ name: "Saved client" }] }),
    });
    const fetchRemote: typeof fetch = async (url, init) => {
      const req = new Request(url as string, init);
      return remote(req, new URL(req.url).pathname.split("/").at(-1)!);
    };
    const proxy = () =>
      createCrmSessionHandler({ crmUrl: () => crm, fetchRemote });
    const start = await proxy()(request(maker, "crm/connect"), "connect");
    assert.equal(start.status, 302);
    const proofCookie = start.headers.getSetCookie()[0];
    assert.match(proofCookie, /HttpOnly/);
    assert.match(proofCookie, /Secure/);
    assert.match(proofCookie, /SameSite=Lax/);
    const challenge = new URL(start.headers.get("location")!).searchParams.get(
      "challenge",
    )!;
    const issued = await remote(
      request(crm, "quotation-connection/issue", { challenge }),
      "issue",
    );
    const { code } = await issued.json();
    const exchange = await proxy()(
      request(
        maker,
        "crm/connect",
        { code },
        { cookie: proofCookie.split(";")[0] },
      ),
      "connect",
    );
    assert.equal(exchange.status, 200);
    assert.deepEqual(await exchange.json(), { connected: true });
    const connectionCookie = exchange.headers
      .getSetCookie()
      .find((value) => value.startsWith("homliv-quotation-session="))!;
    assert.match(connectionCookie, /HttpOnly/);
    assert.match(connectionCookie, /Secure/);
    const cookie = connectionCookie.split(";")[0];
    const headers = { cookie };
    const [saved] = await db.select().from(quotationConnections);
    assert.notEqual(saved.codeHash, code);
    assert.notEqual(saved.tokenHash, cookie.split("=")[1]);
    assert.equal(saved.codeHash, hash(code));
    // New handlers restore the cookie session without a popup or in-memory state.
    const status = await proxy()(
      request(maker, "crm/connection", undefined, headers),
      "connection",
    );
    assert.deepEqual(await status.json(), { connected: true });
    const snapshot = await proxy()(
      request(
        maker,
        "crm/operation",
        {
          type: "homliv-crm:request",
          id: crypto.randomUUID(),
          action: "snapshot",
        },
        headers,
      ),
      "operation",
    );
    assert.equal((await snapshot.json()).companies[0].name, "Saved client");
    role = "viewer";
    // Current membership role is fetched afresh rather than stored in the cookie.
    const snapshot2 = await proxy()(
      request(
        maker,
        "crm/operation",
        {
          type: "homliv-crm:request",
          id: crypto.randomUUID(),
          action: "snapshot",
        },
        headers,
      ),
      "operation",
    );
    assert.equal((await snapshot2.json()).role, "viewer");
    const deniedWrite = await proxy()(
      request(
        maker,
        "crm/operation",
        {
          type: "homliv-crm:request",
          id: crypto.randomUUID(),
          action: "save",
          document: {},
          version: 0,
        },
        headers,
      ),
      "operation",
    );
    assert.equal(deniedWrite.status, 403);
    assert.equal(deniedWrite.headers.get("set-cookie"), null);
    assert.equal(
      (
        await proxy()(
          request(maker, "crm/connection", undefined, headers),
          "connection",
        )
      ).status,
      200,
    );
    sessionActive = false;
    const revoked = await proxy()(
      request(maker, "crm/connection", undefined, headers),
      "connection",
    );
    assert.equal(revoked.status, 401);
    assert.match(revoked.headers.get("set-cookie")!, /Max-Age=0/);
    // Disconnect can revoke its grant even after the underlying WorkOS session ends.
    const disconnected = await proxy()(
      request(maker, "crm/disconnect", {}, headers),
      "disconnect",
    );
    assert.equal((await disconnected.json()).revoked, true);
    assert.equal((await db.select().from(quotationConnections)).length, 0);
    assert.equal(
      (
        await proxy()(
          request(maker, "crm/connection", undefined, headers),
          "connection",
        )
      ).status,
      401,
    );
    assert.deepEqual(
      await (
        await proxy()(request(maker, "crm/connection"), "connection")
      ).json(),
      { connected: false },
    );
  } finally {
    await client.close();
  }
});

test("connection codes enforce PKCE, destination, expiry, origin and atomic single use", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    let allowed = true;
    const remote = createConnectionHandler({
      getDb: () => db as unknown as ReturnType<typeof getDb>,
      authorize: async () =>
        allowed
          ? {
              userId: "user_1",
              sessionId: "session_1",
              organizationId: "org_1",
            }
          : Response.json({ error: "Forbidden" }, { status: 403 }),
      validate: async () => ({ status: 200, role: "viewer" }),
      audience: () => maker,
      organizationId: () => "org_1",
      snapshot: async () => ({}),
    });
    const verifier = secret();
    const challenge = hash(verifier);
    allowed = false;
    assert.equal(
      (await remote(request(crm, "issue", { challenge }), "issue")).status,
      403,
    );
    allowed = true;
    assert.equal(
      (
        await remote(
          request(
            crm,
            "issue",
            { challenge },
            { origin: "https://evil.example" },
          ),
          "issue",
        )
      ).status,
      403,
    );
    const { code } = await (
      await remote(request(crm, "issue", { challenge }), "issue")
    ).json();
    const exchange = (body: object) =>
      remote(request(crm, "exchange", body), "exchange");
    assert.equal(
      (await exchange({ code, verifier: secret(), audience: maker })).status,
      401,
    );
    assert.equal(
      (await exchange({ code, verifier, audience: "https://evil.example" }))
        .status,
      403,
    );
    const simultaneous = await Promise.all([
      exchange({ code, verifier, audience: maker }),
      exchange({ code, verifier, audience: maker }),
    ]);
    assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 401]);
    const { token } = await simultaneous.find((r) => r.status === 200)!.json();
    await db
      .update(quotationConnections)
      .set({ expiresAt: new Date(0) })
      .where(eq(quotationConnections.tokenHash, hash(token)));
    assert.equal(
      (
        await remote(
          request(crm, "status", {}, { Authorization: `Bearer ${token}` }),
          "status",
        )
      ).status,
      401,
    );
    const issued = await (
      await remote(request(crm, "issue", { challenge }), "issue")
    ).json();
    await db
      .update(quotationConnections)
      .set({ codeExpiresAt: new Date(0) })
      .where(eq(quotationConnections.codeHash, hash(issued.code)));
    assert.equal(
      (await exchange({ code: issued.code, verifier, audience: maker })).status,
      401,
    );
    assert.equal(
      (await remote(request(crm, "operation", {}), "operation")).status,
      401,
    );
    const proxy = createCrmSessionHandler({ crmUrl: () => crm });
    assert.equal(
      (
        await proxy(
          request(
            maker,
            "crm/connect",
            { code },
            { origin: "https://evil.example" },
          ),
          "connect",
        )
      ).status,
      403,
    );
    assert.equal(
      (await proxy(request(maker, "crm/connect", { code }), "connect")).status,
      401,
    );
  } finally {
    await client.close();
  }
});

test("CRM outages preserve connections for retry while disconnect still clears the browser cookie", async () => {
  const cookie = `homliv-quotation-session=${secret()}`;
  const proxy = createCrmSessionHandler({
    crmUrl: () => crm,
    fetchRemote: async () => {
      throw new Error("Network unavailable");
    },
  });
  const status = await proxy(
    request(maker, "crm/connection", undefined, { cookie }),
    "connection",
  );
  assert.equal(status.status, 503);
  assert.equal(status.headers.get("set-cookie"), null);
  const disconnect = await proxy(
    request(maker, "crm/disconnect", {}, { cookie }),
    "disconnect",
  );
  assert.deepEqual(await disconnect.json(), {
    connected: false,
    revoked: false,
  });
  assert.match(disconnect.headers.get("set-cookie")!, /Max-Age=0/);
});
