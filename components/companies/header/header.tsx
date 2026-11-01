"use client";

import { logout } from "@/app/actions";
import { useWorkspaceUser } from "@/components/auth/workspace-access";

import Button from "@/components/_ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/_ui/tabs";

import { useCompaniesStore } from "@/stores/companies-store";
import MenuIcon from "@/public/assets/images/_common/menu.svg";
import ActiveDot from "@/public/assets/images/companies/header/active-dot.svg";
import SearchIcon from "@/public/assets/images/_common/search.svg";

const TABS = [
  { value: "companies", label: "Companies" },
  { value: "deals", label: "Deals" },
  { value: "forecast", label: "Forecast" },
  { value: "contacts", label: "Contacts" },
  { value: "tasks", label: "Tasks" },
  { value: "activities", label: "Activities" },
];

export default function CompaniesHeader() {
  const user = useWorkspaceUser();
  const activeTab = useCompaniesStore((state) => state.activeTab);
  const setActiveTab = useCompaniesStore((state) => state.setActiveTab);
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  const setSearchOpen = useCompaniesStore((state) => state.setSearchOpen);

  return (
    <header className="shrink-0">
      <div className="flex items-center justify-between gap-2 px-4 py-[14px]">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon aria-hidden className="size-3.5" />
          </Button>
          <h1 className="truncate">
            {TABS.find((t) => t.value === activeTab)?.label ?? "Companies"}
          </h1>
          <span className="caption-style bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[#363636] py-[3px] pr-[5px] pl-[3px]">
            <ActiveDot aria-hidden className="size-3" />
            Active
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Search"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon aria-hidden className="size-3.5" />
          </Button>
          <span
            className="text-subtle hidden max-w-52 truncate text-xs sm:block"
            title={user.email}
          >
            {user.name} · {user.role}
          </span>
          {user.role === "admin" && (
            <Button href="/admin">Users and access</Button>
          )}
          <form action={logout}>
            <Button type="submit">Sign out</Button>
          </form>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="border-border max-w-full overflow-x-auto border-b px-4">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </header>
  );
}
