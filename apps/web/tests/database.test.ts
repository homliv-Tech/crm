import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";

test("migration supports CRM CRUD, exact money, constraints, and company cascade deletion", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company] = await db
      .insert(tables.companies)
      .values({ name: "Integration account", owner: "Sarah", tags: ["SMB"] })
      .returning();
    await db
      .insert(tables.contacts)
      .values({
        companyId: company.id,
        name: "Buyer",
        email: "buyer@example.com",
      });
    const [deal] = await db
      .insert(tables.deals)
      .values({
        companyId: company.id,
        title: "Pilot",
        value: "1234.56",
        owner: "Sarah",
      })
      .returning();
    assert.equal(deal.value, "1234.56");
    await db
      .update(tables.deals)
      .set({ stage: "Won" })
      .where(eq(tables.deals.id, deal.id));
    assert.equal((await db.select().from(tables.deals))[0].stage, "Won");
    await db
      .insert(tables.tasks)
      .values({
        companyId: company.id,
        title: "Follow up",
        dueDate: "2026-11-03",
        owner: "Sarah",
      });
    await db
      .insert(tables.activities)
      .values({ companyId: company.id, type: "Call", body: "Discussed pilot" });
    await assert.rejects(
      db
        .insert(tables.deals)
        .values({
          companyId: company.id,
          title: "Bad probability",
          value: "1",
          probability: 101,
          owner: "Sarah",
        }),
    );
    await assert.rejects(
      db
        .insert(tables.deals)
        .values({
          companyId: company.id,
          title: "Bad value",
          value: "-1",
          owner: "Sarah",
        }),
    );
    await assert.rejects(
      db
        .insert(tables.contacts)
        .values({ companyId: crypto.randomUUID(), name: "Orphan" }),
    );
    await db
      .delete(tables.companies)
      .where(eq(tables.companies.id, company.id));
    for (const table of [
      tables.contacts,
      tables.deals,
      tables.tasks,
      tables.activities,
    ])
      assert.equal((await db.select().from(table)).length, 0);
  } finally {
    await client.close();
  }
});
