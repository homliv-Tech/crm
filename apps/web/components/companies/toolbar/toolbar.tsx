"use client";

import { toast } from "@crm/notifications/toast";
import { useState } from "react";
import Button from "@/components/_ui/button";
import FilterMenu from "@/components/_common/filter-menu";
import MobileFilters from "./mobile-filters";
import {
  ACTIVITY_OPTIONS,
  ownerOptions,
  SORT_MENU_OPTIONS,
  STAGE_OPTIONS,
} from "./filter-options";
import type { SortKey } from "@/data/companies";
import { TODAY } from "@/lib/companies";
import { useCompaniesStore } from "@/stores/companies-store";
import ShareIcon from "@/public/assets/images/companies/toolbar/share.svg";
import PlusIcon from "@/public/assets/images/_common/plus.svg";

export default function CompaniesToolbar() {
  const [exporting, setExporting] = useState(false);
  const canWrite = useCompaniesStore((s) => s.canWrite);
  const companies = useCompaniesStore((state) => state.companies);
  const sortBy = useCompaniesStore((state) => state.sortBy);
  const owner = useCompaniesStore((state) => state.owner);
  const stage = useCompaniesStore((state) => state.stage);
  const activityWindow = useCompaniesStore((state) => state.activityWindow);
  const setSortBy = useCompaniesStore((state) => state.setSortBy);
  const setOwner = useCompaniesStore((state) => state.setOwner);
  const setStage = useCompaniesStore((state) => state.setStage);
  const setActivityWindow = useCompaniesStore(
    (state) => state.setActivityWindow,
  );
  const setNewCompanyOpen = useCompaniesStore(
    (state) => state.setNewCompanyOpen,
  );

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await useCompaniesStore.getState().exportCompanies();
      if (!blob) {
        toast.error(
          useCompaniesStore.getState().error ||
            "Could not export clients. Try again.",
        );
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clients-${TODAY}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(
        "Client CSV downloaded",
        `clients-${TODAY}.csv · Includes clients matching your current filters.`,
      );
    } catch {
      toast.error("Could not download the client CSV. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-4">
      <MobileFilters className="sm:hidden" />

      <div className="hidden min-w-0 flex-wrap gap-2 sm:flex">
        <FilterMenu
          label="Sort by"
          value={sortBy}
          options={SORT_MENU_OPTIONS}
          onChange={(value) => setSortBy(value as SortKey)}
        />
        <FilterMenu
          label="Filter"
          value={owner}
          options={ownerOptions(companies)}
          onChange={setOwner}
        />
        <FilterMenu
          label="Client status"
          value={stage}
          options={STAGE_OPTIONS}
          onChange={setStage}
        />
        <FilterMenu
          label="Last Activity"
          value={String(activityWindow)}
          options={ACTIVITY_OPTIONS}
          onChange={(value) => setActivityWindow(Number(value))}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={exporting}
          onClick={() => void exportCsv()}
        >
          <ShareIcon aria-hidden className="size-3" />
          {exporting ? "Exporting…" : "Export"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canWrite}
          onClick={() => setNewCompanyOpen(true)}
        >
          <PlusIcon aria-hidden className="size-3" />
          New client
        </Button>
      </div>
    </div>
  );
}
