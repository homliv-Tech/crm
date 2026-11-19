"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import { DECISION_STATUSES } from "@/lib/crm/decisions";
import { localDateKey, money } from "@/lib/crm/format";
import type { Deal } from "@/lib/crm/types";
import { useCrmEditor, selectClass } from "./crm-editor";

export default function ProjectDecisionRegister({
  project,
  changes = false,
  overview,
  onViewAll,
}: {
  project: Deal;
  changes?: boolean;
  overview: boolean;
  onViewAll: () => void;
}) {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [status, setStatus] = useState("All");
  const decisions = state.projectDecisions.filter(
    (d) =>
      d.projectId === project.id &&
      (changes ? d.kind === "Design change" : d.kind !== "Design change"),
  );
  const matching = decisions
    .filter((d) => overview || status === "All" || d.status === status)
    .toSorted(
      (a, b) =>
        Number(b.status === "Pending") - Number(a.status === "Pending") ||
        a.dueDate.localeCompare(b.dueDate),
    );
  const rows = overview ? matching.slice(0, 4) : matching;
  const pending = decisions.filter((d) => d.status === "Pending");
  const overdue = pending.filter((d) => d.dueDate < localDateKey()).length;
  const approvedFees = decisions
    .filter((d) => d.status === "Approved")
    .reduce((sum, d) => sum + Number(d.additionalFee), 0);
  return (
    <section className="border-border min-w-0 rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">
          {changes ? "Design changes" : "Approvals and stage sign-offs"}
        </h2>
        <Button
          disabled={!state.canWrite || state.saving}
          onClick={() =>
            edit({
              entity: "projectDecisions",
              companyId: project.companyId,
              projectId: project.id,
              record: {
                kind: changes ? "Design change" : "Approval",
                phase: project.stage,
              },
            })
          }
        >
          {changes ? "Record change" : "Add approval"}
        </Button>
      </div>
      <p className="text-subtle text-sm">
        {pending.length} pending
        {overdue > 0 && (
          <span className="text-red-400"> · {overdue} overdue</span>
        )}
        {changes && ` · ${money(approvedFees)} in approved extra fees`}
      </p>
      {!overview && (
        <label className="mt-4 flex max-w-64 flex-col gap-2 text-sm">
          Status
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["All", ...DECISION_STATUSES].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      )}
      {rows.map((d) => (
        <article key={d.id} className="border-border border-b py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium break-words">{d.title}</h3>
              <p className="text-subtle mt-1 text-xs">
                {d.kind} · {d.phase} · {d.status}
              </p>
            </div>
            <Button
              disabled={!state.canWrite || state.saving}
              onClick={() =>
                edit({ entity: "projectDecisions", record: { ...d } })
              }
            >
              {d.status === "Pending" ? "Record decision" : "Edit"}
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-subtle text-xs">Decision-maker</dt>
              <dd className="mt-1 break-words">{d.decisionMaker}</dd>
            </div>
            <div>
              <dt className="text-subtle text-xs">Deadline</dt>
              <dd
                className={`mt-1 ${d.status === "Pending" && d.dueDate < localDateKey() ? "text-red-400" : ""}`}
              >
                {d.dueDate}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-subtle text-xs">Revision submitted</dt>
              <dd className="mt-1 break-words">{d.revision}</dd>
            </div>
            {d.status === "Approved" && (
              <div className="min-w-0">
                <dt className="text-subtle text-xs">Approved revision</dt>
                <dd className="mt-1 break-words">{d.approvedRevision}</dd>
              </div>
            )}
            {changes && (
              <>
                <div>
                  <dt className="text-subtle text-xs">Additional fee</dt>
                  <dd className="mt-1 tabular-nums">
                    {money(Number(d.additionalFee))}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle text-xs">Schedule impact</dt>
                  <dd className="mt-1">
                    {d.scheduleImpactDays === 0
                      ? "No change"
                      : d.scheduleImpactDays > 0
                        ? `${d.scheduleImpactDays} days later`
                        : `${Math.abs(d.scheduleImpactDays)} days earlier`}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {d.description && (
            <p className="mt-3 text-sm break-words whitespace-pre-wrap">
              {d.description}
            </p>
          )}
          {d.decisionDate && (
            <p className="text-subtle mt-3 text-xs">
              {d.status} on {d.decisionDate}
            </p>
          )}
          {d.decisionNote && (
            <p className="mt-2 text-sm break-words whitespace-pre-wrap">
              {d.decisionNote}
            </p>
          )}
        </article>
      ))}
      {!rows.length && (
        <p className="text-subtle py-5 text-sm">
          {decisions.length
            ? "No decisions match this status."
            : changes
              ? "Record scope changes with their proposed fee and schedule impacts."
              : "Track a design approval or stage sign-off, including the revision submitted to the client."}
        </p>
      )}
      {overview && matching.length > 4 && (
        <button className="mt-3 min-h-11 text-sm underline" onClick={onViewAll}>
          View all {matching.length} {changes ? "changes" : "approvals"}
        </button>
      )}
      {changes && (
        <p className="text-subtle mt-3 text-xs">
          Impacts are recorded separately. Update the project fee and handover
          date after agreeing the revised scope.
        </p>
      )}
    </section>
  );
}
