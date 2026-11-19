import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { sameOrigin } from "@/lib/access-policy";
import type { getDb as databaseFactory } from "@/lib/db";
import { deals, projectDecisions } from "@/lib/db/schema";
import { projectDecisionInput } from "./validation";

export function createDecisionHandler({
  authorize,
  getDb,
}: {
  authorize: (permission: "crm:write") => Promise<unknown>;
  getDb: typeof databaseFactory;
}) {
  return async function mutate(request: Request) {
    const access = await authorize("crm:write");
    if (access instanceof Response) return access;
    if (!sameOrigin(request))
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    if (!["POST", "PATCH", "DELETE"].includes(request.method))
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    try {
      const raw = await request.text();
      if (raw.length > 800000)
        return Response.json(
          { error: "Record is too large." },
          { status: 413 },
        );
      const body = z.record(z.string(), z.unknown()).parse(JSON.parse(raw));
      const id =
        request.method === "POST" ? undefined : z.uuid().parse(body.id);
      const parsed =
        request.method === "DELETE"
          ? undefined
          : projectDecisionInput.parse(body);
      const db = getDb();
      if (request.method === "DELETE") {
        const deleted = await db
          .delete(projectDecisions)
          .where(eq(projectDecisions.id, id!))
          .returning({ id: projectDecisions.id });
        return deleted.length
          ? Response.json({ ok: true })
          : Response.json(
              { error: "Decision no longer exists." },
              { status: 404 },
            );
      }
      const data = parsed!;
      if (id) {
        const [existing] = await db
          .select()
          .from(projectDecisions)
          .where(eq(projectDecisions.id, id));
        if (!existing)
          return Response.json(
            { error: "Decision no longer exists." },
            { status: 404 },
          );
        if (
          existing.companyId !== data.companyId ||
          existing.projectId !== data.projectId
        )
          return Response.json(
            { error: "A decision must stay with its original project." },
            { status: 400 },
          );
      }
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
        return Response.json(
          { error: "Project does not belong to this client." },
          { status: 400 },
        );
      const saved = id
        ? await db
            .update(projectDecisions)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(projectDecisions.id, id))
            .returning({ id: projectDecisions.id })
        : await db
            .insert(projectDecisions)
            .values(data)
            .returning({ id: projectDecisions.id });
      if (!saved.length)
        return Response.json(
          { error: "Decision no longer exists." },
          { status: 404 },
        );
      return Response.json(
        { ok: true, id: saved[0].id },
        { status: id ? 200 : 201 },
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
      return Response.json(
        {
          error:
            cause?.code === "23503"
              ? "The linked project changed or no longer exists. Refresh and try again."
              : "Could not save this decision. Check the database connection and try again.",
        },
        { status: cause?.code === "23503" ? 409 : 503 },
      );
    }
  };
}
