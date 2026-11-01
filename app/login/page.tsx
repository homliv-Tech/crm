import Link from "next/link";
import LoginForm from "@/components/auth/login-form";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { authConfigured } from "@/lib/auth-config";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation_token?: string }>;
}) {
  const { invitation_token } = await searchParams;
  const invitationToken =
    typeof invitation_token === "string" ? invitation_token : undefined;
  const access = await getAccess();
  if (access.status === 200) redirect("/");
  if (access.status === 403) redirect("/access-denied");
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="border-border bg-muted/20 w-full max-w-sm rounded-2xl border p-7">
        <h1 className="mb-2 text-2xl">Sales CRM</h1>
        <p className="text-subtle mb-7 text-sm">
          Enter your work email to receive a sign-in code.
        </p>
        {authConfigured() ? (
          <>
            <LoginForm invitationToken={invitationToken} />
            <div className="border-border mt-6 border-t pt-5">
              <Link
                href="/sign-in/passkey"
                prefetch={false}
                className="border-border block rounded-lg border px-4 py-3 text-center text-sm"
              >
                Sign in with a passkey
              </Link>
              <p className="text-subtle mt-2 text-xs">
                Opens WorkOS to use your passkey. New teammates should accept
                their invitation with an email code first.
              </p>
            </div>
            {access.status === 503 && (
              <p role="status" className="mt-4 text-sm">
                {access.error}
              </p>
            )}
          </>
        ) : (
          <p role="status" className="text-sm">
            Workspace sign-in is not ready yet. Contact your administrator to
            finish setup.
          </p>
        )}
      </section>
    </main>
  );
}
