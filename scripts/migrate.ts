import { config } from "dotenv";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "../lib/db";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied successfully.");
}
main().catch(() => {
  console.error(
    "Migration failed. Check DATABASE_URL, database permissions, and network access. Credentials have not been printed.",
  );
  process.exitCode = 1;
});
