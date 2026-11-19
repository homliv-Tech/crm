import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import {
  taskInput,
  contactInput,
  activityInput,
  projectFileInput,
} from "../lib/crm/validation";
import { createQuotation } from "@crm/quotations/quotation";
import { createQuotationHandlers } from "../lib/crm/quotation-handlers";
import type { getDb } from "../lib/db";

test("project records enforce client ownership and preserve client history when a project is deleted", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company, other] = await db
      .insert(tables.companies)
      .values([
        { name: "Homeowner", owner: "Architect" },
        { name: "Other client", owner: "Architect" },
      ])
      .returning();
    const [project, sibling] = await db
      .insert(tables.deals)
      .values([
        { companyId: company.id, title: "Home", owner: "Architect" },
        { companyId: company.id, title: "Office", owner: "Architect" },
      ])
      .returning();
    const task = {
      companyId: company.id,
      projectId: project.id,
      title: "Review plans",
      owner: "Architect",
      dueDate: "2026-12-01",
    };
    const [saved] = await db.insert(tables.tasks).values(task).returning();
    await db
      .insert(tables.tasks)
      .values({ ...task, projectId: sibling.id, title: "Office task" });
    await db
      .insert(tables.tasks)
      .values({ ...task, projectId: null, title: "Client only" });
    await db
      .insert(tables.contacts)
      .values({
        companyId: company.id,
        projectId: project.id,
        name: "Structural engineer",
      });
    await db
      .insert(tables.activities)
      .values({
        companyId: company.id,
        projectId: project.id,
        type: "Meeting",
        body: "Concept review",
      });
    await db
      .insert(tables.projectFiles)
      .values({
        companyId: company.id,
        projectId: project.id,
        title: "Plans",
        url: "https://example.com/plans",
      });
    for (const table of [
      tables.tasks,
      tables.contacts,
      tables.activities,
      tables.projectFiles,
    ]) {
      const rows = await db
        .select()
        .from(table)
        .where(eq(table.projectId, project.id));
      assert.equal(rows.length, 1);
      await assert.rejects(
        db
          .update(table)
          .set({ companyId: other.id })
          .where(eq(table.id, rows[0].id)),
      );
    }
    await assert.rejects(
      db
        .update(tables.tasks)
        .set({ projectId: crypto.randomUUID() })
        .where(eq(tables.tasks.id, saved.id)),
    );
    await db.delete(tables.deals).where(eq(tables.deals.id, project.id));
    for (const table of [tables.tasks, tables.contacts, tables.activities]) {
      assert.equal(
        (await db.select().from(table)).filter((r) => r.projectId === null)
          .length,
        table === tables.tasks ? 2 : 1,
      );
    }
    assert.equal((await db.select().from(tables.projectFiles)).length, 0);
    assert.equal(
      (
        await db
          .select()
          .from(tables.tasks)
          .where(eq(tables.tasks.projectId, sibling.id))
      ).length,
      1,
    );
    await db
      .delete(tables.companies)
      .where(eq(tables.companies.id, company.id));
    assert.equal((await db.select().from(tables.tasks)).length, 0);
  } finally {
    await client.close();
  }
});

