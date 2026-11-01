import { redirect } from "next/navigation";
import { isAuthenticated, sessionKey } from "@/lib/auth";
import LoginForm from "@/components/companies/login-form";
export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  const configured = !!sessionKey();
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="border-border bg-muted/20 w-full max-w-sm rounded-2xl border p-7">
        <h1 className="mb-2 text-2xl">Sales CRM</h1>
        <p className="text-subtle mb-7 text-sm">
          Sign in to your private sales workspace.
        </p>
        {configured ? (
          <LoginForm />
        ) : (
          <div role="status" className="text-sm leading-relaxed">
            <p>Finish workspace setup to sign in.</p>
            <p className="text-subtle mt-3">
              Set CRM_PASSWORD (at least 12 characters), SESSION_SECRET (at
              least 32 characters), and your Neon DATABASE_URL in .env.local.
              See README.md for setup instructions.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
