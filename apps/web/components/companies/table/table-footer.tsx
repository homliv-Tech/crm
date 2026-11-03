"use client";
import { useCompaniesStore } from "@/stores/companies-store";
import { filterCompanies } from "@/lib/companies";
import { money } from "@/lib/crm/format";
export default function TableFooter({ count }: { count: number }) {
  const state = useCompaniesStore();
  const visible = filterCompanies(state.companies, state);
  const sum = visible.reduce((total, c) => total + c.pipelineValue, 0);
  const average = visible.length
    ? Math.round(
        visible.reduce((total, c) => total + c.winProbability, 0) /
          visible.length,
      )
    : 0;
  return (
    <div className="border-border text-subtle grid shrink-0 grid-cols-1 gap-2 border-t p-3 text-xs sm:grid-cols-3">
      <p>{count} clients in view</p>
      <p>
        Active project fees: <span className="text-foreground">{money(sum)}</span>
      </p>
      <p>
        Average client progress:{" "}
        <span className="text-foreground">{average}%</span>
      </p>
    </div>
  );
}
