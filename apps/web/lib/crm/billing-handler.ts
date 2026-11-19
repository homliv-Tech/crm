import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { sameOrigin } from "@/lib/access-policy";
import type { getDb as databaseFactory } from "@/lib/db";
import {
  deals,
  feeMilestones,
  paymentReceipts,
  quotations,
} from "@/lib/db/schema";
import { feeMilestoneInput, paymentReceiptInput } from "./billing";

type BillingEntity = "feeMilestones" | "paymentReceipts";
export function createBillingHandler(
  {
    authorize,
    getDb,
  }: {
    authorize: (permission: "crm:write") => Promise<unknown>;
    getDb: typeof databaseFactory;
  },
  entity: BillingEntity,
) {
  const fail = (error: string, status: number) =>
    Response.json({ error }, { status });
  return async function mutate(request: Request) {
    const access = await authorize("crm:write");
    if (access instanceof Response) return access;
    if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
    if (!["POST", "PATCH", "DELETE"].includes(request.method))
      return fail("Method not allowed.", 405);
    if (entity === "paymentReceipts" && request.method === "DELETE")
      return fail(
        "Void a receipt with a reason instead of deleting its history.",
        409,
      );
    try {
      const raw = await request.text();
      if (raw.length > 800000) return fail("Record is too large.", 413);
      const body = z.record(z.string(), z.unknown()).parse(JSON.parse(raw));
      const id =
        request.method === "POST" ? undefined : z.uuid().parse(body.id);
      if (request.method === "DELETE") {
        const rows = await getDb()
          .delete(feeMilestones)
          .where(eq(feeMilestones.id, id!))
          .returning({ id: feeMilestones.id });
        return rows.length
          ? Response.json({ ok: true })
          : fail("Milestone no longer exists.", 404);
      }
      if (entity === "feeMilestones") {
        const data = feeMilestoneInput.parse(body);
        const db = getDb();
        let previousQuotationId: string | null = null;
        if (id) {
          const [old] = await db
            .select()
            .from(feeMilestones)
            .where(eq(feeMilestones.id, id));
          if (!old) return fail("Milestone no longer exists.", 404);
          previousQuotationId = old.quotationId;
          if (
            old.companyId !== data.companyId ||
            old.projectId !== data.projectId
          )
            return fail(
              "A milestone must stay with its original project.",
              400,
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
          return fail("Project does not belong to this client.", 400);
        if (data.quotationId && data.quotationId !== previousQuotationId) {
          const [quote] = await db
            .select({ id: quotations.id })
            .from(quotations)
            .where(
              and(
                eq(quotations.id, data.quotationId),
                eq(quotations.companyId, data.companyId),
                sql`${quotations.document}->>'status' = 'Accepted'`,
                sql`lower(${quotations.document}->'crm'->>'projectId') = ${data.projectId}`,
                sql`${quotations.document}->>'currency' = 'INR'`,
              ),
            );
          if (!quote)
            return fail(
              "Choose an accepted INR quotation for this project.",
              400,
            );
        }
        const rows = id
          ? await db
              .update(feeMilestones)
              .set({ ...data, updatedAt: new Date() })
              .where(eq(feeMilestones.id, id))
              .returning({ id: feeMilestones.id })
          : await db
              .insert(feeMilestones)
              .values(data)
              .returning({ id: feeMilestones.id });
        return rows.length
          ? Response.json(
              { ok: true, id: rows[0].id },
              { status: id ? 200 : 201 },
            )
          : fail("Milestone no longer exists.", 404);
      }
      const data = paymentReceiptInput.parse(body);
      const db = getDb();
      if (id) {
        const [old] = await db
          .select()
          .from(paymentReceipts)
          .where(eq(paymentReceipts.id, id));
        if (!old) return fail("Receipt no longer exists.", 404);
        if (
          old.companyId !== data.companyId ||
          old.projectId !== data.projectId ||
          old.milestoneId !== data.milestoneId
        )
          return fail("A receipt must stay with its original milestone.", 400);
      }
      const [milestone] = await db
        .select({ id: feeMilestones.id })
        .from(feeMilestones)
        .where(
          and(
            eq(feeMilestones.id, data.milestoneId),
            eq(feeMilestones.projectId, data.projectId),
            eq(feeMilestones.companyId, data.companyId),
          ),
        );
      if (!milestone)
        return fail(
          "Milestone does not belong to this project and client.",
          400,
        );
      const rows = id
        ? await db
            .update(paymentReceipts)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(paymentReceipts.id, id))
            .returning({ id: paymentReceipts.id })
        : await db
            .insert(paymentReceipts)
            .values(data)
            .returning({ id: paymentReceipts.id });
      return rows.length
        ? Response.json(
            { ok: true, id: rows[0].id },
            { status: id ? 200 : 201 },
          )
        : fail("Receipt no longer exists.", 404);
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
          ? (error.cause as { code?: string; constraint?: string } | undefined)
          : undefined;
      if (cause?.code === "23505")
        return fail(
          "This invoice or receipt number already exists. Use a unique number.",
          409,
        );
      if (cause?.code === "23503")
        return fail(
          "The linked project or milestone changed. Refresh and try again.",
          409,
        );
      if (cause?.constraint === "milestone_received_range")
        return fail(
          "Payments cannot exceed the milestone amount, and its amount cannot be reduced below recorded receipts.",
          409,
        );
      if (cause?.constraint === "milestone_has_receipts")
        return fail(
          "Milestones with receipt history cannot be deleted. Keep the milestone and void incorrect receipts.",
          409,
        );
      if (cause?.code === "23514")
        return fail(
          "The billing record conflicts with its milestone or receipts. Refresh and try again.",
          409,
        );
      return fail(
        "Could not save billing changes. Check the database connection and try again.",
        503,
      );
    }
  };
}
