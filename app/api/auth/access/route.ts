import { requirePermission } from "@/lib/auth";
export async function GET() {
  const access = await requirePermission("crm:read");
  if (access instanceof Response) return access;
  return Response.json(
    { role: access.role },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
