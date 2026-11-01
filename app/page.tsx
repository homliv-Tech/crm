import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import Sidebar from "@/components/_common/sidebar/sidebar";
import Companies from "@/components/companies/companies";
import { WorkspaceAccess } from "@/components/auth/workspace-access";
export default async function Home() {
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
      <main className="flex h-dvh max-w-full overflow-hidden">
        <Sidebar />
        <Companies />
      </main>
    </WorkspaceAccess>
  );
}
