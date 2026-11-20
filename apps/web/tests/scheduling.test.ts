import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PGlite, type QueryOptions } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import type { getDb } from "../lib/db";
import { DELIVERY_PHASES } from "../lib/crm/projects";
import {
  CHECKLIST_TYPES,
  CHECKLIST_STARTERS,
  phaseScheduleInput,
  projectDeliverableInput,
  calendarDaysBetween,
  phaseScheduleStatus,
} from "../lib/crm/scheduling";
import { createSchedulingHandler } from "../lib/crm/scheduling-handler";
import { listAssignableTeam } from "../lib/crm/team";

const companyId = "abcdef01-2345-4678-9abc-def012345678";
const projectId = "abcdef02-2345-4678-9abc-def012345678";
const schedule = {
  companyId,
  projectId,
  phase: "Concept design",
  plannedStart: "2026-12-01",
  plannedEnd: "2026-12-15",
};
function request(
  body: object,
  method = "POST",
  origin = "https://crm.example",
) {
  return new Request("https://crm.example/api/crm/schedule", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("phase schedules validate calendar dates, delivery phases, and completion order", () => {
  assert.equal(phaseScheduleInput.parse(schedule).actualEnd, null);
  for (const overrides of [
    { phase: "On hold" },
    { phase: "Cancelled" },
    { plannedEnd: "2026-11-30" },
    { actualEnd: "2026-12-15" },
    { actualStart: "2026-12-15", actualEnd: "2026-12-14" },
    { plannedStart: "2026-02-30" },
  ])
    assert.equal(
      phaseScheduleInput.safeParse({ ...schedule, ...overrides }).success,
      false,
    );
  const base = phaseScheduleInput.parse(schedule);
  assert.equal(phaseScheduleStatus(base, "2026-12-15"), "Planned");
  assert.equal(phaseScheduleStatus(base, "2026-12-16"), "Overdue");
  assert.equal(
    phaseScheduleStatus({ ...base, actualStart: "2026-12-01" }, "2026-12-10"),
    "In progress",
  );
  assert.equal(
    phaseScheduleStatus(
      { ...base, actualStart: "2026-12-01", actualEnd: "2026-12-17" },
      "2026-12-18",
    ),
    "Completed",
  );
  assert.equal(calendarDaysBetween("2026-12-15", "2026-12-17"), 2);
  assert.equal(calendarDaysBetween("2026-12-15", "2026-12-14"), -1);
  assert.equal(
    phaseScheduleInput.parse({ ...schedule, plannedStart: "", plannedEnd: "" })
      .plannedEnd,
    null,
  );
});

test("each reusable starter covers all six phases with distinct deliverable keys", () => {
  for (const type of CHECKLIST_TYPES) {
    const items = CHECKLIST_STARTERS[type];
    assert.equal(items.length, 12);
    assert.equal(new Set(items.map((i) => i.key)).size, items.length);
    for (const phase of DELIVERY_PHASES)
      assert.equal(items.filter((i) => i.phase === phase).length, 2);
    for (const item of items)
      assert.equal(
        projectDeliverableInput.safeParse({ companyId, projectId, ...item })
          .success,
        true,
      );
  }
});

test("the teammate directory exposes only active editing members in this workspace", async () => {
  const user = {
    id: "alice",
    firstName: "Alice",
    lastName: "Architect",
    email: "alice@example.com",
  };
  const member = {
    userId: "alice",
    organizationId: "studio",
    status: "active",
    role: { slug: "member" },
    user,
  };
  const lookups: string[] = [];
  const team = await listAssignableTeam(
    {
      listOrganizationMemberships: async (args) => {
        assert.deepEqual(args, {
          organizationId: "studio",
          statuses: ["active"],
        });
        return {
          autoPagination: async () => [
            member,
            member,
            {
              ...member,
              userId: "bob",
              user: undefined,
              role: { slug: "admin" },
            },
            { ...member, status: "inactive" },
            { ...member, organizationId: "foreign" },
            { ...member, role: { slug: "viewer" } },
            { ...member, role: { slug: "unknown" } },
            { ...member, roles: [{ slug: "member" }, { slug: "unknown" }] },
          ],
        };
      },
      getUser: async (id) => {
        lookups.push(id);
        return {
          id,
          firstName: null,
          lastName: null,
          email: "bob@example.com",
        };
      },
    },
    "studio",
  );
  assert.deepEqual(team, [
    { id: "alice", name: "Alice Architect", email: "alice@example.com" },
    { id: "bob", name: "bob@example.com", email: "bob@example.com" },
  ]);
  assert.deepEqual(lookups, ["bob"]);
});

test("schedule writes and template application enforce permission and origin before database/provider calls", async () => {
  let allowed = false,
    calls = 0;
  const deps = {
    authorize: async () =>
      allowed ? {} : Response.json({ error: "Forbidden" }, { status: 403 }),
    getDb: () => {
      calls++;
      throw new Error("Unexpected database call");
    },
    getTeam: async () => {
      calls++;
      return [];
    },
  };
  for (const entity of ["phaseSchedules", "projectDeliverables"] as const) {
    const mutate = createSchedulingHandler(deps, entity);
    for (const method of ["POST", "PATCH", "DELETE"])
      assert.equal((await mutate(request(schedule, method))).status, 403);
    allowed = true;
    assert.equal(
      (await mutate(request(schedule, "POST", "https://other.example"))).status,
      403,
    );
    allowed = false;
  }
  assert.equal(calls, 0);
});

test("schedule and checklist CRUD preserves assignments and work across reusable template applications", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company, other] = await db
      .insert(tables.companies)
      .values([
        { id: companyId, name: "Client", owner: "Architect" },
        { name: "Other client", owner: "Architect" },
      ])
      .returning();
    const projects = await db
      .insert(tables.deals)
      .values(
        CHECKLIST_TYPES.map((title, i) => ({
          ...(i === 0 ? { id: projectId } : {}),
          companyId,
          title,
          owner: "Architect",
          value: "50000.00",
          closeDate: "2027-06-01",
        })),
      )
      .returning();
    const [foreign] = await db
      .insert(tables.deals)
      .values({ companyId: other.id, title: "Foreign", owner: "Architect" })
      .returning();
    let directoryAvailable = true;
    const deps = {
      authorize: async () => ({}),
      getDb: () => db as unknown as ReturnType<typeof getDb>,
      getTeam: async () => {
        if (!directoryAvailable) throw new Error("Provider unavailable");
        return [
          { id: "alice", name: "Alice Architect", email: "alice@example.com" },
          { id: "bob", name: "Bob Architect", email: "bob@example.com" },
        ];
      },
    };
    const saveSchedule = createSchedulingHandler(deps, "phaseSchedules"),
      saveItem = createSchedulingHandler(deps, "projectDeliverables");
    const created = await saveSchedule(
      request({ ...schedule, assigneeId: "alice", assigneeName: "Spoofed" }),
    );
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    const current = async () =>
      (
        await db
          .select()
          .from(tables.phaseSchedules)
          .where(eq(tables.phaseSchedules.id, id))
      )[0];
    assert.equal((await current()).assigneeName, "Alice Architect");
    assert.equal((await saveSchedule(request(schedule))).status, 409);
    assert.equal(
      (await saveSchedule(request({ id, plannedEnd: "2026-11-30" }, "PATCH")))
        .status,
      400,
    );
    assert.equal(
      (await saveSchedule(request({ id, plannedEnd: "2026-12-20" }, "PATCH")))
        .status,
      200,
    );
    assert.equal((await current()).plannedEnd, "2026-12-20");
    assert.equal((await current()).assigneeId, "alice");
    const apply = {
      action: "applyTemplate",
      companyId,
      projectId,
      templateKey: "Residential",
      assigneeId: "bob",
    };
    const outcomes = await Promise.all([
      saveItem(request(apply)),
      saveItem(request(apply)),
    ]);
    assert.deepEqual(
      outcomes.map((r) => r.status),
      [200, 200],
    );
    assert.equal(
      (
        await db
          .select()
          .from(tables.phaseSchedules)
          .where(eq(tables.phaseSchedules.projectId, projectId))
      ).length,
      6,
    );
    const items = async () =>
      db
        .select()
        .from(tables.projectDeliverables)
        .where(eq(tables.projectDeliverables.projectId, projectId));
    assert.equal((await items()).length, 12);
    assert.equal((await current()).plannedEnd, "2026-12-20");
    assert.equal(
      (await current()).assigneeId,
      "alice",
      "starter must preserve existing phase assignments",
    );
    const first = (await items())[0];
    assert.equal(first.assigneeId, "bob");
    assert.equal(
      (
        await saveItem(
          request(
            {
              id: first.id,
              completed: true,
              dueDate: "2026-12-10",
              title: "Customized deliverable",
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const completedAt = (await items()).find(
      (i) => i.id === first.id,
    )!.completedAt;
    assert.ok(completedAt);
    directoryAvailable = false;
    assert.equal(
      (
        await saveItem(
          request({ id: first.id, notes: "Completion evidence" }, "PATCH"),
        )
      ).status,
      200,
    );
    assert.equal(
      (await saveSchedule(request({ id, notes: "Phase notes" }, "PATCH")))
        .status,
      200,
    );
    assert.equal(
      (await saveItem(request({ id: first.id, assigneeId: "alice" }, "PATCH")))
        .status,
      503,
    );
    directoryAvailable = true;
    assert.equal(
      (await saveItem(request({ ...apply, assigneeId: "alice" }))).status,
      200,
    );
    const preserved = (await items()).find((i) => i.id === first.id)!;
    assert.equal(preserved.title, "Customized deliverable");
    assert.equal(preserved.assigneeId, "bob");
    assert.equal(preserved.dueDate, "2026-12-10");
    assert.equal(preserved.completed, true);
    assert.equal(
      preserved.completedAt?.toISOString(),
      completedAt.toISOString(),
    );
    assert.equal(
      (
        await saveItem(
          request(
            { id: first.id, assigneeId: null, completed: false },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    assert.equal(
      (await items()).find((i) => i.id === first.id)!.completedAt,
      null,
    );
    assert.equal(
      (await saveItem(request({ ...apply, assigneeId: "untrusted" }))).status,
      400,
    );
    assert.equal(
      (await saveItem(request({ ...apply, projectId: foreign.id }))).status,
      400,
    );
    assert.equal(
      (await saveSchedule(request({ id, projectId: projects[1].id }, "PATCH")))
        .status,
      400,
    );
    assert.equal(
      (await saveSchedule(request({ id, phase: "Handover" }, "PATCH"))).status,
      400,
    );
    assert.equal(
      (
        await saveItem(
          request({ id: first.id, projectId: projects[1].id }, "PATCH"),
        )
      ).status,
      400,
    );
    const custom = await saveItem(
      request({
        companyId,
        projectId,
        phase: "Handover",
        title: "Custom handover task",
        templateKey: "Residential",
        templateItemKey: "forged",
      }),
    );
    assert.equal(custom.status, 201);
    const customId = (await custom.json()).id;
    assert.equal(
      (await items()).find((i) => i.id === customId)!.templateKey,
      null,
    );
    const removed = (await items()).find(
      (i) => i.id !== first.id && i.id !== customId,
    )!;
    assert.equal(
      (await saveItem(request({ id: removed.id }, "DELETE"))).status,
      200,
    );
    assert.equal((await saveItem(request(apply))).status, 200);
    assert.equal(
      (await items()).length,
      13,
      "only the missing starter should be added beside custom work",
    );
    for (let i = 1; i < CHECKLIST_TYPES.length; i++) {
      assert.equal(
        (
          await saveItem(
            request({
              ...apply,
              projectId: projects[i].id,
              templateKey: CHECKLIST_TYPES[i],
            }),
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await db
            .select()
            .from(tables.projectDeliverables)
            .where(eq(tables.projectDeliverables.projectId, projects[i].id))
        ).length,
        12,
      );
    }
    await assert.rejects(
      db.insert(tables.phaseSchedules).values({
        ...phaseScheduleInput.parse(schedule),
        projectId: foreign.id,
      }),
    );
    await assert.rejects(
      db
        .update(tables.phaseSchedules)
        .set({ actualEnd: "2026-12-10" })
        .where(eq(tables.phaseSchedules.id, id)),
    );
    assert.equal(
      (
        await saveSchedule(
          request(
            { id, actualStart: "2026-12-01", actualEnd: "2026-12-21" },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const [project] = await db
      .select()
      .from(tables.deals)
      .where(eq(tables.deals.id, projectId));
    assert.equal(project.stage, "Briefing");
    assert.equal(project.closeDate, "2027-06-01");
    assert.equal(project.value, "50000.00");
    assert.equal((await saveSchedule(request({ id }, "DELETE"))).status, 200);
    assert.equal((await saveSchedule(request({ id }, "DELETE"))).status, 404);
    assert.equal(
      (await items()).length,
      13,
      "removing dates must keep deliverables",
    );
    await db.delete(tables.deals).where(eq(tables.deals.id, projectId));
    assert.equal((await items()).length, 0);
    await db
      .delete(tables.companies)
      .where(eq(tables.companies.id, company.id));
    assert.equal((await db.select().from(tables.phaseSchedules)).length, 0);
    assert.equal(
      (await db.select().from(tables.projectDeliverables)).length,
      0,
    );
  } finally {
    await client.close();
  }
});

test("stale partial schedule and deliverable PATCH requests cannot overwrite a winning update", async () => {
  const postgres = new PGlite();
  try {
    const db = drizzle(postgres);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db
      .insert(tables.companies)
      .values({ id: companyId, name: "Client", owner: "Architect" });
    await db
      .insert(tables.deals)
      .values({ id: projectId, companyId, title: "Home", owner: "Architect" });
    const [phase] = await db
      .insert(tables.phaseSchedules)
      .values(phaseScheduleInput.parse(schedule))
      .returning();
    const [item] = await db
      .insert(tables.projectDeliverables)
      .values({
        companyId,
        projectId,
        phase: "Concept design",
        title: "Drawing review",
      })
      .returning();
    const deps = {
      authorize: async () => ({}),
      getDb: () => db as unknown as ReturnType<typeof getDb>,
      getTeam: async () => [],
    };
    for (const entity of ["phaseSchedules", "projectDeliverables"] as const) {
      const table =
        entity === "phaseSchedules"
          ? tables.phaseSchedules
          : tables.projectDeliverables;
      const id = entity === "phaseSchedules" ? phase.id : item.id;
      const tableName =
        entity === "phaseSchedules"
          ? "phase_schedules"
          : "project_deliverables";
      const mutate = createSchedulingHandler(deps, entity);
      let readStarted!: () => void;
      const reading = new Promise<void>((resolve) => {
        readStarted = resolve;
      });
      let releaseRead!: () => void;
      const resume = new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      let pause = true;
      const query = postgres.query.bind(postgres);
      const pausedRead = mock.method(
        postgres,
        "query",
        async (text: string, params?: unknown[], options?: QueryOptions) => {
          const result = await query(text, params, options);
          if (pause && text.includes(`from "${tableName}"`)) {
            pause = false;
            readStarted();
            await resume;
          }
          return result;
        },
      );
      const stale = mutate(request({ id, notes: "Late notes" }, "PATCH"));
      try {
        await Promise.race([
          reading,
          stale.then(() => {
            throw new Error(
              "PATCH completed before its stale read could be paused",
            );
          }),
        ]);
        const winningPatch =
          entity === "phaseSchedules"
            ? { id, actualStart: "2026-12-01", actualEnd: "2026-12-15" }
            : { id, completed: true };
        assert.equal(
          (await mutate(request(winningPatch, "PATCH"))).status,
          200,
        );
        const [winner] = await db.select().from(table).where(eq(table.id, id));
        if ("completed" in winner) {
          assert.equal(winner.completed, true);
          assert.ok(winner.completedAt);
        }
        if ("actualEnd" in winner) assert.equal(winner.actualEnd, "2026-12-15");
        releaseRead();
        const response = await stale;
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /changed while saving/);
        const [preserved] = await db
          .select()
          .from(table)
          .where(eq(table.id, id));
        assert.deepEqual(
          preserved,
          winner,
          "a stale notes update must leave the entire winning row untouched",
        );
        assert.equal(
          (await mutate(request({ id, notes: "Late notes" }, "PATCH"))).status,
          200,
        );
        const [retried] = await db.select().from(table).where(eq(table.id, id));
        assert.deepEqual(retried, {
          ...winner,
          notes: "Late notes",
          updatedAt: retried.updatedAt,
        });
      } finally {
        releaseRead();
        await stale;
        pausedRead.mock.restore();
      }
    }
  } finally {
    await postgres.close();
  }
});
