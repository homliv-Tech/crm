import { WorkspaceAccess } from "@/components/auth/workspace-access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import PasskeySettings from "@/components/auth/passkey-settings";
export default async function SecurityPage() {
  const access = await getAccess();
  if (access.status === 401 || access.status === 503) redirect("/login");
  if (access.status !== 200) redirect("/access-denied");
  return (
    <WorkspaceAccess
      user={{
        name:
          [access.user.firstName, access.user.lastName]
            .filter(Boolean)
            .join(" ") || access.user.email,
        email: access.user.email,
        role: access.role,
      }}
    >
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <Link href="/" className="text-subtle text-sm underline">
          Back to CRM
        </Link>
        <h1 className="mt-6 text-2xl">Account security</h1>
        <p className="text-subtle mt-2 mb-8 text-sm">
          Manage passkeys for {access.user.email}.
        </p>
        <PasskeySettings email={access.user.email} />
      </main>
    </WorkspaceAccess>
  );
}
