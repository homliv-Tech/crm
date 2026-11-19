import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { requirePermission } from "@/lib/auth";
import { listAssignableTeam } from "@/lib/crm/team";

export async function GET() {
  const access = await requirePermission("crm:read");
  if (access instanceof Response) return access;
  try {
    const team = await listAssignableTeam(
      getWorkOS().userManagement,
      access.organizationId,
    );
    return Response.json(
      { team },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load active studio teammates. Try again shortly." },
      { status: 503 },
    );
  }
}
