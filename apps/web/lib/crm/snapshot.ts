import { desc, getTableColumns, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { summarizeCompanies } from "./summaries";
import type { CrmSnapshot } from "./types";

export async function getSnapshot(db = getDb()): Promise<CrmSnapshot> {
  const [
    ,
    phaseSchedules,
    projectDeliverables,
    feeMilestones,
    paymentReceipts,
    projectDecisions,
    companies,
    contacts,
    deals,
    tasks,
    activities,
    projectFiles,
    projectPartners,
    projectSubmissions,
  ] = await db.batch([
    // Neon HTTP batches share a transaction, but default to per-statement snapshots.
    db.execute(sql`set transaction isolation level repeatable read read only`),
    db
      .select({
        ...getTableColumns(schema.phaseSchedules),
        rowVersion: sql<string>`${schema.phaseSchedules}.xmin::text`,
      })
      .from(schema.phaseSchedules)
      .orderBy(schema.phaseSchedules.createdAt),
    db
      .select({
        ...getTableColumns(schema.projectDeliverables),
        rowVersion: sql<string>`${schema.projectDeliverables}.xmin::text`,
      })
      .from(schema.projectDeliverables)
      .orderBy(
        schema.projectDeliverables.createdAt,
        schema.projectDeliverables.id,
      ),
    db
      .select()
      .from(schema.feeMilestones)
      .orderBy(schema.feeMilestones.dueDate),
    db
      .select()
      .from(schema.paymentReceipts)
      .orderBy(
        desc(schema.paymentReceipts.receivedDate),
        desc(schema.paymentReceipts.createdAt),
      ),
    db
      .select()
      .from(schema.projectDecisions)
      .orderBy(
        schema.projectDecisions.dueDate,
        desc(schema.projectDecisions.createdAt),
      ),
    db
      .select()
      .from(schema.companies)
      .orderBy(desc(schema.companies.createdAt)),
    db.select().from(schema.contacts).orderBy(schema.contacts.name),
    db.select().from(schema.deals).orderBy(desc(schema.deals.createdAt)),
    db.select().from(schema.tasks).orderBy(schema.tasks.dueDate),
    db
      .select()
      .from(schema.activities)
      .orderBy(desc(schema.activities.occurredAt)),
    db
      .select()
      .from(schema.projectFiles)
      .orderBy(desc(schema.projectFiles.createdAt)),
    db
      .select()
      .from(schema.projectPartners)
      .orderBy(schema.projectPartners.name),
    db
      .select()
      .from(schema.projectSubmissions)
      .orderBy(schema.projectSubmissions.dueDate),
  ]);
  const serializedActivities = activities.map((a) => ({
    ...a,
    occurredAt: a.occurredAt.toISOString(),
  }));
  return {
    companies: summarizeCompanies(companies, deals, serializedActivities),
    contacts,
    projectPartners,
    projectSubmissions,
    phaseSchedules,
    projectDeliverables: projectDeliverables.map((d) => ({
      ...d,
      completedAt: d.completedAt?.toISOString() ?? null,
    })),
    feeMilestones,
    paymentReceipts,
    projectFiles,
    projectDecisions,
    deals,
    tasks,
    activities: serializedActivities,
  };
}
