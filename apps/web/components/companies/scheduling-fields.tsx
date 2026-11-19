"use client";

import { useState } from "react";
import { Input } from "@/components/_ui/input";
import { DELIVERY_PHASES } from "@/lib/crm/projects";
import TeammatePicker from "./teammate-picker";

export default function SchedulingFields({
  entity,
  record,
  inputClass,
}: {
  entity: "phaseSchedules" | "projectDeliverables";
  record: Record<string, unknown>;
  inputClass: string;
}) {
  const [assigneeId, setAssigneeId] = useState(String(record.assigneeId ?? ""));
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
          defaultValue={String(record.phase ?? "Briefing")}
          disabled={entity === "phaseSchedules"}
        >
          {DELIVERY_PHASES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        {entity === "phaseSchedules" && (
          <input
            type="hidden"
            name="phase"
            value={String(record.phase ?? "Briefing")}
          />
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
        value={assigneeId}
        onChange={setAssigneeId}
        previousName={String(record.assigneeName ?? "")}
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
