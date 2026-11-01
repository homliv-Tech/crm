"use client";

import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/_ui/dialog";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { SEGMENTS, STAGES } from "@/data/companies";
import type { Entity } from "@/lib/crm/validation";
import { useCompaniesStore } from "@/stores/companies-store";

type RecordData = Record<string, unknown>;
type Editor = { entity: Entity; record?: RecordData; companyId?: string };
const EditorContext = createContext<(editor: Editor) => void>(() => {});
export const useCrmEditor = () => useContext(EditorContext);
const labels: Record<Entity, string> = {
  companies: "company",
  contacts: "contact",
  deals: "deal",
  tasks: "task",
  activities: "activity",
};
export const selectClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary";

export function CrmEditorProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const canWrite = useCompaniesStore((s) => s.canWrite);
  return (
    <EditorContext.Provider
      value={(editor) => {
        if (canWrite) setEditor(editor);
      }}
    >
      {children}
      {editor && canWrite && (
        <RecordForm
          key={`${editor.entity}-${editor.record?.id ?? "new"}`}
          editor={editor}
          close={() => setEditor(null)}
        />
      )}
    </EditorContext.Provider>
  );
}

function RecordForm({
  editor: { entity, record = {}, companyId },
  close,
}: {
  editor: Editor;
  close: () => void;
}) {
  const companies = useCompaniesStore((s) => s.companies);
  const saving = useCompaniesStore((s) => s.saving);
  const mutate = useCompaniesStore((s) => s.mutate);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const edit = Boolean(record.id);
  const title = `${edit ? "Edit" : "New"} ${labels[entity]}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData);
    const data: RecordData = { ...values, ...(edit ? { id: record.id } : {}) };
    if (entity === "companies") data.tags = formData.getAll("tags");
    if (entity === "tasks") data.completed = values.completed === "on";
    if (entity === "activities")
      data.occurredAt = record.occurredAt ?? new Date().toISOString();
    if (await mutate(entity, edit ? "PATCH" : "POST", data)) close();
    else setError(useCompaniesStore.getState().error);
  }
  function field(
    name: string,
    label: string,
    type = "text",
    required = false,
    fallback: unknown = "",
  ) {
    return (
      <label className="flex flex-col gap-2 text-sm" key={name}>
        {label}
        <Input
          name={name}
          type={type}
          defaultValue={String(record[name] ?? fallback)}
          required={required}
          maxLength={type === "text" ? 200 : undefined}
          min={type === "number" ? 0 : undefined}
          max={name === "probability" ? 100 : undefined}
          step={name === "value" ? "0.01" : undefined}
        />
      </label>
    );
  }
  function select(
    name: string,
    label: string,
    options: { value: string; label: string }[],
    fallback = "",
  ) {
    return (
      <label className="flex flex-col gap-2 text-sm" key={name}>
        {label}
        <select
          name={name}
          className={selectClass}
          required
          defaultValue={String(record[name] ?? fallback ?? options[0]?.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const owner = () =>
    field("owner", "Account owner", "text", true, "Unassigned");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) close();
      }}
    >
      <DialogContent className="max-w-[520px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Save this {labels[entity]} to your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65dvh] gap-4 overflow-y-auto p-5">
            {entity !== "companies" &&
              select(
                "companyId",
                "Company",
                companies.map((c) => ({ value: c.id, label: c.name })),
                companyId ?? companies[0]?.id ?? "",
              )}
            {entity === "companies" && (
              <>
                {field("name", "Company name", "text", true)}
                {owner()}
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-3 text-sm">
                    Segment and account stage
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    {[...SEGMENTS, ...STAGES].map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="tags"
                          value={tag}
                          defaultChecked={(
                            (record.tags as string[] | undefined) ?? [
                              SEGMENTS[0],
                              STAGES[0],
                            ]
                          ).includes(tag)}
                        />
                        {tag}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {field("website", "Website", "url")}
                <label className="flex flex-col gap-2 text-sm">
                  Description
                  <textarea
                    name="description"
                    defaultValue={String(record.description ?? "")}
                    maxLength={10000}
                    className={`${selectClass} h-24 py-2`}
                  />
                </label>
              </>
            )}
            {entity === "contacts" && (
              <>
                {field("name", "Full name", "text", true)}
                {field("email", "Email", "email")}
                {field("phone", "Phone", "tel")}
                {field("role", "Job title")}
              </>
            )}
            {entity === "deals" && (
              <>
                {field("title", "Deal title", "text", true)}
                {field("value", "Value (USD)", "number", true, 0)}
                {field(
                  "probability",
                  "Win probability (%)",
                  "number",
                  true,
                  50,
                )}
                {select(
                  "stage",
                  "Stage",
                  [
                    "Discovery",
                    "Qualified",
                    "Proposal",
                    "Negotiation",
                    "Won",
                    "Lost",
                  ].map((v) => ({ value: v, label: v })),
                  "Discovery",
                )}
                {owner()}
                {field("closeDate", "Expected close date", "date")}
              </>
            )}
            {entity === "tasks" && (
              <>
                {field("title", "Task", "text", true)}
                {owner()}
                {field(
                  "dueDate",
                  "Due date",
                  "date",
                  true,
                  new Date().toISOString().slice(0, 10),
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="completed"
                    type="checkbox"
                    defaultChecked={Boolean(record.completed)}
                  />
                  Completed
                </label>
              </>
            )}
            {entity === "activities" && (
              <>
                {select(
                  "type",
                  "Type",
                  ["Note", "Call", "Email", "Meeting"].map((v) => ({
                    value: v,
                    label: v,
                  })),
                  "Note",
                )}
                <label className="flex flex-col gap-2 text-sm">
                  Details
                  <textarea
                    name="body"
                    required
                    maxLength={10000}
                    defaultValue={String(record.body ?? "")}
                    className={`${selectClass} h-28 py-2`}
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            {deleting && (
              <div className="rounded-lg border border-red-400/40 p-3 text-sm">
                <p>
                  Delete this {labels[entity]}?{" "}
                  {entity === "companies" &&
                    "Its contacts, deals, tasks, and activities will also be deleted."}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    disabled={saving}
                    onClick={async () => {
                      if (await mutate(entity, "DELETE", { id: record.id }))
                        close();
                      else setError(useCompaniesStore.getState().error);
                    }}
                  >
                    Confirm deletion
                  </Button>
                  <Button onClick={() => setDeleting(false)}>
                    Keep record
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {edit && (
              <Button
                className="mr-auto text-red-400"
                disabled={saving}
                onClick={() => setDeleting(true)}
              >
                Delete
              </Button>
            )}
            <Button disabled={saving} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
