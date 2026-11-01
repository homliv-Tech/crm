import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import UserManagement from "@/components/auth/user-management";
export default async function AdminPage() {
  const access = await getAccess();
  if (access.status === 401 || access.status === 503) redirect("/login");
  if (access.status !== 200) redirect("/access-denied");
  if (access.role !== "admin") redirect("/");
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <Link href="/" className="text-subtle text-sm underline">
        Back to CRM
      </Link>
      <h1 className="mt-6 text-2xl">Users and access</h1>
      <p className="text-subtle mt-2 mb-8 text-sm">
        Invite your team, assign roles, and manage workspace access.
      </p>
      <UserManagement />
    </main>
  );
}
