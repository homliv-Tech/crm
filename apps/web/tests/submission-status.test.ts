import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import type { getDb } from "../lib/db";
import {
  projectSubmissionInput,
  projectSubmissionStatusInput,
  SUBMISSION_STATUSES,
} from "../lib/crm/coordination";
import { saveSubmissionStatus } from "../lib/crm/submission-status-handler";

test("inline submission status requires an explicit valid status and record ID", () => {
  const body = { action: "changeStatus", id: crypto.randomUUID() };
  for (const status of SUBMISSION_STATUSES)
    assert.equal(
      projectSubmissionStatusInput.parse({ ...body, status }).status,
      status,
    );
  for (const invalid of [
    {},
    { status: "Done" },
    { status: "Submitted", id: "bad" },
    { status: "Submitted", action: "edit" },
  ])
    assert.equal(
      projectSubmissionStatusInput.safeParse({ ...body, ...invalid }).success,
      false,
    );
});

test("inline status changes preserve newer submission details while full-form edits still save them", async () => {
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
    const [partner] = await db
      .insert(tables.projectPartners)
      .values({
        companyId: company.id,
        projectId: project.id,
        name: "Engineer",
        role: "Structural engineer",
        responsibilities: "Foundation design",
      })
      .returning();
    const [old] = await db
      .insert(tables.projectSubmissions)
      .values({
        companyId: company.id,
        projectId: project.id,
        partnerId: partner.id,
        title: "Foundation drawings",
        dueDate: "2026-12-01",
      })
      .returning();
    // Another editor changes these fields after the first tab loads its record.
    const edited = projectSubmissionInput.parse({
      ...old,
      dueDate: "2026-12-10",
      title: "Revised drawings",
      notes: "Revision B",
      url: "https://example.com/revision-b",
    });
    const [before] = await db
      .update(tables.projectSubmissions)
      .set(edited)
      .where(eq(tables.projectSubmissions.id, old.id))
      .returning();
    const handlerDb = db as unknown as ReturnType<typeof getDb>;
    // Even an action carrying stale extras can write only status and updatedAt.
    const response = await saveSubmissionStatus(handlerDb, {
      ...old,
      action: "changeStatus",
      status: "Submitted",
    });
    assert.equal(response.status, 200);
    const [after] = await db
      .select()
      .from(tables.projectSubmissions)
      .where(eq(tables.projectSubmissions.id, old.id));
    assert.deepEqual(after, {
      ...before,
      status: "Submitted",
      updatedAt: after.updatedAt,
    });
    const [fullEdit] = await db
      .update(tables.projectSubmissions)
      .set(
        projectSubmissionInput.parse({
          ...after,
          dueDate: "2026-12-15",
          notes: "Review complete",
        }),
      )
      .where(eq(tables.projectSubmissions.id, old.id))
      .returning();
    assert.equal(fullEdit.dueDate, "2026-12-15");
    assert.equal(fullEdit.notes, "Review complete");
    assert.equal(fullEdit.status, "Submitted");
    assert.equal(
      (
        await saveSubmissionStatus(handlerDb, {
          action: "changeStatus",
          id: crypto.randomUUID(),
          status: "Submitted",
        })
      ).status,
      404,
    );
  } finally {
    await client.close();
  }
});
