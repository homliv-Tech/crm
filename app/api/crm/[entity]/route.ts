import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as tables from "@/lib/db/schema";
import { entitySchemas, type Entity } from "@/lib/crm/validation";
import { splitOpportunityValues } from "@/lib/crm/money";

type Context = { params: Promise<{ entity: string }> };
async function mutate(request: Request, context: Context) {
  if (!(await isAuthenticated()))
    return Response.json(
      { error: "Sign in to your workspace." },
      { status: 401 },
    );
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { entity } = await context.params;
  if (!Object.hasOwn(entitySchemas, entity))
    return Response.json({ error: "Unknown record type." }, { status: 404 });
  const kind = entity as Entity;
  try {
    const raw = await request.text();
    if (raw.length > 800000)
      return Response.json({ error: "Record is too large." }, { status: 413 });
    const body = z.record(z.string(), z.unknown()).parse(JSON.parse(raw));
    const db = getDb();
    const table = tables[kind];
    if (request.method === "DELETE") {
      const id = z.uuid().parse(body.id);
      const deleted = await db
        .delete(table)
        .where(eq(table.id, id))
        .returning({ id: table.id });
      return deleted.length
        ? Response.json({ ok: true })
        : Response.json({ error: "Record no longer exists." }, { status: 404 });
    }
    if (kind === "companies") {
      const {
        openDeals,
        pipelineValue,
        winProbability,
        lastInteraction,
        ...values
      } = entitySchemas.companies.parse(body);
      if (request.method === "PATCH") {
        const updated = await db
          .update(tables.companies)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(tables.companies.id, z.uuid().parse(body.id)))
          .returning({ id: tables.companies.id });
        return updated.length
          ? Response.json({ ok: true })
          : Response.json(
              { error: "Company no longer exists." },
              { status: 404 },
            );
      }
      const id = crypto.randomUUID();
      // Neon HTTP batch runs these statements in one transaction.
      const queries: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
        db.insert(tables.companies).values({ ...values, id }),
      ];
      const initialDeals = splitOpportunityValues(pipelineValue, openDeals).map(
        (value, i) => ({
          companyId: id,
          title: `${values.name} — Opportunity ${i + 1}`,
          owner: values.owner,
          probability: winProbability,
          value,
        }),
      );
      if (initialDeals.length)
        queries.push(db.insert(tables.deals).values(initialDeals));
      if (lastInteraction)
        queries.push(
          db.insert(tables.activities).values({
            companyId: id,
            type: lastInteraction.label,
            body: `Initial ${lastInteraction.label.toLowerCase()} logged when the account was created.`,
            occurredAt: new Date(`${lastInteraction.date}T00:00:00Z`),
          }),
        );
      await db.batch(queries);
      return Response.json({ ok: true, id }, { status: 201 });
    }
    // Keep the table/schema pairing explicit so every write remains type checked.
    async function save(entity: Exclude<Entity, "companies">) {
      const id =
        request.method === "PATCH" ? z.uuid().parse(body.id) : undefined;
      switch (entity) {
        case "contacts": {
          const data = entitySchemas.contacts.parse(body);
          return id
            ? db
                .update(tables.contacts)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.contacts.id, id))
                .returning({ id: tables.contacts.id })
            : db
                .insert(tables.contacts)
                .values(data)
                .returning({ id: tables.contacts.id });
        }
        case "deals": {
          const data = entitySchemas.deals.parse(body);
          return id
            ? db
                .update(tables.deals)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.deals.id, id))
                .returning({ id: tables.deals.id })
            : db
                .insert(tables.deals)
                .values(data)
                .returning({ id: tables.deals.id });
        }
        case "tasks": {
          const data = entitySchemas.tasks.parse(body);
          return id
            ? db
                .update(tables.tasks)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.tasks.id, id))
                .returning({ id: tables.tasks.id })
            : db
                .insert(tables.tasks)
                .values(data)
                .returning({ id: tables.tasks.id });
        }
        case "activities": {
          const data = entitySchemas.activities.parse(body);
          return id
            ? db
                .update(tables.activities)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.activities.id, id))
                .returning({ id: tables.activities.id })
            : db
                .insert(tables.activities)
                .values(data)
                .returning({ id: tables.activities.id });
        }
      }
    }
    const saved = await save(kind);
    if (!saved?.length)
      return Response.json(
        { error: "Record no longer exists." },
        { status: 404 },
      );
    return Response.json(
      { ok: true, id: saved[0].id },
      { status: request.method === "POST" ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string } | undefined)
        : undefined;
    if (cause?.code === "23503")
      return Response.json(
        {
          error: "The linked company no longer exists. Refresh and try again.",
        },
        { status: 409 },
      );
    console.error(
      "CRM database mutation failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return Response.json(
      {
        error:
          "Could not save your changes. Check the database connection and try again.",
      },
      { status: 503 },
    );
  }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
