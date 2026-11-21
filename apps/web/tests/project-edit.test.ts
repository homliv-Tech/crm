import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import type { getDb } from "../lib/db";
import {
  projectDetailsInput,
  projectDetailsPayload,
} from "../lib/crm/project-edit";
import { saveProjectEdit } from "../lib/crm/project-edit-handler";

test("project detail payloads omit unchanged phases and include the opening phase for intentional changes", () => {
  const values = { title: "New title", stage: "Briefing" };
  assert.deepEqual(projectDetailsPayload(values, "Briefing"), {
    title: "New title",
  });
  assert.deepEqual(
    projectDetailsPayload({ ...values, stage: "Construction" }, "Briefing"),
    {
      title: "New title",
      stage: "Construction",
      expectedStage: "Briefing",
    },
  );
});

test("stale project details preserve a newer phase and explicit phase writes use an atomic conflict check", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company] = await db
      .insert(tables.companies)
      .values({ name: "Client", owner: "Architect" })
      .returning();
    const [opened] = await db
      .insert(tables.deals)
      .values({ companyId: company.id, title: "Home", owner: "Architect" })
      .returning();
    const handlerDb = db as unknown as ReturnType<typeof getDb>;
    // Another tab advances the phase after the details editor opens.
    assert.equal(
      (
        await saveProjectEdit(handlerDb, {
          action: "changePhase",
          id: opened.id,
          stage: "Construction",
          expectedStage: "Briefing",
        })
      ).status,
      200,
    );
    const payload = projectDetailsPayload(
      { ...opened, title: "Updated title" },
      "Briefing",
    );
    assert.equal((await saveProjectEdit(handlerDb, payload)).status, 200);
    let [saved] = await db
      .select()
      .from(tables.deals)
      .where(eq(tables.deals.id, opened.id));
    assert.equal(saved.title, "Updated title");
    assert.equal(saved.stage, "Construction");
    // The server also excludes a phase explicitly marked unchanged by a caller.
    assert.equal(
      (
        await saveProjectEdit(handlerDb, {
          ...opened,
          title: "Updated notes",
          stage: "Briefing",
          expectedStage: "Briefing",
        })
      ).status,
      200,
    );
    const staleChange = {
      ...opened,
      title: "Must not be saved",
      stage: "Handover",
      expectedStage: "Briefing",
    };
    assert.equal((await saveProjectEdit(handlerDb, staleChange)).status, 409);
    [saved] = await db
      .select()
      .from(tables.deals)
      .where(eq(tables.deals.id, opened.id));
    assert.equal(saved.title, "Updated notes");
    assert.equal(saved.stage, "Construction");
    assert.equal(
      (
        await saveProjectEdit(handlerDb, {
          action: "changePhase",
          id: opened.id,
          stage: "Approvals",
          expectedStage: "Briefing",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await saveProjectEdit(handlerDb, {
          ...staleChange,
          title: "Ready to hand over",
          expectedStage: "Construction",
        })
      ).status,
      200,
    );
    [saved] = await db
      .select()
      .from(tables.deals)
      .where(eq(tables.deals.id, opened.id));
    assert.equal(saved.title, "Ready to hand over");
    assert.equal(saved.stage, "Handover");
    assert.equal(
      projectDetailsInput.safeParse({ ...opened, title: "Unsafe legacy save" })
        .success,
      false,
    );
    assert.equal(
      (
        await saveProjectEdit(handlerDb, {
          action: "changePhase",
          id: crypto.randomUUID(),
          stage: "Construction",
          expectedStage: "Briefing",
        })
      ).status,
      404,
    );
  } finally {
    await client.close();
  }
});
