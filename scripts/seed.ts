import { config } from "dotenv";
import { getDb } from "../lib/db";
import {
  companies,
  contacts,
  deals,
  tasks,
  activities,
} from "../lib/db/schema";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
async function main() {
  if (!process.argv.includes("--demo"))
    throw new Error(
      "Demo seed requires --demo. It adds sample records to your configured database.",
    );
  const db = getDb();
  const id = crypto.randomUUID();
  await db.batch([
    db
      .insert(companies)
      .values({
        id,
        name: "Example account (demo)",
        owner: "Unassigned",
        tags: ["SMB", "New Logo"],
        description:
          "Sample account. Delete this company to remove all its demo records.",
      }),
    db
      .insert(contacts)
      .values({
        companyId: id,
        name: "Example buyer",
        email: "buyer@example.com",
        role: "Purchasing",
      }),
    db
      .insert(deals)
      .values({
        companyId: id,
        title: "Example pilot",
        value: "10000.00",
        probability: 50,
        stage: "Qualified",
        owner: "Unassigned",
      }),
    db
      .insert(tasks)
      .values({
        companyId: id,
        title: "Schedule a pilot review",
        dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        owner: "Unassigned",
      }),
    db
      .insert(activities)
      .values({
        companyId: id,
        type: "Note",
        body: "Demo account created. Open company details to try contacts, deals, tasks, and activity.",
      }),
  ]);
  console.log("Created one demo account and its related records.");
}
main().catch((error) => {
  console.error(
    error.message?.startsWith("Demo seed")
      ? error.message
      : "Demo seed failed. Check your writable DATABASE_URL and apply migrations first.",
  );
  process.exitCode = 1;
});
