import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createQuotation } from "@crm/quotations/quotation";
import { createQuotationHandlers } from "../lib/crm/quotation-handlers";
import type { getDb } from "../lib/db";
import * as tables from "../lib/db/schema";

test("quotation API enforces access, origin, client ownership and optimistic saves", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    let allow = true;
    const handlers = createQuotationHandlers({
      authorize: async () =>
        allow ? {} : Response.json({ error: "Forbidden" }, { status: 403 }),
      getDb: () => db as unknown as ReturnType<typeof getDb>,
    });
    const [company, other] = await db
      .insert(tables.companies)
      .values([
        { name: "Client", owner: "Architect" },
        { name: "Other", owner: "Architect" },
      ])
      .returning();
    const [contact] = await db
      .insert(tables.contacts)
      .values({ companyId: other.id, name: "Other contact" })
      .returning();
    const [project] = await db
      .insert(tables.deals)
      .values({
        companyId: other.id,
        title: "Other project",
        owner: "Architect",
      })
      .returning();
    const document = createQuotation();
    document.crm = { companyId: company.id, contactId: null, projectId: null };
    const post = (version = 0, origin = "https://crm.example") =>
      handlers.POST(
        new Request("https://crm.example/api/quotations", {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify({ document, version }),
        }),
      );
    allow = false;
    assert.equal((await post()).status, 403);
    assert.equal(
      (
        await handlers.GET(
          new Request(
            `https://crm.example/api/quotations?companyId=${company.id}`,
          ),
        )
      ).status,
      403,
    );
    allow = true;
    assert.equal((await post(0, "https://other.example")).status, 403);
    document.crm.contactId = contact.id;
    assert.equal((await post()).status, 400);
    document.crm.contactId = null;
    document.crm.projectId = project.id;
    assert.equal((await post()).status, 400);
    document.crm.projectId = null;
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 409);
    document.status = "Sent";
    const updated = await post(1);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).quotation.version, 2);
    assert.equal((await post(1)).status, 409);
    const list = await handlers.GET(
      new Request(`https://crm.example/api/quotations?companyId=${company.id}`),
    );
    assert.equal(list.headers.get("cache-control"), "private, no-store");
    assert.equal((await list.json()).quotations[0].document.status, "Sent");
    const otherList = await handlers.GET(
      new Request(`https://crm.example/api/quotations?companyId=${other.id}`),
    );
    assert.equal((await otherList.json()).quotations.length, 0);

    for (const status of ["Draft", "Accepted", "Declined"] as const) {
      const quote = createQuotation();
      quote.status = status;
      quote.to.name = "Other client";
      quote.crm = { companyId: other.id, contactId: null, projectId: null };
      await db.insert(tables.quotations).values({
        id: quote.id,
        companyId: other.id,
        document: quote,
      });
    }
    const listStatus = (status: string, clientId = company.id) =>
      handlers.GET(
        new Request(
          `https://crm.example/api/quotations?status=${status}&companyId=${clientId}`,
        ),
      );
    const active = await listStatus("active");
    assert.equal(active.headers.get("cache-control"), "private, no-store");
    const summaries = (await active.json()).quotations;
    assert.deepEqual(
      summaries.map((q: { status: string }) => q.status).sort(),
      ["Sent"],
    );
    assert.equal(
      (await (await listStatus("active", other.id)).json()).quotations[0]
        .client,
      "Other client",
    );
    assert.equal("document" in summaries[0], false);
    for (const status of ["Accepted", "Declined"]) {
      assert.deepEqual(
        (await (await listStatus(status)).json()).quotations,
        [],
      );
      const rows = (await (await listStatus(status, other.id)).json())
        .quotations;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, status);
    }
    assert.equal((await listStatus("invalid")).status, 400);
    assert.equal((await listStatus("active", "invalid")).status, 400);
    assert.equal(
      (
        await handlers.GET(
          new Request("https://crm.example/api/quotations?status=active"),
        )
      ).status,
      400,
    );
    assert.deepEqual(
      (await (await listStatus("active", crypto.randomUUID())).json())
        .quotations,
      [],
    );
    allow = false;
    assert.equal((await listStatus("active")).status, 403);
    const remove = (id: string, origin = "https://crm.example") =>
      handlers.DELETE(
        new Request(`https://crm.example/api/quotations?id=${id}`, {
          method: "DELETE",
          headers: { origin },
        }),
      );
    assert.equal((await remove(document.id)).status, 403);
    allow = true;
    assert.equal(
      (await remove(document.id, "https://other.example")).status,
      403,
    );
    assert.equal((await remove("invalid")).status, 400);
    assert.equal((await remove(crypto.randomUUID())).status, 404);
    assert.equal((await remove(document.id)).status, 200);
    assert.equal((await remove(document.id)).status, 404);
    assert.equal(
      (await (await listStatus("active")).json()).quotations.length,
      0,
    );
    const surviving = await handlers.GET(
      new Request(`https://crm.example/api/quotations?companyId=${other.id}`),
    );
    assert.equal((await surviving.json()).quotations.length, 3);
  } finally {
    await client.close();
  }
});
