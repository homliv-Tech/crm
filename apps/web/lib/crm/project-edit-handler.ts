import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { deals } from "../db/schema";
import { projectDetailsInput, projectPhaseInput } from "./project-edit";
import { z } from "zod";

const conflict = () =>
  Response.json(
    {
      error:
        "The project phase changed elsewhere. Close the editor and refresh before changing it again.",
    },
    { status: 409 },
  );

// Called only after the CRM route checks write permission and request origin.
export async function saveProjectEdit(
  db: ReturnType<typeof getDb>,
  body: Record<string, unknown>,
) {
  if (body.action === "changePhase") {
    const { id, stage, expectedStage } = projectPhaseInput.parse(body);
    const [saved] = await db
      .update(deals)
      .set({ stage, updatedAt: new Date() })
      .where(and(eq(deals.id, id), eq(deals.stage, expectedStage)))
      .returning({ id: deals.id });
    if (saved) return Response.json({ ok: true });
    const [existing] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.id, id));
    return existing
      ? conflict()
      : Response.json({ error: "Project no longer exists." }, { status: 404 });
  }
  const id = z.uuid().parse(body.id);
  const { stage, expectedStage, ...details } = projectDetailsInput.parse(body);
  const [existing] = await db
    .select({ companyId: deals.companyId })
    .from(deals)
    .where(eq(deals.id, id));
  if (!existing)
    return Response.json(
      { error: "Project no longer exists." },
      { status: 404 },
    );
  if (existing.companyId !== details.companyId.toLowerCase())
    return Response.json(
      {
        error:
          "A project's client cannot be changed. Create a project for the other client.",
      },
      { status: 400 },
    );
  const changingPhase = stage !== undefined && stage !== expectedStage;
  const [saved] = await db
    .update(deals)
    .set({
      ...details,
      ...(changingPhase ? { stage } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(deals.id, id),
        changingPhase ? eq(deals.stage, expectedStage!) : undefined,
      ),
    )
    .returning({ id: deals.id });
  return saved
    ? Response.json({ ok: true, id: saved.id })
    : changingPhase
      ? conflict()
      : Response.json({ error: "Project no longer exists." }, { status: 404 });
}
