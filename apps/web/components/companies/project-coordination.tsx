"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import type { Deal } from "@/lib/crm/types";
import { localDateKey } from "@/lib/crm/format";
import { SUBMISSION_STATUSES } from "@/lib/crm/coordination";
import { selectClass, useCrmEditor } from "./crm-editor";

export default function ProjectCoordination({
  project,
  overview,
  onViewAll,
}: {
  project: Deal;
  overview: boolean;
  onViewAll: () => void;
}) {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [filter, setFilter] = useState("pending");
  const partners = state.projectPartners.filter(
    (p) => p.projectId === project.id,
  );
  const submissions = state.projectSubmissions.filter(
    (s) => s.projectId === project.id,
  );
  const today = localDateKey(new Date());
  const pending = submissions.filter(
    (s) => s.status === "Pending" || s.status === "Changes requested",
  );
  const overdue = pending.filter((s) => s.dueDate < today);
  const filtered = submissions.filter(
    (s) =>
      filter === "all" ||
      (filter === "overdue" ? overdue.includes(s) : pending.includes(s)),
  );
  const context = { companyId: project.companyId, projectId: project.id };
  const disabled = !state.canWrite || state.saving;
  return (
    <section className="border-border min-w-0 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">
          Consultant and contractor coordination
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled}
            onClick={() => edit({ entity: "projectPartners", ...context })}
          >
            Add partner
          </Button>
          <Button
            disabled={disabled || !partners.length}
            onClick={() => edit({ entity: "projectSubmissions", ...context })}
          >
            Request submission
          </Button>
        </div>
      </div>
      <p className="text-subtle mt-3 text-sm">
        {partners.length} project partners · {pending.length} pending
        submissions
        {overdue.length > 0 && (
          <span className="text-red-400"> · {overdue.length} overdue</span>
        )}
      </p>
      {/* Two equal columns share a 24px gutter; both lists stack on narrow screens. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Partners and responsibilities</h3>
          {!partners.length && (
            <p className="text-subtle py-5 text-sm">
              Link structural engineers, services consultants, contractors, and
              vendors to this project.
            </p>
          )}
          {(overview ? partners.slice(0, 3) : partners).map((p) => (
            <div key={p.id} className="border-border border-b py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 break-words">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-subtle mt-1 text-xs">
                    {p.role}
                    {p.firm ? ` · ${p.firm}` : ""}
                  </p>
                </div>
                <Button
                  disabled={disabled}
                  aria-label={`Edit partner ${p.name}`}
                  onClick={() =>
                    edit({ entity: "projectPartners", record: { ...p } })
                  }
                >
                  Edit
                </Button>
              </div>
              <p className="mt-3 text-sm break-words whitespace-pre-wrap">
                {p.responsibilities}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm break-all">
                {p.email && (
                  <a className="underline" href={`mailto:${p.email}`}>
                    {p.email}
                  </a>
                )}
                {p.phone && (
                  <a className="underline" href={`tel:${p.phone}`}>
                    {p.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Submissions</h3>
            <label className="text-subtle flex items-center gap-2 text-sm">
              Show
              <select
                className={`${selectClass} w-auto`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="all">All submissions</option>
              </select>
            </label>
          </div>
          {!filtered.length && (
            <p className="text-subtle py-5 text-sm">
              {submissions.length
                ? "No submissions match this view."
                : "Request drawings, calculations, samples, or other documents from a project partner."}
            </p>
          )}
          {(overview ? filtered.slice(0, 3) : filtered).map((s) => {
            const partner = partners.find((p) => p.id === s.partnerId);
            return (
              <div key={s.id} className="border-border border-b py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm break-words">{s.title}</p>
                    <p className="text-subtle mt-1 text-xs break-words">
                      {partner?.name ?? "Partner unavailable"} · {partner?.role}
                    </p>
                    <p
                      className={`mt-1 text-xs ${overdue.includes(s) ? "text-red-400" : "text-subtle"}`}
                    >
                      Due {s.dueDate}
                      {overdue.includes(s) ? " · Overdue" : ""}
                    </p>
                  </div>
                  <Button
                    disabled={disabled}
                    aria-label={`Edit submission ${s.title}`}
                    onClick={() =>
                      edit({ entity: "projectSubmissions", record: { ...s } })
                    }
                  >
                    Edit
                  </Button>
                </div>
                <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  Status
                  <select
                    aria-label={`Status for ${s.title}`}
                    className={`${selectClass} w-auto`}
                    value={s.status}
                    disabled={disabled}
                    onChange={(e) =>
                      void state.mutate("projectSubmissions", "PATCH", {
                        action: "changeStatus",
                        id: s.id,
                        status: e.target.value,
                      })
                    }
                  >
                    {SUBMISSION_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                {s.url && (
                  <a
                    className="mt-3 block text-sm break-words underline"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open submitted document ↗
                  </a>
                )}
                {s.notes && (
                  <p className="text-subtle mt-2 text-sm break-words whitespace-pre-wrap">
                    {s.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {overview && (
        <button className="mt-4 min-h-11 text-sm underline" onClick={onViewAll}>
          View project coordination
        </button>
      )}
    </section>
  );
}
