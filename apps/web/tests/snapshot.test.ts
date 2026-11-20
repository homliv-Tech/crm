import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { neon, type NeonQueryPromise } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { getSnapshot } from "../lib/crm/snapshot";

// Execute the real Neon/Drizzle batch against local Postgres instead of HTTP.
test("CRM snapshot reads share a read-only Repeatable Read transaction", async () => {
  const postgres = new PGlite();
  const http = neon("postgresql://test:test@example.invalid/test");
  const db = pgliteDrizzle(postgres);
  const transport = mock.method(
    http,
    "transaction",
    async (queries: NeonQueryPromise<false, true>[]) => {
      return postgres.transaction(async (tx) => {
        const results = [];
        for (const query of queries) {
          const data = query.queryData;
          assert.ok("query" in data);
          const result = await tx.query<unknown[]>(data.query, data.params, {
            rowMode: "array",
            // Neon/Drizzle keeps date and timestamp values as strings for mapping.
            parsers: { 1082: (v) => v, 1114: (v) => v, 1184: (v) => v },
          });
          const { rows } = await tx.query<{
            isolation: string;
            read_only: string;
          }>(
            "select current_setting('transaction_isolation') as isolation, current_setting('transaction_read_only') as read_only",
          );
          assert.equal(rows[0].isolation, "repeatable read");
          assert.equal(rows[0].read_only, "on");
          results.push(result);
        }
        return results;
      });
    },
  );
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company] = await db
      .insert(schema.companies)
      .values({ name: "Client", owner: "Architect" })
      .returning();
    const [project] = await db
      .insert(schema.deals)
      .values({ companyId: company.id, title: "Home", owner: "Architect" })
      .returning();
    const [milestone] = await db
      .insert(schema.feeMilestones)
      .values({
        companyId: company.id,
        projectId: project.id,
        title: "Advance",
        phase: "Briefing",
        amount: "100.00",
        dueDate: "2026-12-01",
      })
      .returning();
    await db
      .insert(schema.paymentReceipts)
      .values({
        companyId: company.id,
        projectId: project.id,
        milestoneId: milestone.id,
        receiptNumber: "R-1",
        amount: "25.00",
        receivedDate: "2026-11-19",
        method: "UPI",
      });
    const completedAt = new Date("2026-11-19T12:00:00Z");
    await db
      .insert(schema.projectDeliverables)
      .values({
        companyId: company.id,
        projectId: project.id,
        phase: "Briefing",
        title: "Client brief",
        completed: true,
        completedAt,
      });
    await db
      .insert(schema.activities)
      .values({
        companyId: company.id,
        type: "Note",
        body: "Brief received",
        occurredAt: completedAt,
      });
    const readDb = neonDrizzle(http, { schema });
    const snapshot = await getSnapshot(readDb);
    assert.equal(transport.mock.callCount(), 1);
    assert.equal(snapshot.companies[0].id, company.id);
    assert.equal(snapshot.deals[0].id, project.id);
    assert.equal(snapshot.feeMilestones[0].id, milestone.id);
    assert.equal(snapshot.feeMilestones[0].receivedAmount, "25.00");
    assert.equal(snapshot.paymentReceipts[0].amount, "25.00");
    assert.equal(
      snapshot.projectDeliverables[0].completedAt,
      completedAt.toISOString(),
    );
    assert.equal(snapshot.activities[0].occurredAt, completedAt.toISOString());
    // Isolation is scoped to the read batch; later writes and refreshes still work.
    await db
      .insert(schema.paymentReceipts)
      .values({
        companyId: company.id,
        projectId: project.id,
        milestoneId: milestone.id,
        receiptNumber: "R-2",
        amount: "10.00",
        receivedDate: "2026-11-20",
        method: "UPI",
      });
    const refreshed = await getSnapshot(readDb);
    assert.equal(transport.mock.callCount(), 2);
    assert.equal(refreshed.feeMilestones[0].receivedAmount, "35.00");
    assert.equal(refreshed.paymentReceipts.length, 2);
  } finally {
    transport.mock.restore();
    await postgres.close();
  }
});
