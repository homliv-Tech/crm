import { loginDestination } from "@/lib/login-destination";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { authConfigured } from "@/lib/auth-config";
export async function GET(request: Request) {
  if (!authConfigured()) redirect("/login");
  redirect(
    await getSignInUrl({
      organizationId: process.env.WORKOS_ORGANIZATION_ID,
      returnTo: loginDestination(new URL(request.url).searchParams.get("next")),
    }),
  );
}
