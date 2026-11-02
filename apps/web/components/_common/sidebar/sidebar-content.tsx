"use client";

import { ScrollArea } from "@/components/_ui/scroll-area";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";
import { useCompaniesStore } from "@/stores/companies-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import BuildingIcon from "@/public/assets/images/companies/sidebar/building.svg";
import ClipboardIcon from "@/public/assets/images/companies/sidebar/clipboard.svg";
import BarChartIcon from "@/public/assets/images/companies/sidebar/bar-chart.svg";
import ListIcon from "@/public/assets/images/companies/sidebar/list.svg";
import BookClosedIcon from "@/public/assets/images/companies/sidebar/book-closed.svg";

export default function SidebarContent() {
  const state = useCompaniesStore();
  const items = [
    {
      tab: "companies",
      label: "Companies",
      icon: BuildingIcon,
      count: state.companies.length,
    },
    {
      tab: "deals",
      label: "Deals Board",
      icon: ClipboardIcon,
      count: state.deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost")
        .length,
    },
    { tab: "forecast", label: "Forecast", icon: BarChartIcon },
    {
      tab: "contacts",
      label: "Contacts",
      icon: BookClosedIcon,
      count: state.contacts.length,
    },
    {
      tab: "tasks",
      label: "Tasks",
      icon: ClipboardIcon,
      count: state.tasks.filter((t) => !t.completed).length,
    },
    {
      tab: "activities",
      label: "Activities",
      icon: ListIcon,
      count: state.activities.length,
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0" />
        <div>
          <span className="lead-style block font-medium">Sales CRM</span>
          <span className="caption-style text-subtle">Sales workspace</span>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          <SidebarSection>
            {items.map((item) => (
              <SidebarNavItem
                key={item.tab}
                icon={item.icon}
                label={item.label}
                count={item.count}
                active={state.activeTab === item.tab}
                onClick={() => {
                  state.setActiveTab(item.tab);
                  state.setSidebarOpen(false);
                }}
              />
            ))}
          </SidebarSection>
        </nav>
      </ScrollArea>
      <div className="border-sidebar-border text-subtle border-t p-4 text-xs">
        Company records, customer relationships, and follow-ups in one place.
      </div>
    </div>
  );
}
