import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import type { getDb } from "../lib/db";
import { createDecisionHandler } from "../lib/crm/decision-handler";
import { projectDecisionInput } from "../lib/crm/validation";

const input = {
  companyId: "abcdef01-2345-4678-9abc-def012345678",
  projectId: "abcdef02-2345-4678-9abc-def012345678",
  title: "Concept design sign-off",
  kind: "Stage sign-off",
  phase: "Concept design",
  decisionMaker: "Homeowner",
  dueDate: "2026-12-01",
  revision: "A-101 Rev B",
};
function request(
  body: object,
  method = "POST",
  origin = "https://crm.example",
) {
  return new Request("https://crm.example/api/crm/projectDecisions", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("decisions require complete outcomes and valid change impacts", () => {
  const pending = projectDecisionInput.parse(input);
  assert.equal(pending.status, "Pending");
  assert.equal(pending.additionalFee, "0.00");
  assert.equal(pending.decisionDate, null);
  for (const overrides of [
    { projectId: "" },
    { decisionMaker: " " },
    { revision: "" },
    { phase: "invalid" },
    { dueDate: "2026-02-30" },
    { status: "Approved" },
    { status: "Approved", decisionDate: "2026-11-19" },
    { status: "Rejected" },
    { status: "Withdrawn" },
    { decisionDate: "2026-11-19" },
    { approvedRevision: "Rev C" },
    { additionalFee: 100 },
    { scheduleImpactDays: 1 },
    { kind: "Design change", additionalFee: -1 },
    { kind: "Design change", scheduleImpactDays: 0.5 },
    { kind: "Design change", scheduleImpactDays: 3651 },
  ])
    assert.equal(
      projectDecisionInput.safeParse({ ...input, ...overrides }).success,
      false,
      JSON.stringify(overrides),
    );
  const approved = projectDecisionInput.parse({
    ...input,
    status: "Approved",
    approvedRevision: " A-101 Rev C ",
    decisionDate: "2026-11-19",
  });
  assert.equal(approved.approvedRevision, "A-101 Rev C");
  for (const status of ["Rejected", "Withdrawn"]) {
    assert.equal(
      projectDecisionInput.safeParse({
        ...input,
        status,
        decisionDate: "2026-11-19",
      }).success,
      true,
    );
  }
  const change = projectDecisionInput.parse({
    ...input,
    kind: "Design change",
    additionalFee: "1234.56",
    scheduleImpactDays: -3,
  });
  assert.equal(change.additionalFee, "1234.56");
  assert.equal(change.scheduleImpactDays, -3);
  assert.equal(
    projectDecisionInput.parse({
      ...input,
      projectId: input.projectId.toUpperCase(),
    }).projectId,
    input.projectId,
  );
});

test("decision mutations deny missing write permission and foreign origins before database access", async () => {
  let allowed = false;
  let calls = 0;
  const mutate = createDecisionHandler({
    authorize: async (permission) => {
      assert.equal(permission, "crm:write");
      return allowed
        ? {}
        : Response.json({ error: "Forbidden" }, { status: 403 });
    },
    getDb: () => {
      calls++;
      throw new Error("Database must not be called");
    },
  });
  for (const method of ["POST", "PATCH", "DELETE"])
    assert.equal((await mutate(request(input, method))).status, 403);
  allowed = true;
  assert.equal(
    (await mutate(request(input, "POST", "https://other.example"))).status,
    403,
  );
  assert.equal(
    (await mutate(request({ ...input, status: "Approved" }))).status,
    400,
  );
  assert.equal(calls, 0);
});

test("approval and change CRUD preserves project ownership, money, and delivery values", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company, other] = await db
      .insert(tables.companies)
      .values([
        { id: input.companyId, name: "Homeowner", owner: "Architect" },
        { name: "Other client", owner: "Architect" },
      ])
      .returning();
    const [project, sibling, foreign] = await db
      .insert(tables.deals)
      .values([
        {
          id: input.projectId,
          companyId: company.id,
          title: "Home",
          owner: "Architect",
          value: "50000.00",
          closeDate: "2027-06-01",
          stage: "Concept design" as const,
        },
        { companyId: company.id, title: "Office", owner: "Architect" },
        { companyId: other.id, title: "Other project", owner: "Architect" },
      ])
      .returning();
    const mutate = createDecisionHandler({
      authorize: async () => ({}),
      getDb: () => db as unknown as ReturnType<typeof getDb>,
    });
    assert.equal(
      (await mutate(request({ ...input, projectId: foreign.id }))).status,
      400,
    );
    assert.equal(
      (await mutate(request({ ...input, projectId: crypto.randomUUID() })))
        .status,
      400,
    );
    const created = await mutate(request(input));
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const approved = {
      ...input,
      id,
      status: "Approved",
      approvedRevision: "A-101 Rev B",
      decisionDate: "2026-11-19",
      decisionNote: "Confirmed in client's email.",
    };
    assert.equal((await mutate(request(approved, "PATCH"))).status, 200);
    assert.equal(
      (
        await db
          .select()
          .from(tables.projectDecisions)
          .where(eq(tables.projectDecisions.id, id))
      )[0].approvedRevision,
      approved.approvedRevision,
    );
    assert.equal(
      (await mutate(request({ ...approved, projectId: sibling.id }, "PATCH")))
        .status,
      400,
    );
    assert.equal(
      (
        await mutate(
          request(
            { ...approved, companyId: other.id, projectId: foreign.id },
            "PATCH",
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (await mutate(request({ ...approved, approvedRevision: "" }, "PATCH")))
        .status,
      400,
    );
    assert.equal(
      (await mutate(request({ ...approved, id: crypto.randomUUID() }, "PATCH")))
        .status,
      404,
    );
    const change = {
      ...input,
      kind: "Design change",
      title: "Extend kitchen",
      additionalFee: "1234.56",
      scheduleImpactDays: 7,
    };
    const changeResponse = await mutate(request(change));
    assert.equal(changeResponse.status, 201);
    const changeId = (await changeResponse.json()).id;
    const [savedChange] = await db
      .select()
      .from(tables.projectDecisions)
      .where(eq(tables.projectDecisions.id, changeId));
    assert.equal(savedChange.additionalFee, "1234.56");
    assert.equal(savedChange.scheduleImpactDays, 7);
    const [unchanged] = await db
      .select()
      .from(tables.deals)
      .where(eq(tables.deals.id, project.id));
    assert.equal(unchanged.value, "50000.00");
    assert.equal(unchanged.closeDate, "2027-06-01");
    assert.equal(unchanged.stage, "Concept design");
    for (const bad of [
      { ...projectDecisionInput.parse(input), projectId: foreign.id },
      { ...projectDecisionInput.parse(input), status: "Approved" as const },
      {
        ...projectDecisionInput.parse(input),
        kind: "Design change" as const,
        additionalFee: "-1.00",
      },
    ])
      await assert.rejects(db.insert(tables.projectDecisions).values(bad));
    assert.equal((await mutate(request({ id }, "DELETE"))).status, 200);
    assert.equal((await mutate(request({ id }, "DELETE"))).status, 404);
    await db.delete(tables.deals).where(eq(tables.deals.id, project.id));
    assert.equal((await db.select().from(tables.projectDecisions)).length, 0);
    await db
      .insert(tables.projectDecisions)
      .values({ ...projectDecisionInput.parse(input), projectId: sibling.id });
    await db
      .delete(tables.companies)
      .where(eq(tables.companies.id, company.id));
    assert.equal((await db.select().from(tables.projectDecisions)).length, 0);
  } finally {
    await client.close();
  }
});
