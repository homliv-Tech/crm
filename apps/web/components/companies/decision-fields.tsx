"use client";

import { useState } from "react";
import { Input } from "@/components/_ui/input";
import { DECISION_KINDS, DECISION_STATUSES } from "@/lib/crm/decisions";
import { PROJECT_PHASES } from "@/lib/crm/projects";
import { localDateKey } from "@/lib/crm/format";

export default function DecisionFields({
  record,
  inputClass,
  phase,
}: {
  record: Record<string, unknown>;
  inputClass: string;
  phase?: string;
}) {
  const [kind, setKind] = useState(String(record.kind ?? "Approval"));
  const [status, setStatus] = useState(String(record.status ?? "Pending"));
  function input(
    name: string,
    label: string,
    type = "text",
    fallback: unknown = "",
  ) {
    return (
      <label className="flex flex-col gap-2 text-sm">
        {label}
        <Input
          name={name}
          type={type}
          required
          defaultValue={String(record[name] ?? fallback)}
          maxLength={type === "text" ? 200 : undefined}
          min={
            type === "number"
              ? name === "scheduleImpactDays"
                ? -3650
                : 0
              : undefined
          }
          max={
            name === "scheduleImpactDays"
              ? 3650
              : name === "additionalFee"
                ? 999999999999
                : undefined
          }
          step={name === "additionalFee" ? "0.01" : undefined}
        />
      </label>
    );
  }
  function notes(name: string, label: string) {
    return (
      <label className="flex flex-col gap-2 text-sm">
        {label}
        <textarea
          name={name}
          maxLength={10000}
          defaultValue={String(record[name] ?? "")}
          className={`${inputClass} h-24 py-2`}
        />
      </label>
    );
  }
  return (
    <>
      <label className="flex flex-col gap-2 text-sm">
        Type
        <select
          name="kind"
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {DECISION_KINDS.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {input(
        "title",
        kind === "Design change" ? "Change requested" : "What needs approval",
      )}
      <label className="flex flex-col gap-2 text-sm">
        Project phase
        <select
          name="phase"
          className={inputClass}
          defaultValue={String(record.phase ?? phase ?? "Briefing")}
        >
          {PROJECT_PHASES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {notes("description", "Scope and supporting references")}
      {input("decisionMaker", "Decision-maker")}
      {input("dueDate", "Decision deadline", "date", localDateKey())}
      {input("revision", "Revision submitted (drawing or document reference)")}
      {kind === "Design change" ? (
        <>
          {input(
            "additionalFee",
            "Additional architectural fee (INR)",
            "number",
            0,
          )}
          {input("scheduleImpactDays", "Schedule impact (days)", "number", 0)}
          <p className="text-subtle text-xs">
            Positive days mean a delay; negative days mean earlier delivery.
            Recorded impacts do not automatically change the project fee or
            handover date.
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name="additionalFee" value="0" />
          <input type="hidden" name="scheduleImpactDays" value="0" />
        </>
      )}
      <label className="flex flex-col gap-2 text-sm">
        Decision status
        <select
          name="status"
          className={inputClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {DECISION_STATUSES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {status !== "Pending" ? (
        input("decisionDate", "Decision date", "date", localDateKey())
      ) : (
        <input type="hidden" name="decisionDate" value="" />
      )}
      {status === "Approved" ? (
        input("approvedRevision", "Approved revision")
      ) : (
        <input type="hidden" name="approvedRevision" value="" />
      )}
      {notes("decisionNote", "Decision notes and evidence")}
      <p className="text-subtle text-xs">
        Record the client’s decision and reference their email, meeting minutes,
        or signed document. Saving here records the decision; it does not
        request client approval.
      </p>
    </>
  );
}
