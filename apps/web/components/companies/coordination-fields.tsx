"use client";

import {
  COORDINATION_ROLES,
  SUBMISSION_STATUSES,
} from "@/lib/crm/coordination";
import { useCompaniesStore } from "@/stores/companies-store";
import { Input } from "@/components/_ui/input";

export default function CoordinationFields({
  entity,
  record,
  projectId,
  partnerId,
  onPartnerChange,
  inputClass,
}: {
  entity: "projectPartners" | "projectSubmissions";
  record: Record<string, unknown>;
  projectId: string;
  partnerId: string;
  onPartnerChange: (value: string) => void;
  inputClass: string;
}) {
  const partners = useCompaniesStore((s) => s.projectPartners).filter(
    (p) => p.projectId === projectId,
  );
  const field = (
    name: string,
    label: string,
    required = false,
    type = "text",
  ) => (
    <label className="flex flex-col gap-2 text-sm">
      {label}
      <Input
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground forced-colors:focus-visible:outline-[Highlight]"
        name={name}
        type={type}
        required={required}
        defaultValue={String(record[name] ?? "")}
        maxLength={type === "url" ? 4000 : 200}
      />
    </label>
  );
  const select = (name: string, label: string, options: readonly string[]) => (
    <label className="flex flex-col gap-2 text-sm">
      {label}
      <select
        name={name}
        className={inputClass}
        defaultValue={String(record[name] ?? options[0])}
        required
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  const notes = (name: string, label: string, required = false) => (
    <label className="flex flex-col gap-2 text-sm">
      {label}
      <textarea
        name={name}
        required={required}
        maxLength={10000}
        defaultValue={String(record[name] ?? "")}
        className={`${inputClass} h-24 py-2`}
      />
    </label>
  );
  return entity === "projectPartners" ? (
    <>
      {field("name", "Contact name", true)}
      {field("firm", "Firm or business")}
      {select("role", "Project role", COORDINATION_ROLES)}
      {field("email", "Email", false, "email")}
      {field("phone", "Phone", false, "tel")}
      {notes("responsibilities", "Responsibilities", true)}
    </>
  ) : (
    <>
      <label className="flex flex-col gap-2 text-sm">
        Responsible partner
        <select
          name="partnerId"
          className={inputClass}
          required
          value={partnerId}
          onChange={(event) => onPartnerChange(event.target.value)}
        >
          <option value="">Choose a project partner</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.role}
              {p.firm ? ` · ${p.firm}` : ""}
            </option>
          ))}
        </select>
      </label>
      {!partners.length && (
        <p className="text-subtle text-sm">
          Add a consultant, contractor, or vendor to this project first.
        </p>
      )}
      {field("title", "Submission required", true)}
      {field("dueDate", "Due date", true, "date")}
      {select("status", "Status", SUBMISSION_STATUSES)}
      {field("url", "Submitted document URL", false, "url")}
      {notes("notes", "Notes or review comments")}
    </>
  );
}
