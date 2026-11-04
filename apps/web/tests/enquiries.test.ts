import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createEnquiryHandler } from "../lib/crm/enquiry-handler";
import type { getDb } from "../lib/db";
import * as tables from "../lib/db/schema";

const secret = "test-integration-secret-with-at-least-32-characters";
const enquiry = () => ({
  id: randomUUID(),
  name: "Ananya Sharma",
  email: "ananya@example.com",
  phone: "+91 98765 43210",
  address: "12 Garden Road",
  apartmentType: "3-bhk",
  budget: "10-20-lakh",
  message: "A kitchen renovation.",
  createdAt: "2026-11-04T08:00:00.000Z",
});
const request = (body: unknown, token = secret, type = "application/json") =>
  new Request("https://crm.example/api/integrations/enquiries", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Content-Type": type },
    body: JSON.stringify(body),
  });

test("enquiry integration authenticates and bounds requests before accessing the database", async () => {
  let configured: string | undefined = secret;
  const handler = createEnquiryHandler({
    secret: () => configured,
    getDb: () => {
      throw new Error("Database must not be accessed");
    },
  });
  assert.equal((await handler(request(enquiry(), "wrong"))).status, 401);
  assert.equal(
    (await handler(request(enquiry(), secret, "text/plain"))).status,
    415,
  );
  assert.equal(
    (await handler(request({ ...enquiry(), apartmentType: "castle" }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...enquiry(), budget: "free" }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...enquiry(), phone: "1234" }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...enquiry(), email: "invalid" }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...enquiry(), address: "" }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...enquiry(), message: "x".repeat(17_000) })))
      .status,
    413,
  );
  assert.equal(
    (
      await handler(
        new Request("https://crm.example", {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: "{",
        }),
      )
    ).status,
    400,
  );
  configured = undefined;
  assert.equal((await handler(request(enquiry()))).status, 503);
  configured = "too-short";
  assert.equal((await handler(request(enquiry()))).status, 503);
});

test("imports all enquiry fields atomically and deduplicates sequential and concurrent retries", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    let failBatch = false;
    // Run the same SQL produced for Neon in a real Postgres transaction.
    const batch = async (
      queries: { toSQL(): { sql: string; params: unknown[] } }[],
    ) =>
      client.transaction(async (tx) => {
        for (const [i, query] of queries.entries()) {
          if (failBatch && i === 2) throw new Error("Simulated write failure");
          const compiled = query.toSQL();
          await tx.query(compiled.sql, compiled.params);
        }
      });
    const handler = createEnquiryHandler({
      secret: () => secret,
      getDb: () =>
        Object.assign(db, { batch }) as unknown as ReturnType<typeof getDb>,
    });
    const payload = enquiry();
    const first = await handler(request(payload));
    assert.equal(first.status, 201);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const result = await first.json();
    const [company] = await db.select().from(tables.companies);
    assert.equal(company.id, result.companyId);
    assert.deepEqual(company.tags, ["Residential", "Enquiry"]);
    assert.equal(company.owner, "Unassigned");
    assert.ok(company.description.includes("3 BHK"));
    assert.ok(company.description.includes("₹10–20 lakh"));
    const [contact] = await db.select().from(tables.contacts);
    assert.equal(contact.email, payload.email);
    assert.equal(contact.phone, payload.phone);
    const [saved] = await db.select().from(tables.landingEnquiries);
    assert.equal(saved.address, payload.address);
    assert.equal(saved.apartmentType, payload.apartmentType);
    assert.equal(saved.budget, payload.budget);
    assert.equal(saved.message, payload.message);
    assert.equal(saved.submittedAt.toISOString(), payload.createdAt);
    assert.equal((await db.select().from(tables.activities)).length, 1);
    const again = await handler(request(payload));
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), { ...result, duplicate: true });
    assert.equal(
      (await handler(request({ ...payload, message: "Changed" }))).status,
      409,
    );
    const concurrent = enquiry();
    const responses = await Promise.all([
      handler(request(concurrent)),
      handler(request(concurrent)),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
    for (const table of [
      tables.companies,
      tables.contacts,
      tables.activities,
      tables.landingEnquiries,
    ])
      assert.equal((await db.select().from(table)).length, 2);
    assert.equal((await db.select().from(tables.deals)).length, 0);
    failBatch = true;
    assert.equal((await handler(request(enquiry()))).status, 503);
    for (const table of [
      tables.companies,
      tables.contacts,
      tables.activities,
      tables.landingEnquiries,
    ])
      assert.equal((await db.select().from(table)).length, 2);
  } finally {
    await client.close();
  }
});
