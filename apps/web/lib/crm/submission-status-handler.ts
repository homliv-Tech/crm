import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { projectSubmissions } from "../db/schema";
import { projectSubmissionStatusInput } from "./coordination";

// The CRM route checks permission and origin before dispatching this action.
export async function saveSubmissionStatus(
  db: ReturnType<typeof getDb>,
  body: Record<string, unknown>,
) {
  const { id, status } = projectSubmissionStatusInput.parse(body);
  const [saved] = await db
    .update(projectSubmissions)
    .set({ status, updatedAt: new Date() })
    .where(eq(projectSubmissions.id, id))
    .returning({ id: projectSubmissions.id });
  return saved
    ? Response.json({ ok: true, id: saved.id })
    : Response.json({ error: "Submission no longer exists." }, { status: 404 });
}
