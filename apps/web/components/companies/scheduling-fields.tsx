"use client";

import { useState } from "react";
import { Input } from "@/components/_ui/input";
import { DELIVERY_PHASES } from "@/lib/crm/projects";
import { useCompaniesStore } from "@/stores/companies-store";
import { resolveSchedulingAssignment } from "@/lib/crm/scheduling-assignment";
import TeammatePicker from "./teammate-picker";

export default function SchedulingFields({
  entity,
  record,
  projectId,
  inputClass,
}: {
  entity: "phaseSchedules" | "projectDeliverables";
  record: Record<string, unknown>;
  projectId: string;
  inputClass: string;
}) {
  const schedules = useCompaniesStore((s) => s.phaseSchedules);
  const [phase, setPhase] = useState(String(record.phase ?? "Briefing"));
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(
    null,
  );
  const assignment = resolveSchedulingAssignment({
    followPhaseLead: entity === "projectDeliverables" && !record.id,
    projectId,
    phase,
    original: {
      assigneeId: String(record.assigneeId ?? ""),
      assigneeName: String(record.assigneeName ?? ""),
    },
    selectedId: selectedAssigneeId,
    schedules,
  });
  function date(name: string, label: string) {
    return (
      <label className="flex flex-col gap-2 text-sm">
        {label}
        <Input
          name={name}
          type="date"
          defaultValue={String(record[name] ?? "")}
        />
      </label>
    );
  }
  return (
    <>
      <label className="flex flex-col gap-2 text-sm">
        Project phase
        <select
          name="phase"
          className={inputClass}
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          disabled={entity === "phaseSchedules"}
        >
          {DELIVERY_PHASES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        {entity === "phaseSchedules" && (
          <input type="hidden" name="phase" value={phase} />
        )}
      </label>
      {entity === "projectDeliverables" && (
        <label className="flex flex-col gap-2 text-sm">
          Deliverable
          <Input
            name="title"
            required
            maxLength={200}
            defaultValue={String(record.title ?? "")}
          />
        </label>
      )}
      <TeammatePicker
        value={assignment.assigneeId}
        onChange={setSelectedAssigneeId}
        previousName={assignment.assigneeName}
        inputClass={inputClass}
      />
      {entity === "phaseSchedules" ? (
        <>
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm">Planned dates</legend>
            {date("plannedStart", "Planned start")}
            {date("plannedEnd", "Planned finish")}
          </fieldset>
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm">Actual dates</legend>
            {date("actualStart", "Actual start")}
            {date("actualEnd", "Actual finish")}
          </fieldset>
          <p className="text-subtle text-xs">
            Leave unknown dates empty. Recording actual dates tracks this phase;
            it does not change the project’s current phase or handover date.
          </p>
        </>
      ) : (
        <>
          {date("dueDate", "Deliverable due date")}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              name="completed"
              type="checkbox"
              defaultChecked={Boolean(record.completed)}
            />
            Completed
          </label>
        </>
      )}
      <label className="flex flex-col gap-2 text-sm">
        Notes
        <textarea
          name="notes"
          maxLength={10000}
          defaultValue={String(record.notes ?? "")}
          className={`${inputClass} h-24 py-2`}
        />
      </label>
    </>
  );
}
