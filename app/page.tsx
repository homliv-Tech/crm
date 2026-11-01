import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import Sidebar from "@/components/_common/sidebar/sidebar";
import Companies from "@/components/companies/companies";

export default async function Home() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <main className="flex h-dvh max-w-full overflow-hidden">
      <Sidebar />
      <Companies />
    </main>
  );
}
