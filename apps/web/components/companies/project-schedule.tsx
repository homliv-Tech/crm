"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import { DELIVERY_PHASES } from "@/lib/crm/projects";
import {
  CHECKLIST_TYPES,
  calendarDaysBetween,
  phaseScheduleStatus,
  type ChecklistType,
} from "@/lib/crm/scheduling";
import { localDateKey } from "@/lib/crm/format";
import type { Deal, ProjectDeliverable } from "@/lib/crm/types";
import { useCrmEditor, selectClass } from "./crm-editor";
import TeammatePicker from "./teammate-picker";

type Phase = (typeof DELIVERY_PHASES)[number];
export default function ProjectSchedule({
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
  const [templateKey, setTemplateKey] = useState<ChecklistType>("Residential");
  const [assigneeId, setAssigneeId] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open");
  const schedules = state.phaseSchedules.filter(
    (s) => s.projectId === project.id,
  );
  const deliverables = state.projectDeliverables.filter(
    (d) => d.projectId === project.id,
  );
  const completed = deliverables.filter((d) => d.completed).length;
  const today = localDateKey();
  const overdue = deliverables.filter(
    (d) => !d.completed && d.dueDate && d.dueDate < today,
  ).length;
  const context = { companyId: project.companyId, projectId: project.id };
  const currentPhase =
    DELIVERY_PHASES.find((p) => p === project.stage) ?? "Briefing";
  const matching = deliverables.filter((d) =>
    overview
      ? !d.completed
      : (!phaseFilter || d.phase === phaseFilter) &&
        (statusFilter === "All" ||
          (statusFilter === "Completed" ? d.completed : !d.completed)),
  );
  const items = overview ? matching.slice(0, 4) : matching;
  function addDeliverable(phase: Phase) {
    const lead = schedules.find((s) => s.phase === phase);
    edit({
      entity: "projectDeliverables",
      ...context,
      record: {
        phase,
        assigneeId: lead?.assigneeId,
        assigneeName: lead?.assigneeName,
      },
    });
  }
  function deliverableRow(d: ProjectDeliverable) {
    return (
      <article
        key={d.id}
        className="border-border flex items-start gap-3 border-t py-3"
      >
        <label className="flex min-h-11 shrink-0 items-center">
          <input
            className="size-5"
            type="checkbox"
            checked={d.completed}
            aria-label={`Complete ${d.title}`}
            disabled={!state.canWrite || state.saving}
            onChange={(e) =>
              void state.mutate("projectDeliverables", "PATCH", {
                id: d.id,
                rowVersion: d.rowVersion,
                completed: e.target.checked,
              })
            }
          />
        </label>
        <div className="min-w-0 flex-1">
          <h4
            className={`text-sm break-words ${d.completed ? "text-subtle line-through" : ""}`}
          >
            {d.title}
          </h4>
          <p className="text-subtle mt-1 text-xs break-words">
            {d.assigneeName} · {d.phase}
            {d.templateKey && ` · ${d.templateKey}`}
          </p>
          <p
            className={`mt-1 text-xs ${!d.completed && d.dueDate && d.dueDate < today ? "text-red-400" : "text-subtle"}`}
          >
            {d.dueDate ? `Due ${d.dueDate}` : "No due date"}
            {d.completedAt &&
              ` · Completed ${new Date(d.completedAt).toLocaleDateString()}`}
          </p>
          {d.notes && (
            <p className="mt-2 text-sm break-words whitespace-pre-wrap">
              {d.notes}
            </p>
          )}
        </div>
        <Button
          className="min-h-11"
          disabled={!state.canWrite || state.saving}
          onClick={() =>
            edit({ entity: "projectDeliverables", record: { ...d } })
          }
        >
          Edit
        </Button>
      </article>
    );
  }
  return (
    <section className="border-border min-w-0 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">Schedule and deliverables</h2>
        <Button
          className="min-h-11"
          disabled={!state.canWrite || state.saving}
          onClick={() => addDeliverable(currentPhase)}
        >
          Add deliverable
        </Button>
      </div>
      <p className="text-subtle mt-3 text-sm">
        {schedules.filter((s) => s.plannedStart || s.plannedEnd).length} of{" "}
        {DELIVERY_PHASES.length} phases planned · {completed} of{" "}
        {deliverables.length} deliverables completed
        {overdue > 0 && (
          <span className="text-red-400"> · {overdue} overdue</span>
        )}
      </p>
      {overview ? (
        <button className="mt-3 min-h-11 text-sm underline" onClick={onViewAll}>
          Open full schedule and starter checklists
        </button>
      ) : (
        <details className="border-border my-5 rounded-lg border p-4">
          <summary className="focus-visible:ring-ring min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:ring-2">
            Set up a starter checklist
          </summary>
          <form
            className="pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setApplyMessage("");
              if (
                await state.mutate("projectDeliverables", "POST", {
                  ...context,
                  action: "applyTemplate",
                  templateKey,
                  assigneeId,
                })
              )
                setApplyMessage(
                  `${templateKey} checklist applied. Existing work has been kept.`,
                );
            }}
          >
            <fieldset
              disabled={!state.canWrite || state.saving}
              className="grid min-w-0 gap-4 md:grid-cols-3"
            >
              <legend className="mb-3 text-sm font-medium">
                Apply a starter checklist
              </legend>
              <label className="flex min-w-0 flex-col gap-2 text-sm">
                Project type
                <select
                  className={selectClass}
                  value={templateKey}
                  onChange={(e) =>
                    setTemplateKey(e.target.value as ChecklistType)
                  }
                >
                  {CHECKLIST_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <TeammatePicker
                value={assigneeId}
                onChange={setAssigneeId}
                inputClass={selectClass}
                label="Default responsible teammate"
              />
              <Button
                type="submit"
                className="min-h-11 self-end"
                disabled={!state.canWrite || state.saving}
              >
                {state.saving ? "Applying…" : "Apply checklist"}
              </Button>
            </fieldset>
            <p className="text-subtle mt-3 text-xs">
              Adds 12 starter deliverables across six phases. Reapplying adds
              missing items and preserves dates, assignments, custom edits, and
              completed work. Review the checklist for your project.
            </p>
            {applyMessage && (
              <p role="status" className="mt-3 text-sm">
                {applyMessage}
              </p>
            )}
          </form>
        </details>
      )}
      <div className="mt-4">
        {(overview ? DELIVERY_PHASES.slice(0, 3) : DELIVERY_PHASES).map(
          (phase) => {
            const schedule = schedules.find((s) => s.phase === phase);
            const status = phaseScheduleStatus(
              schedule ?? {
                plannedStart: null,
                plannedEnd: null,
                actualStart: null,
                actualEnd: null,
              },
              today,
            );
            const phaseItems = deliverables.filter((d) => d.phase === phase);
            const variance =
              schedule?.actualEnd && schedule.plannedEnd
                ? calendarDaysBetween(schedule.plannedEnd, schedule.actualEnd)
                : null;
            return (
              <details
                key={phase}
                open={phase === currentPhase}
                className="border-border border-t py-4"
              >
                <summary className="focus-visible:ring-ring min-h-11 cursor-pointer rounded-sm py-2 text-sm focus-visible:ring-2">
                  <span className="font-medium">{phase}</span>
                  <span
                    className={`ms-2 text-xs ${status === "Overdue" ? "text-danger" : "text-soft"}`}
                  >
                    {status}
                  </span>
                  <span className="text-soft mt-1 block text-xs">
                    {range(schedule?.plannedStart, schedule?.plannedEnd)} ·{" "}
                    {phaseItems.filter((d) => d.completed).length}/
                    {phaseItems.length} deliverables complete
                  </span>
                </summary>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{phase}</h3>
                    <p
                      className={`mt-1 text-xs ${status === "Overdue" ? "text-red-400" : "text-subtle"}`}
                    >
                      {status} · {phaseItems.filter((d) => d.completed).length}/
                      {phaseItems.length} deliverables completed
                    </p>
                  </div>
                  <Button
                    className="min-h-11"
                    disabled={!state.canWrite || state.saving}
                    onClick={() =>
                      edit({
                        entity: "phaseSchedules",
                        ...context,
                        record: schedule ? { ...schedule } : { phase },
                      })
                    }
                  >
                    Edit dates and lead
                  </Button>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-subtle text-xs">Planned dates</dt>
                    <dd className="mt-1 break-words">
                      {range(schedule?.plannedStart, schedule?.plannedEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle text-xs">Actual dates</dt>
                    <dd className="mt-1 break-words">
                      {range(schedule?.actualStart, schedule?.actualEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle text-xs">
                      Responsible teammate
                    </dt>
                    <dd className="mt-1 break-words">
                      {schedule?.assigneeName ?? "Unassigned"}
                    </dd>
                  </div>
                </dl>
                {variance !== null && (
                  <p className="text-subtle mt-3 text-xs">
                    {variance === 0
                      ? "Finished on the planned date"
                      : variance > 0
                        ? `Finished ${variance} days late`
                        : `Finished ${Math.abs(variance)} days early`}
                  </p>
                )}
                {schedule?.notes && (
                  <p className="mt-3 text-sm break-words whitespace-pre-wrap">
                    {schedule.notes}
                  </p>
                )}
              </details>
            );
          },
        )}
      </div>
      <div className="border-border mt-5 border-t pt-4">
        <h3 className="text-base font-medium">Deliverable checklist</h3>
        {!overview && (
          <div className="my-4 flex flex-wrap gap-3">
            <label className="flex min-w-40 flex-1 flex-col gap-2 text-sm">
              Phase
              <select
                className={selectClass}
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
              >
                <option value="">All phases</option>
                {DELIVERY_PHASES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-2 text-sm">
              Status
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {["Open", "Completed", "All"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {overview
          ? items.map(deliverableRow)
          : DELIVERY_PHASES.filter(
              (p) => !phaseFilter || phaseFilter === p,
            ).map((phase) => (
              <section key={phase} className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-medium">{phase}</h4>
                  <Button
                    className="min-h-11"
                    disabled={!state.canWrite || state.saving}
                    onClick={() => addDeliverable(phase)}
                  >
                    Add deliverable
                  </Button>
                </div>
                {items.filter((d) => d.phase === phase).map(deliverableRow)}
                {!items.some((d) => d.phase === phase) && (
                  <p className="text-subtle py-3 text-sm">
                    No{" "}
                    {statusFilter === "All"
                      ? ""
                      : `${statusFilter.toLowerCase()} `}
                    deliverables for this phase.
                  </p>
                )}
              </section>
            ))}
        {overview && !items.length && (
          <p className="text-subtle py-4 text-sm">
            {deliverables.length
              ? "All deliverables are completed."
              : "Apply a starter checklist or add the drawings, reviews, and handover documents this project needs."}
          </p>
        )}
        {overview && deliverables.length > 0 && (
          <button
            className="mt-3 min-h-11 text-sm underline"
            onClick={onViewAll}
          >
            View the full checklist
          </button>
        )}
      </div>
    </section>
  );
}
function range(start?: string | null, end?: string | null) {
  return start && end
    ? `${start} → ${end}`
    : start
      ? `Start ${start}`
      : end
        ? `Finish ${end}`
        : "Not set";
}
