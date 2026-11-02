"use client";

import { useEffect } from "react";
import { useCompaniesStore } from "@/stores/companies-store";
import Button from "@/components/_ui/button";
import CrmViews from "./crm-views";
import { CrmEditorProvider } from "./crm-editor";
import CompaniesHeader from "./header/header";
import CompaniesToolbar from "./toolbar/toolbar";
import CompaniesTable from "./table/companies-table";
import CompanyDetail from "./detail/company-detail";
import Profile from "./profile/profile";
import NewCompanyDialog from "./new-company/new-company-dialog";
import CommandMenu from "./command-menu/command-menu";

export default function Companies() {
  const canWrite = useCompaniesStore((s) => s.canWrite);
  const tab = useCompaniesStore((s) => s.activeTab);
  const error = useCompaniesStore((s) => s.error);
  const loading = useCompaniesStore((s) => s.loading);
  const refresh = useCompaniesStore((s) => s.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <CrmEditorProvider>
      <section id="companies" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CompaniesHeader />
        {!loading && !canWrite && !error && (
          <p className="text-subtle border-border border-b px-4 py-2 text-xs">
            Read-only access. Contact an administrator if you need to edit
            records.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-red-400/30 bg-red-400/10 px-4 py-3 text-sm"
          >
            <span>{error}</span>
            <Button onClick={() => void refresh()}>Retry</Button>
          </div>
        )}
        {loading ? (
          <p role="status" className="text-subtle p-8 text-sm">
            Loading your workspace…
          </p>
        ) : tab === "companies" ? (
          <>
            <CompaniesToolbar />
            <CompaniesTable />
          </>
        ) : (
          <CrmViews key={tab} />
        )}
        <CompanyDetail />
        <Profile />
        <NewCompanyDialog />
        <CommandMenu />
      </section>
    </CrmEditorProvider>
  );
}
