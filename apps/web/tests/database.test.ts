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
      .values({
        name: "Integration account",
        owner: "Sarah",
        tags: ["Residential"],
      })
      .returning();
    await db.insert(tables.contacts).values({
      companyId: company.id,
      name: "Buyer",
      email: "buyer@example.com",
    });
    const [deal] = await db
      .insert(tables.deals)
      .values({
        companyId: company.id,
        title: "Consultation",
        value: "1234.56",
        owner: "Sarah",
      })
      .returning();
    assert.equal(deal.value, "1234.56");
    await db
      .update(tables.deals)
      .set({ stage: "Handover" })
      .where(eq(tables.deals.id, deal.id));
    assert.equal((await db.select().from(tables.deals))[0].stage, "Handover");
    await db.insert(tables.tasks).values({
      companyId: company.id,
      title: "Follow up",
      dueDate: "2026-11-03",
      owner: "Sarah",
    });
    await db
      .insert(tables.activities)
      .values({ companyId: company.id, type: "Call", body: "Discussed pilot" });
    await assert.rejects(
      db.insert(tables.deals).values({
        companyId: company.id,
        title: "Bad probability",
        value: "1",
        probability: 101,
        owner: "Sarah",
      }),
    );
    await assert.rejects(
      db.insert(tables.deals).values({
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

test("sales migration preserves relationships and archives sales details without inventing delivery progress", async () => {
  const { readFile } = await import("node:fs/promises");
  const client = new PGlite();
  try {
    await client.exec(
      await readFile("./drizzle/0000_easy_king_bedlam.sql", "utf8"),
    );
    const id = crypto.randomUUID();
    await client.query(
      "INSERT INTO companies (id, name, owner, tags, description) VALUES ($1, 'Existing client', 'Architect', ARRAY['SMB', 'New Logo'], 'Original notes')",
      [id],
    );
    for (const stage of [
      "Discovery",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Won",
      "Lost",
    ]) {
      await client.query(
        "INSERT INTO deals (company_id, title, owner, stage, value, probability, close_date) VALUES ($1, $2, 'Architect', $3, 1234.56, 75, '2026-12-01')",
        [id, stage, stage],
      );
    }
    await client.query(
      "INSERT INTO contacts (company_id, name) VALUES ($1, 'Client representative')",
      [id],
    );
    await client.exec(
      await readFile("./drizzle/0001_architecture_projects.sql", "utf8"),
    );
    const db = drizzle(client);
    const projects = await db.select().from(tables.deals);
    assert.equal(projects.length, 6);
    for (const project of projects) {
      assert.equal(project.companyId, id);
      assert.equal(
        project.stage,
        project.title === "Lost" ? "Cancelled" : "Briefing",
      );
      assert.equal(project.probability, 0);
      assert.equal(project.value, "1234.56");
      assert.equal(project.closeDate, null);
      assert.equal(project.siteAddress, "");
      assert.ok(project.brief.includes(`Previous stage: ${project.title}`));
      assert.ok(project.brief.includes("75%"));
      assert.ok(project.brief.includes("2026-12-01"));
    }
    const [company] = await db.select().from(tables.companies);
    assert.deepEqual(company.tags, []);
    assert.ok(company.description.includes("Original notes"));
    assert.ok(company.description.includes("SMB, New Logo"));
    assert.equal((await db.select().from(tables.contacts))[0].companyId, id);
    const [created] = await db
      .insert(tables.deals)
      .values({
        companyId: id,
        title: "New project",
        owner: "Architect",
        stage: "Construction",
        siteAddress: "14 Garden Road",
        brief: "Retain the existing courtyard.",
      })
      .returning();
    assert.equal(created.probability, 0);
    assert.equal(created.siteAddress, "14 Garden Road");
    assert.equal(created.brief, "Retain the existing courtyard.");
  } finally {
    await client.close();
  }
});
