import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import {
  projectPartnerInput,
  projectSubmissionInput,
} from "../lib/crm/coordination";

test("coordination validates responsibilities, roles, submission dates and safe document links", () => {
  const scope = {
    companyId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
  };
  const partner = {
    ...scope,
    name: "Engineer",
    role: "Structural engineer",
    responsibilities: "Foundation design",
  };
  assert.equal(projectPartnerInput.parse(partner).firm, "");
  for (const invalid of [
    { responsibilities: "  " },
    { role: "Unknown" },
    { projectId: "" },
    { email: "invalid" },
  ])
    assert.equal(
      projectPartnerInput.safeParse({ ...partner, ...invalid }).success,
      false,
    );
  const submission = {
    ...scope,
    partnerId: crypto.randomUUID(),
    title: "Foundation drawings",
    dueDate: "2026-12-01",
  };
  assert.equal(projectSubmissionInput.parse(submission).status, "Pending");
  for (const invalid of [
    { partnerId: "" },
    { dueDate: "2026-02-30" },
    { title: " " },
    { status: "Done" },
    { url: "javascript:alert(1)" },
  ])
    assert.equal(
      projectSubmissionInput.safeParse({ ...submission, ...invalid }).success,
      false,
    );
  assert.equal(
    projectSubmissionInput.parse({
      ...submission,
      status: "Submitted",
      url: "https://example.com/drawings",
    }).status,
    "Submitted",
  );
});

test("coordination persists submissions, enforces project ownership, and cascades deletion", async () => {
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
    const partner = {
      companyId: company.id,
      projectId: project.id,
      name: "Engineer",
      role: "Structural engineer" as const,
      responsibilities: "Foundation design",
    };
    const [saved] = await db
      .insert(tables.projectPartners)
      .values(partner)
      .returning();
    const [otherPartner] = await db
      .insert(tables.projectPartners)
      .values({ ...partner, projectId: sibling.id })
      .returning();
    await assert.rejects(
      db
        .insert(tables.projectPartners)
        .values({ ...partner, companyId: other.id }),
    );
    const submission = {
      companyId: company.id,
      projectId: project.id,
      partnerId: saved.id,
      title: "Foundation drawings",
      dueDate: "2026-12-01",
    };
    const [record] = await db
      .insert(tables.projectSubmissions)
      .values(submission)
      .returning();
    assert.equal(record.status, "Pending");
    await assert.rejects(
      db
        .insert(tables.projectSubmissions)
        .values({ ...submission, partnerId: otherPartner.id }),
    );
    await assert.rejects(
      db
        .insert(tables.projectSubmissions)
        .values({ ...submission, companyId: other.id }),
    );
    await assert.rejects(
      db
        .insert(tables.projectSubmissions)
        .values({ ...submission, title: "  " }),
    );
    await db
      .update(tables.projectSubmissions)
      .set({
        status: "Submitted",
        url: "https://example.com/drawings",
        notes: "Revision A",
      })
      .where(eq(tables.projectSubmissions.id, record.id));
    const [submitted] = await db.select().from(tables.projectSubmissions);
    assert.equal(submitted.status, "Submitted");
    assert.equal(submitted.notes, "Revision A");
    await db
      .delete(tables.projectPartners)
      .where(eq(tables.projectPartners.id, saved.id));
    assert.equal((await db.select().from(tables.projectSubmissions)).length, 0);
    await db
      .insert(tables.projectSubmissions)
      .values({
        ...submission,
        projectId: sibling.id,
        partnerId: otherPartner.id,
      });
    await db.delete(tables.deals).where(eq(tables.deals.id, sibling.id));
    assert.equal((await db.select().from(tables.projectPartners)).length, 0);
    assert.equal((await db.select().from(tables.projectSubmissions)).length, 0);
  } finally {
    await client.close();
  }
});
