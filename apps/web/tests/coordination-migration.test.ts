import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

async function coordinationSchema(postgres: PGlite) {
  const columns = await postgres.query(
    `select table_name, column_name, udt_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ('project_partners', 'project_submissions') order by table_name, ordinal_position`,
  );
  const constraints = await postgres.query(
    `select c.relname, k.conname, pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and k.contype <> 'n' and c.relname in ('project_partners', 'project_submissions') order by c.relname, k.conname`,
  );
  const indexes = await postgres.query(
    `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('project_partners', 'project_submissions') order by tablename, indexname`,
  );
  const enums = await postgres.query(
    `select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname in ('coordination_role', 'submission_status') order by t.typname, e.enumsortorder`,
  );
  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    enums: enums.rows,
  };
}

test("Neon HTTP retries complete migration 0009 after every partial-commit boundary", async () => {
  const postgres = new PGlite();
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const target = migrations[9];
  assert.ok(target);
  const statements = new Set(target.sql.map((s) => s.trim()));
  const failure = new Error("Injected HTTP interruption");
  let remaining: number | null = null;
  const http = neon("postgresql://test:test@example.invalid/test");
  // Preserve the real HTTP migrator's separate, auto-committing SQL requests.
  const transport = mock.method(
    http,
    "query",
    async (statement: string, params: unknown[] = []) => {
      if (remaining === 0) {
        remaining = null;
        throw failure;
      }
      const result = await postgres.query(statement, params);
      if (remaining !== null && statements.has(statement.trim())) remaining--;
      return result;
    },
  );
  try {
    // Apply the preceding migrations and record them as already installed.
    await postgres.exec(
      `create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
    );
    for (const prior of migrations.slice(0, 9)) {
      for (const statement of prior.sql) await postgres.exec(statement);
      await postgres.query(
        `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
        [prior.hash, prior.folderMillis],
      );
    }
    const db = drizzle(http);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const expected = await coordinationSchema(postgres);
    assert.equal(expected.columns.length, 22);
    assert.equal(expected.constraints.length, 7);
    assert.equal(expected.indexes.length, 9);
    assert.equal(expected.enums.length, 8);
    for (let completed = 1; completed <= target.sql.length; completed++) {
      await postgres.exec(
        `drop table public.project_submissions; drop table public.project_partners; drop type public.submission_status; drop type public.coordination_role`,
      );
      await postgres.query(
        `delete from drizzle.__drizzle_migrations where created_at = $1`,
        [target.folderMillis],
      );
      remaining = completed;
      await assert.rejects(
        migrate(db, { migrationsFolder: "./drizzle" }),
        (error: unknown) =>
          error === failure ||
          (error instanceof Error && error.cause === failure),
      );
      assert.equal(
        remaining,
        null,
        `Failure injected after statement ${completed}`,
      );
      const recorded = await postgres.query(
        `select id from drizzle.__drizzle_migrations where created_at = $1`,
        [target.folderMillis],
      );
      assert.equal(recorded.rows.length, 0);
      const committed = await postgres.query(
        `select oid from pg_type where typname = 'coordination_role' and typnamespace = 'public'::regnamespace`,
      );
      assert.equal(
        committed.rows.length,
        1,
        "Earlier statements remain committed",
      );
      await migrate(db, { migrationsFolder: "./drizzle" });
      assert.deepEqual(
        await coordinationSchema(postgres),
        expected,
        `Recovered schema after statement ${completed}`,
      );
      const journal = await postgres.query(
        `select hash from drizzle.__drizzle_migrations where created_at = $1`,
        [target.folderMillis],
      );
      assert.deepEqual(journal.rows, [{ hash: target.hash }]);
    }
    // Re-executing the SQL also preserves existing coordination data.
    await postgres.exec(
      `insert into companies (id, name, owner) values ('10000000-0000-4000-8000-000000000001', 'Client', 'Architect'); insert into deals (id, company_id, title, owner) values ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Home', 'Architect'); insert into project_partners (company_id, project_id, name, role, responsibilities) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Engineer', 'Structural engineer', 'Foundation design')`,
    );
    const before = await postgres.query("select * from project_partners");
    for (const statement of target.sql) await postgres.exec(statement);
    assert.deepEqual(
      (await postgres.query("select * from project_partners")).rows,
      before.rows,
    );
  } finally {
    transport.mock.restore();
    await postgres.close();
  }
});
