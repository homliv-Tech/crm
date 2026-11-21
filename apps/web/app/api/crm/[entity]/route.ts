import { PROJECT_PHASES } from "@/lib/crm/projects";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { createSchedulingHandler } from "@/lib/crm/scheduling-handler";
import { listAssignableTeam } from "@/lib/crm/team";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as tables from "@/lib/db/schema";
import {
  companyCreateInput,
  entitySchemas,
  type Entity,
} from "@/lib/crm/validation";
import { createBillingHandler } from "@/lib/crm/billing-handler";
import { createDecisionHandler } from "@/lib/crm/decision-handler";
import { splitOpportunityValues } from "@/lib/crm/money";

type Context = { params: Promise<{ entity: string }> };
async function mutate(request: Request, context: Context) {
  const access = await requirePermission("crm:write");
  if (access instanceof Response) return access;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { entity } = await context.params;
  if (!Object.hasOwn(entitySchemas, entity))
    return Response.json({ error: "Unknown record type." }, { status: 404 });
  const kind = entity as Entity;
  if (kind === "phaseSchedules" || kind === "projectDeliverables")
    return createSchedulingHandler(
      {
        authorize: async () => access,
        getDb,
        getTeam: () =>
          listAssignableTeam(getWorkOS().userManagement, access.organizationId),
      },
      kind,
    )(request);
  if (kind === "feeMilestones" || kind === "paymentReceipts")
    return createBillingHandler(
      { authorize: async () => access, getDb },
      kind,
    )(request);
  if (kind === "projectDecisions")
    return createDecisionHandler({ authorize: async () => access, getDb })(
      request,
    );
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
    if (
      kind === "deals" &&
      request.method === "PATCH" &&
      body.action === "changePhase"
    ) {
      const { id, stage } = z
        .object({ id: z.uuid(), stage: z.enum(PROJECT_PHASES) })
        .parse(body);
      const [updated] = await db
        .update(tables.deals)
        .set({ stage, updatedAt: new Date() })
        .where(eq(tables.deals.id, id))
        .returning({ id: tables.deals.id });
      return updated
        ? Response.json({ ok: true })
        : Response.json(
            { error: "Project no longer exists." },
            { status: 404 },
          );
    }
    if (kind === "companies") {
      const {
        openDeals,
        pipelineValue,
        winProbability,
        lastInteraction,
        ...values
      } = (
        request.method === "POST" ? companyCreateInput : entitySchemas.companies
      ).parse(body);
      if (request.method === "PATCH") {
        const updated = await db
          .update(tables.companies)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(tables.companies.id, z.uuid().parse(body.id)))
          .returning({ id: tables.companies.id });
        return updated.length
          ? Response.json({ ok: true })
          : Response.json(
              { error: "Client no longer exists." },
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
          title: `${values.name} — Project ${i + 1}`,
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
            body: `Initial ${lastInteraction.label.toLowerCase()} logged when the client was created.`,
            occurredAt: new Date(`${lastInteraction.date}T00:00:00Z`),
          }),
        );
      await db.batch(queries);
      return Response.json({ ok: true, id }, { status: 201 });
    }
    if (kind !== "deals" && "projectId" in body && body.projectId) {
      const projectId = z.uuid().parse(body.projectId);
      const companyId = z.uuid().parse(body.companyId);
      const [project] = await db
        .select({ id: tables.deals.id })
        .from(tables.deals)
        .where(
          and(
            eq(tables.deals.id, projectId),
            eq(tables.deals.companyId, companyId),
          ),
        );
      if (!project)
        return Response.json(
          { error: "Project does not belong to this client." },
          { status: 400 },
        );
    }
    if (kind === "deals" && request.method === "PATCH") {
      const [existing] = await db
        .select()
        .from(tables.deals)
        .where(eq(tables.deals.id, z.uuid().parse(body.id)));
      if (existing && existing.companyId !== body.companyId)
        return Response.json(
          {
            error:
              "A project's client cannot be changed. Create a project for the other client.",
          },
          { status: 400 },
        );
    }
    if (
      (kind === "projectPartners" || kind === "projectSubmissions") &&
      request.method === "PATCH"
    ) {
      const scopedTable = tables[kind];
      const [existing] = await db
        .select()
        .from(scopedTable)
        .where(eq(scopedTable.id, z.uuid().parse(body.id)));
      if (
        existing &&
        (existing.companyId !== body.companyId ||
          !("projectId" in existing) ||
          existing.projectId !== body.projectId)
      )
        return Response.json(
          { error: "The linked project cannot be changed." },
          { status: 400 },
        );
    }
    // Keep the table/schema pairing explicit so every write remains type checked.
    async function save(
      entity: Exclude<
        Entity,
        | "companies"
        | "projectDecisions"
        | "feeMilestones"
        | "paymentReceipts"
        | "phaseSchedules"
        | "projectDeliverables"
      >,
    ) {
      const id =
        request.method === "PATCH" ? z.uuid().parse(body.id) : undefined;
      switch (entity) {
        case "projectSubmissions": {
          const data = entitySchemas.projectSubmissions.parse(body);
          return id
            ? db
                .update(tables.projectSubmissions)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.projectSubmissions.id, id))
                .returning({ id: tables.projectSubmissions.id })
            : db
                .insert(tables.projectSubmissions)
                .values(data)
                .returning({ id: tables.projectSubmissions.id });
        }
        case "projectPartners": {
          const data = entitySchemas.projectPartners.parse(body);
          return id
            ? db
                .update(tables.projectPartners)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.projectPartners.id, id))
                .returning({ id: tables.projectPartners.id })
            : db
                .insert(tables.projectPartners)
                .values(data)
                .returning({ id: tables.projectPartners.id });
        }
        case "projectFiles": {
          const data = entitySchemas.projectFiles.parse(body);
          return id
            ? db
                .update(tables.projectFiles)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(tables.projectFiles.id, id))
                .returning({ id: tables.projectFiles.id })
            : db
                .insert(tables.projectFiles)
                .values(data)
                .returning({ id: tables.projectFiles.id });
        }
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
          error:
            "The linked client or project changed or no longer exists. Refresh and try again.",
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
