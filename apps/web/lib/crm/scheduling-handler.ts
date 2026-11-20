import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { sameOrigin } from "@/lib/access-policy";
import type { getDb as databaseFactory } from "@/lib/db";
import { deals, phaseSchedules, projectDeliverables } from "@/lib/db/schema";
import { DELIVERY_PHASES } from "./projects";
import {
  applyChecklistInput,
  CHECKLIST_STARTERS,
  phaseScheduleInput,
  projectDeliverableInput,
} from "./scheduling";
import type { Teammate } from "./team";

type Entity = "phaseSchedules" | "projectDeliverables";
type Assignment = { assigneeId: string | null; assigneeName: string };
export function createSchedulingHandler(
  {
    authorize,
    getDb,
    getTeam,
  }: {
    authorize: (permission: "crm:write") => Promise<unknown>;
    getDb: typeof databaseFactory;
    getTeam: () => Promise<Teammate[]>;
  },
  entity: Entity,
) {
  const fail = (error: string, status: number) =>
    Response.json({ error }, { status });
  async function assignment(
    id: string | null | undefined,
    previous?: Assignment,
  ): Promise<Assignment> {
    if (!id) return { assigneeId: null, assigneeName: "Unassigned" };
    if (id === previous?.assigneeId)
      return {
        assigneeId: previous.assigneeId,
        assigneeName: previous.assigneeName,
      };
    const teammate = (await getTeam()).find((t) => t.id === id);
    if (!teammate)
      throw new z.ZodError([
        {
          code: "custom",
          path: ["assigneeId"],
          message: "Choose an active studio teammate with editing access.",
        },
      ]);
    return { assigneeId: teammate.id, assigneeName: teammate.name };
  }
  return async function mutate(request: Request) {
    const access = await authorize("crm:write");
    if (access instanceof Response) return access;
    if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
    if (!["POST", "PATCH", "DELETE"].includes(request.method))
      return fail("Method not allowed.", 405);
    try {
      const raw = await request.text();
      if (raw.length > 800000) return fail("Record is too large.", 413);
      const body = z.record(z.string(), z.unknown()).parse(JSON.parse(raw));
      const id =
        request.method === "POST" ? undefined : z.uuid().parse(body.id);
      const db = getDb();
      const table =
        entity === "phaseSchedules" ? phaseSchedules : projectDeliverables;
      if (request.method === "DELETE") {
        const rows = await db
          .delete(table)
          .where(eq(table.id, id!))
          .returning({ id: table.id });
        return rows.length
          ? Response.json({ ok: true })
          : fail("Record no longer exists.", 404);
      }
      if (body.action === "applyTemplate") {
        if (entity !== "projectDeliverables" || request.method !== "POST")
          return fail(
            "Apply a checklist to project deliverables using POST.",
            400,
          );
        const data = applyChecklistInput.parse(body);
        const [project] = await db
          .select({ id: deals.id })
          .from(deals)
          .where(
            and(
              eq(deals.id, data.projectId),
              eq(deals.companyId, data.companyId),
            ),
          );
        if (!project)
          return fail("Project does not belong to this client.", 400);
        const owner = await assignment(data.assigneeId);
        const phaseValues = sql.join(
          DELIVERY_PHASES.map(
            (phase) =>
              sql`(${data.companyId}::uuid, ${data.projectId}::uuid, ${phase}::deal_stage, ${owner.assigneeId}, ${owner.assigneeName})`,
          ),
          sql`, `,
        );
        const itemValues = sql.join(
          CHECKLIST_STARTERS[data.templateKey].map(
            (item) =>
              sql`(${data.companyId}::uuid, ${data.projectId}::uuid, ${item.phase}::deal_stage, ${item.title}, ${data.templateKey}, ${item.key}, ${owner.assigneeId}, ${owner.assigneeName})`,
          ),
          sql`, `,
        );
        // One statement makes schedule initialization and checklist application atomic.
        await db.execute(sql`with initialized as (
          insert into phase_schedules (company_id, project_id, phase, assignee_id, assignee_name) values ${phaseValues}
          on conflict (project_id, phase) do nothing returning id
        ) insert into project_deliverables (company_id, project_id, phase, title, template_key, template_item_key, assignee_id, assignee_name)
          values ${itemValues} on conflict (project_id, template_key, template_item_key) do nothing`);
        return Response.json({ ok: true });
      }
      if (entity === "phaseSchedules") {
        const [old] = id
          ? await db
              .select({
                ...getTableColumns(phaseSchedules),
                rowVersion: sql<string>`${phaseSchedules}.xmin::text`,
              })
              .from(phaseSchedules)
              .where(eq(phaseSchedules.id, id))
          : [];
        if (id && !old) return fail("Phase schedule no longer exists.", 404);
        const data = phaseScheduleInput.parse({ ...old, ...body });
        if (
          old &&
          (old.projectId !== data.projectId ||
            old.companyId !== data.companyId ||
            old.phase !== data.phase)
        )
          return fail(
            "A phase schedule must stay with its original project and phase.",
            400,
          );
        const [project] = await db
          .select({ id: deals.id })
          .from(deals)
          .where(
            and(
              eq(deals.id, data.projectId),
              eq(deals.companyId, data.companyId),
            ),
          );
        if (!project)
          return fail("Project does not belong to this client.", 400);
        const owner = await assignment(data.assigneeId, old);
        const rows = id
          ? await db
              .update(phaseSchedules)
              .set({ ...data, ...owner, updatedAt: new Date() })
              // Compare the row version read above, not a timestamp rounded to milliseconds.
              .where(
                and(
                  eq(phaseSchedules.id, id),
                  sql`${phaseSchedules}.xmin::text = ${old!.rowVersion}`,
                ),
              )
              .returning({ id: phaseSchedules.id })
          : await db
              .insert(phaseSchedules)
              .values({ ...data, ...owner })
              .returning({ id: phaseSchedules.id });
        return rows.length
          ? Response.json(
              { ok: true, id: rows[0].id },
              { status: id ? 200 : 201 },
            )
          : fail(
              "Phase schedule changed while saving. Refresh and try again.",
              409,
            );
      }
      const [old] = id
        ? await db
            .select({
              ...getTableColumns(projectDeliverables),
              rowVersion: sql<string>`${projectDeliverables}.xmin::text`,
            })
            .from(projectDeliverables)
            .where(eq(projectDeliverables.id, id))
        : [];
      if (id && !old) return fail("Deliverable no longer exists.", 404);
      const data = projectDeliverableInput.parse({ ...old, ...body });
      if (
        old &&
        (old.projectId !== data.projectId || old.companyId !== data.companyId)
      )
        return fail("A deliverable must stay with its original project.", 400);
      const [project] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(
          and(
            eq(deals.id, data.projectId),
            eq(deals.companyId, data.companyId),
          ),
        );
      if (!project) return fail("Project does not belong to this client.", 400);
      const owner = await assignment(data.assigneeId, old);
      const values = {
        ...data,
        ...owner,
        completedAt: data.completed ? (old?.completedAt ?? new Date()) : null,
      };
      const rows = id
        ? await db
            .update(projectDeliverables)
            .set({ ...values, updatedAt: new Date() })
            .where(
              and(
                eq(projectDeliverables.id, id),
                sql`${projectDeliverables}.xmin::text = ${old!.rowVersion}`,
              ),
            )
            .returning({ id: projectDeliverables.id })
        : await db
            .insert(projectDeliverables)
            .values(values)
            .returning({ id: projectDeliverables.id });
      return rows.length
        ? Response.json(
            { ok: true, id: rows[0].id },
            { status: id ? 200 : 201 },
          )
        : fail("Deliverable changed while saving. Refresh and try again.", 409);
    } catch (error) {
      if (error instanceof z.ZodError)
        return fail(
          error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
          400,
        );
      if (error instanceof SyntaxError) return fail("Invalid JSON.", 400);
      const cause =
        error instanceof Error
          ? (error.cause as { code?: string } | undefined)
          : undefined;
      if (cause?.code === "23505")
        return fail(
          "This phase schedule or starter item already exists. Refresh and try again.",
          409,
        );
      if (cause?.code === "23503")
        return fail(
          "The linked project changed or no longer exists. Refresh and try again.",
          409,
        );
      if (cause?.code === "23514")
        return fail("Check the phase dates and deliverable details.", 400);
      return fail(
        "Could not save the schedule or checklist. Reconnect and try again.",
        503,
      );
    }
  };
}