test("project quotations match UUID casing and exclude client-only and sibling-project quotes", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company] = await db
      .insert(tables.companies)
      .values({ name: "Client", owner: "Architect" })
      .returning();
    const projects = await db
      .insert(tables.deals)
      .values(
        ["Home", "Office"].map((title) => ({
          companyId: company.id,
          title,
          owner: "Architect",
        })),
      )
      .returning();
    const handlers = createQuotationHandlers({
      authorize: async () => ({}),
      getDb: () => db as unknown as ReturnType<typeof getDb>,
    });
    const uppercaseProjectId = projects[0].id.toUpperCase();
    for (const projectId of [
      null,
      ...projects.map((p) => p.id),
      uppercaseProjectId,
    ]) {
      const document = createQuotation();
      document.crm = { companyId: company.id, projectId, contactId: null };
      const saved = await handlers.POST(
        new Request("https://crm.example/api/quotations", {
          method: "POST",
          headers: {
            origin: "https://crm.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ document, version: 0 }),
        }),
      );
      assert.equal(saved.status, 200);
    }
    for (const projectId of [projects[0].id, uppercaseProjectId]) {
      const response = await handlers.GET(
        new Request(
          `https://crm.example/api/quotations?companyId=${company.id}&projectId=${projectId}`,
        ),
      );
      assert.equal(response.status, 200);
      const { quotations } = await response.json();
      assert.equal(quotations.length, 2);
      assert.deepEqual(
        quotations
          .map(
            (q: { document: { crm: { projectId: string } } }) =>
              q.document.crm.projectId,
          )
          .sort(),
        [projects[0].id, uppercaseProjectId].sort(),
      );
    }
    const otherClient = await handlers.GET(
      new Request(
        `https://crm.example/api/quotations?companyId=${crypto.randomUUID()}&projectId=${uppercaseProjectId}`,
      ),
    );
    assert.deepEqual((await otherClient.json()).quotations, []);
    const all = await handlers.GET(
      new Request(`https://crm.example/api/quotations?companyId=${company.id}`),
    );
    assert.equal((await all.json()).quotations.length, 4);
  } finally {
    await client.close();
  }
});

test("project references and file URLs are validated", () => {
  const companyId = crypto.randomUUID();
  const task = {
    companyId,
    title: "Review",
    owner: "Architect",
    dueDate: "2026-12-01",
  };
  assert.equal(taskInput.parse(task).projectId, undefined);
  assert.equal(taskInput.parse({ ...task, projectId: "" }).projectId, null);
  assert.equal(
    taskInput.safeParse({ ...task, projectId: "invalid" }).success,
    false,
  );
  const file = { companyId, projectId: crypto.randomUUID(), title: "Drawing" };
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/test",
  ])
    assert.equal(projectFileInput.safeParse({ ...file, url }).success, false);
  assert.equal(
    projectFileInput.safeParse({ ...file, url: "https://example.com/plans" })
      .success,
    true,
  );
});

test("omitted project assignments survive updates while explicit empty values unlink records", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company] = await db
      .insert(tables.companies)
      .values({ name: "Client", owner: "Architect" })
      .returning();
    const [project] = await db
      .insert(tables.deals)
      .values({ companyId: company.id, title: "Home", owner: "Architect" })
      .returning();
    const cases = [
      {
        table: tables.tasks,
        schema: taskInput,
        input: {
          companyId: company.id,
          title: "Review plans",
          owner: "Architect",
          dueDate: "2026-12-01",
        },
      },
      {
        table: tables.contacts,
        schema: contactInput,
        input: { companyId: company.id, name: "Engineer" },
      },
      {
        table: tables.activities,
        schema: activityInput,
        input: {
          companyId: company.id,
          type: "Meeting",
          body: "Concept review",
        },
      },
    ];
    for (const { table, schema, input } of cases) {
      const omitted = schema.parse(input);
      assert.equal(omitted.projectId, undefined);
      const [unassigned] = await db.insert(table).values(omitted).returning();
      assert.equal(unassigned.projectId, null, "create defaults to no project");
      const [assigned] = await db
        .insert(table)
        .values(schema.parse({ ...input, projectId: project.id }))
        .returning();
      const [preserved] = await db
        .update(table)
        .set(omitted)
        .where(eq(table.id, assigned.id))
        .returning();
      assert.equal(preserved.projectId, project.id);
      for (const projectId of ["", null]) {
        await db
          .update(table)
          .set(schema.parse({ ...input, projectId: project.id }))
          .where(eq(table.id, assigned.id));
        const [cleared] = await db
          .update(table)
          .set(schema.parse({ ...input, projectId }))
          .where(eq(table.id, assigned.id))
          .returning();
        assert.equal(cleared.projectId, null);
      }
    }
  } finally {
    await client.close();
  }
});
