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
        name: "Mehta family (demo)",
        owner: "Unassigned",
        tags: ["Residential", "Active"],
        description:
          "Sample client. Delete this client to remove all its demo records.",
      }),
    db
      .insert(contacts)
      .values({
        companyId: id,
        name: "Ananya Mehta",
        email: "ananya@example.com",
        role: "Homeowner",
      }),
    db
      .insert(deals)
      .values({
        companyId: id,
        title: "Courtyard house renovation",
        value: "10000.00",
        probability: 20,
        stage: "Concept design",
        siteAddress: "14 Garden Road",
        brief: "Renovate a family home around a central courtyard.",
        owner: "Unassigned",
      }),
    db
      .insert(tasks)
      .values({
        companyId: id,
        title: "Review concept drawings with the client",
        dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        owner: "Unassigned",
      }),
    db
      .insert(activities)
      .values({
        companyId: id,
        type: "Note",
        body: "Demo client created. Open client details to manage contacts, projects, tasks, and correspondence.",
      }),
  ]);
  console.log("Created one demo client and its related records.");
}
main().catch((error) => {
  console.error(
    error.message?.startsWith("Demo seed")
      ? error.message
      : "Demo seed failed. Check your writable DATABASE_URL and apply migrations first.",
  );
  process.exitCode = 1;
});
