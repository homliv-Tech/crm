import { projectHref, projectIdFromQuery } from "@/lib/crm/project-navigation";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import Sidebar from "@/components/_common/sidebar/sidebar";
import Companies from "@/components/companies/companies";
import { WorkspaceAccess } from "@/components/auth/workspace-access";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const initialProjectId = projectIdFromQuery((await searchParams).project);
  const access = await getAccess();
  if (access.status === 401 || access.status === 503)
    redirect(
      initialProjectId
        ? `/login?next=${encodeURIComponent(projectHref(initialProjectId))}`
        : "/login",
    );
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
        <Companies initialProjectId={initialProjectId} />
      </main>
    </WorkspaceAccess>
  );
}
