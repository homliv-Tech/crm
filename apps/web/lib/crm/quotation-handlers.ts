import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { quotationSchema } from "@crm/quotations/quotation";

import { sameOrigin } from "@/lib/access-policy";
import type { getDb as databaseFactory } from "@/lib/db";
import { companies, contacts, deals, quotations } from "@/lib/db/schema";

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return Response.json(
      { error: "Invalid quotation or client reference." },
      { status: 400 },
    );
  return Response.json(
    {
      error:
        "Could not access quotations. Check the database connection and migrations.",
    },
    { status: 503 },
  );
}

export function createQuotationHandlers({
  authorize,
  getDb,
}: {
  authorize: (permission: "crm:read" | "crm:write") => Promise<unknown>;
  getDb: typeof databaseFactory;
}) {
  async function GET(request: Request) {
    const access = await authorize("crm:read");
    if (access instanceof Response) return access;
    try {
      const params = new URL(request.url).searchParams;
      const id = params.get("id");
      const companyId = params.get("companyId");
      const status = params.get("status");
      if (!id && status !== null) {
        const clientId = z.uuid().parse(companyId);
        const filter = z.enum(["active", "Accepted", "Declined"]).parse(status);
        // List summaries only: full documents can contain large embedded logos.
        const rows = await getDb()
          .select({
            id: quotations.id,
            number: sql<string>`${quotations.document}->>'number'`,
            title: sql<string>`${quotations.document}->>'title'`,
            client: sql<string>`${quotations.document}->'to'->>'name'`,
            status: sql<string>`${quotations.document}->>'status'`,
          })
          .from(quotations)
          .where(
            and(
              eq(quotations.companyId, clientId),
              filter === "active"
                ? sql`${quotations.document}->>'status' in ('Draft', 'Sent')`
                : sql`${quotations.document}->>'status' = ${filter}`,
            ),
          )
          .orderBy(desc(quotations.updatedAt), desc(quotations.id));
        return Response.json(
          { quotations: rows },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      if (!id && !companyId)
        return Response.json(
          { error: "Choose a client or quotation." },
          { status: 400 },
        );
      const db = getDb();
      const rows = await db
        .select()
        .from(quotations)
        .where(
          id
            ? eq(quotations.id, z.uuid().parse(id))
            : eq(quotations.companyId, z.uuid().parse(companyId)),
        )
        .orderBy(desc(quotations.updatedAt));
      if (id && !rows.length)
        return Response.json(
          { error: "Quotation no longer exists." },
          { status: 404 },
        );
      return Response.json(
        { quotations: rows },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return failure(error);
    }
  }

  async function POST(request: Request) {
    const access = await authorize("crm:write");
    if (access instanceof Response) return access;
    if (!sameOrigin(request))
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    try {
      const raw = await request.text();
      if (raw.length > 2000000)
        return Response.json(
          { error: "Quotation is too large." },
          { status: 413 },
        );
      const { document, version } = z
        .object({ document: quotationSchema, version: z.number().int().min(0) })
        .parse(JSON.parse(raw));
      z.uuid().parse(document.id);
      if (!document.crm)
        return Response.json(
          { error: "Link a CRM client first." },
          { status: 400 },
        );
      const db = getDb();
      const link = document.crm;
      const [client] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, link.companyId));
      if (!client)
        return Response.json(
          { error: "Client no longer exists." },
          { status: 409 },
        );
      // Never allow a contact or project belonging to a different client.
      if (link.contactId) {
        const [contact] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.id, link.contactId),
              eq(contacts.companyId, link.companyId),
            ),
          );
        if (!contact)
          return Response.json(
            { error: "Contact does not belong to this client." },
            { status: 400 },
          );
      }
      if (link.projectId) {
        const [project] = await db
          .select({ id: deals.id })
          .from(deals)
          .where(
            and(
              eq(deals.id, link.projectId),
              eq(deals.companyId, link.companyId),
            ),
          );
        if (!project)
          return Response.json(
            { error: "Project does not belong to this client." },
            { status: 400 },
          );
      }
      const values = {
        companyId: link.companyId,
        document,
        updatedAt: new Date(),
      };
      const saved =
        version === 0
          ? await db
              .insert(quotations)
              .values({ ...values, id: document.id })
              .onConflictDoNothing()
              .returning()
          : await db
              .update(quotations)
              .set({ ...values, version: sql`${quotations.version} + 1` })
              .where(
                and(
                  eq(quotations.id, document.id),
                  eq(quotations.version, version),
                ),
              )
              .returning();
      if (!saved.length)
        return Response.json(
          {
            error:
              "This quotation changed in CRM. Export a backup of your edits, delete this local draft, then reopen the quotation from the client record to load the latest CRM copy.",
          },
          { status: 409 },
        );
      return Response.json(
        { quotation: saved[0] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return failure(error);
    }
  }

  async function DELETE(request: Request) {
    const access = await authorize("crm:write");
    if (access instanceof Response) return access;
    if (!sameOrigin(request))
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    try {
      const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
      const removed = await getDb()
        .delete(quotations)
        .where(eq(quotations.id, id))
        .returning({ id: quotations.id });
      if (!removed.length)
        return Response.json(
          { error: "Quotation no longer exists." },
          { status: 404 },
        );
      return Response.json(
        { deleted: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return failure(error);
    }
  }

  return { GET, POST, DELETE };
}
