import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { authConfigured } from "@/lib/auth-config";
export async function GET() {
  if (!authConfigured()) redirect("/login");
  redirect(
    await getSignInUrl({
      organizationId: process.env.WORKOS_ORGANIZATION_ID,
      returnTo: "/",
    }),
  );
}
