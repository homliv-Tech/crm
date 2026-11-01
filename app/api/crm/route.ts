import { isAuthenticated } from "@/lib/auth";
import { getSnapshot } from "@/lib/crm/snapshot";
export async function GET() {
  if (!(await isAuthenticated()))
    return Response.json(
      { error: "Sign in to your workspace." },
      { status: 401 },
    );
  try {
    return Response.json(await getSnapshot(), {
      headers: { "Cache-Control": "private, no-store" },
    });
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
