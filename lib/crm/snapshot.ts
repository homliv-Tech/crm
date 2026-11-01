import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { summarizeCompanies } from "./summaries";
import type { CrmSnapshot } from "./types";

export async function getSnapshot(): Promise<CrmSnapshot> {
  const db = getDb();
  const [companies, contacts, deals, tasks, activities] = await db.batch([
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
  ]);
  const serializedActivities = activities.map((a) => ({
    ...a,
    occurredAt: a.occurredAt.toISOString(),
  }));
  return {
    companies: summarizeCompanies(companies, deals, serializedActivities),
    contacts,
    deals,
    tasks,
    activities: serializedActivities,
  };
}
