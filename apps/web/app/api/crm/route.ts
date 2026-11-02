import { requirePermission } from "@/lib/auth";
import { getSnapshot } from "@/lib/crm/snapshot";
export async function GET() {
  const access = await requirePermission("crm:read");
  if (access instanceof Response) return access;
  try {
    return Response.json(
      { ...(await getSnapshot()), role: access.role },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error(
      "CRM database read failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return Response.json(
      {
        error:
          "Could not load the CRM. Check DATABASE_URL and run bun run db:migrate.",
      },
      { status: 503 },
    );
  }
}
