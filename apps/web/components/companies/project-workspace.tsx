"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import { useCrmEditor, selectClass } from "./crm-editor";
import ProjectOverview from "./project-overview";
import ProjectCoordination from "./project-coordination";
import ProjectSchedule from "./project-schedule";
import ProjectFees from "./project-fees";
import ProjectDecisionRegister from "./project-decision-register";
import ClientQuotations from "./detail/client-quotations";
import { money, localDateKey } from "@/lib/crm/format";

type Section =
  | "coordination"
  | "schedule"
  | "fees"
  | "overview"
  | "approvals"
  | "changes"
  | "tasks"
  | "correspondence"
  | "contacts"
  | "files"
  | "quotations";
const navigation: {
  label: string;
  sections: { id: Section; label: string }[];
}[] = [
  { label: "Overview", sections: [{ id: "overview", label: "Overview" }] },
  {
    label: "Delivery",
    sections: [
      { id: "schedule", label: "Schedule & deliverables" },
      { id: "tasks", label: "Tasks" },
    ],
  },
  {
    label: "Decisions",
    sections: [
      { id: "approvals", label: "Approvals" },
      { id: "changes", label: "Design changes" },
    ],
  },
  {
    label: "People",
    sections: [
      { id: "coordination", label: "Partners & submissions" },
      { id: "contacts", label: "Client contacts" },
      { id: "correspondence", label: "Correspondence" },
    ],
  },
  {
    label: "Commercial",
    sections: [
      { id: "fees", label: "Fees & payments" },
      { id: "quotations", label: "Quotations" },
    ],
  },
  { label: "Files", sections: [{ id: "files", label: "Files & links" }] },
];

export default function ProjectWorkspace({ projectId }: { projectId: string }) {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [section, setSection] = useState<Section>("overview");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [section]);
  const project = state.deals.find((p) => p.id === projectId);
  if (!project)
    return (
      <div className="p-6">
        <p role="status">This project is no longer available.</p>
        <Button variant="secondary" onClick={state.closeProject}>
          Back to projects
        </Button>
      </div>
    );
  const client = state.companies.find((c) => c.id === project.companyId);
  const tasks = state.tasks.filter((t) => t.projectId === projectId);
  const contacts = state.contacts.filter((c) => c.projectId === projectId);
  const activities = state.activities.filter((a) => a.projectId === projectId);
  const files = state.projectFiles.filter((f) => f.projectId === projectId);
  const today = localDateKey(new Date());
  const context = { companyId: project.companyId, projectId };
  const visible = (name: Section) => section === name;
  const group = navigation.find((item) =>
    item.sections.some((item) => item.id === section),
  )!;

  function assignExisting(entity: "tasks" | "contacts" | "activities") {
    const records = state[entity].filter(
      (r) => r.companyId === project!.companyId && !r.projectId,
    );
    if (!records.length || !state.canWrite) return null;
    return (
      <label className="text-subtle mt-4 flex flex-col gap-2 text-sm">
        Assign an existing{" "}
        {entity === "activities"
          ? "client activity"
          : entity === "contacts"
            ? "client contact"
            : "client task"}
        <select
          className={selectClass}
          value=""
          disabled={state.saving}
          onChange={(e) => {
            const record = records.find((r) => r.id === e.target.value);
            if (record)
              void state.mutate(entity, "PATCH", { ...record, projectId });
          }}
        >
          <option value="">Choose from unassigned client records…</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {"name" in r
                ? r.name
                : "title" in r
                  ? r.title
                  : `${r.type} · ${r.body.slice(0, 80)}`}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={state.closeProject}
          >
            ← Projects
          </Button>
          <span className="text-subtle">/</span>
          <button
            className="text-subtle hover:text-foreground min-h-11 underline"
            onClick={() => state.openDetail(project.companyId)}
          >
            {client?.name ?? "Client"}
          </button>
        </div>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-subtle mb-2 text-sm">
              Project workspace · {project.stage}
            </p>
            <h1 className="text-2xl font-medium break-words">
              {project.title}
            </h1>
            <p className="text-subtle mt-2 text-sm break-words">
              {project.siteAddress || "Site address not added"}
            </p>
          </div>
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={!state.canWrite || state.saving}
            onClick={() => edit({ entity: "deals", record: { ...project } })}
          >
            Edit project
          </Button>
        </header>
        <nav
          aria-label="Project areas"
          className="border-border mt-6 mb-5 grid grid-cols-3 gap-1 border-b pb-2 sm:flex sm:flex-wrap"
        >
          {navigation.map((item) => (
            <button
              key={item.label}
              aria-current={group === item ? "page" : undefined}
              onClick={() => setSection(item.sections[0].id)}
              className={`focus-visible:ring-ring min-h-11 rounded-md px-3 text-sm focus-visible:ring-2 ${group === item ? "bg-muted text-foreground font-medium" : "text-soft hover:bg-muted/50 hover:text-foreground"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {group.sections.length > 1 && (
          <nav
            aria-label={`${group.label} sections`}
            className="mb-6 flex flex-wrap gap-2"
          >
            {group.sections.map((item) => (
              <button
                key={item.id}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
                className={`focus-visible:ring-ring min-h-11 rounded-md border px-3 text-sm focus-visible:ring-2 ${section === item.id ? "border-line-strong text-foreground" : "text-soft hover:text-foreground border-transparent"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
        {section === "overview" && (
          <dl className="border-border mb-6 grid grid-cols-2 gap-5 border-y py-5 lg:grid-cols-4">
            <Fact label="Lead architect" value={project.owner} />
            <Fact
              label="Architectural fee"
              value={money(Number(project.value))}
            />
            <Fact
              label="Target handover"
              value={project.closeDate || "Not scheduled"}
            />
            <Fact label="Progress" value={`${project.probability}% complete`} />
          </dl>
        )}
        {section === "overview" && (
          <ProjectOverview project={project} onNavigate={setSection} />
        )}
        <div className="grid gap-6">
          {visible("schedule") && (
            <div className="min-w-0 lg:col-span-full">
              <ProjectSchedule
                project={project}
                overview={false}
                onViewAll={() => setSection("schedule")}
              />
            </div>
          )}
          {visible("coordination") && (
            <div className="min-w-0 lg:col-span-full">
              <ProjectCoordination
                project={project}
                overview={false}
                onViewAll={() => setSection("coordination")}
              />
            </div>
          )}
          {visible("fees") && (
            <div className="min-w-0 lg:col-span-full">
              <ProjectFees
                project={project}
                overview={false}
                onViewAll={() => setSection("fees")}
              />
            </div>
          )}
          {visible("approvals") && (
            <ProjectDecisionRegister
              key="approvals"
              project={project}
              overview={false}
              onViewAll={() => setSection("approvals")}
            />
          )}
          {visible("changes") && (
            <ProjectDecisionRegister
              key="changes"
              project={project}
              changes
              overview={false}
              onViewAll={() => setSection("changes")}
            />
          )}
          {visible("tasks") && (
            <Block
              title="Tasks"
              action={
                <Button
                  variant="secondary"
                  disabled={!state.canWrite || state.saving}
                  onClick={() => edit({ entity: "tasks", ...context })}
                >
                  Add task
                </Button>
              }
            >
              {tasks.length ? (
                tasks.map((t) => (
                  <div
                    key={t.id}
                    className="border-border flex items-center gap-3 border-b py-3"
                  >
                    <input
                      type="checkbox"
                      className="size-5 shrink-0"
                      aria-label={`Complete ${t.title}`}
                      checked={t.completed}
                      disabled={!state.canWrite || state.saving}
                      onChange={(e) =>
                        void state.mutate("tasks", "PATCH", {
                          ...t,
                          completed: e.target.checked,
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm break-words ${t.completed ? "text-subtle line-through" : ""}`}
                      >
                        {t.title}
                      </p>
                      <p
                        className={`mt-1 text-xs ${!t.completed && t.dueDate < today ? "text-red-400" : "text-subtle"}`}
                      >
                        Due {t.dueDate} · {t.owner}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!state.canWrite}
                      onClick={() =>
                        edit({ entity: "tasks", record: { ...t } })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                ))
              ) : (
                <Empty>No tasks assigned to this project.</Empty>
              )}
              {assignExisting("tasks")}
            </Block>
          )}
          {visible("correspondence") && (
            <Block
              title="Correspondence"
              action={
                <Button
                  variant="secondary"
                  disabled={!state.canWrite || state.saving}
                  onClick={() => edit({ entity: "activities", ...context })}
                >
                  Log activity
                </Button>
              }
            >
              {activities.length ? (
                activities.map((a) => (
                  <div key={a.id} className="border-border border-b py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-subtle text-xs">
                        {a.type} · {new Date(a.occurredAt).toLocaleString()}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={!state.canWrite}
                        onClick={() =>
                          edit({ entity: "activities", record: { ...a } })
                        }
                      >
                        Edit
                      </Button>
                    </div>
                    <p className="mt-2 text-sm break-words whitespace-pre-wrap">
                      {a.body}
                    </p>
                  </div>
                ))
              ) : (
                <Empty>
                  No correspondence yet. Log a meeting, note, call, or email.
                </Empty>
              )}
              {assignExisting("activities")}
            </Block>
          )}
          {visible("contacts") && (
            <Block
              title="Project contacts"
              action={
                <Button
                  variant="secondary"
                  disabled={!state.canWrite || state.saving}
                  onClick={() => edit({ entity: "contacts", ...context })}
                >
                  Add contact
                </Button>
              }
            >
              {contacts.length ? (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="border-border flex items-start justify-between gap-3 border-b py-3"
                  >
                    <div className="min-w-0 text-sm break-words">
                      <p>{c.name}</p>
                      <p className="text-subtle mt-1 text-xs">
                        {c.role || "Role not specified"}
                      </p>
                      {c.email && (
                        <a
                          className="mt-1 block underline"
                          href={`mailto:${c.email}`}
                        >
                          {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a
                          className="mt-1 block underline"
                          href={`tel:${c.phone}`}
                        >
                          {c.phone}
                        </a>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!state.canWrite}
                      onClick={() =>
                        edit({ entity: "contacts", record: { ...c } })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                ))
              ) : (
                <Empty>
                  Add the client representative and other client contacts. Link
                  external consultants and contractors under Partners &amp;
                  submissions.
                </Empty>
              )}
              {assignExisting("contacts")}
            </Block>
          )}
          {visible("files") && (
            <Block
              title="Files and links"
              action={
                <Button
                  variant="secondary"
                  disabled={!state.canWrite || state.saving}
                  onClick={() => edit({ entity: "projectFiles", ...context })}
                >
                  Add link
                </Button>
              }
            >
              {files.length ? (
                files.map((f) => (
                  <div
                    key={f.id}
                    className="border-border flex items-center justify-between gap-3 border-b py-3"
                  >
                    <a
                      className="min-w-0 text-sm break-words underline"
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {f.title} ↗
                    </a>
                    <Button
                      variant="secondary"
                      disabled={!state.canWrite}
                      onClick={() =>
                        edit({ entity: "projectFiles", record: { ...f } })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                ))
              ) : (
                <Empty>
                  Link drawings, documents, and shared folders for this project.
                </Empty>
              )}
            </Block>
          )}
          {visible("quotations") && (
            <div className="min-w-0 lg:col-span-full">
              <ClientQuotations
                key={projectId}
                companyId={project.companyId}
                projectId={projectId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-subtle text-xs">{label}</dt>
      <dd className="mt-2 text-sm break-words tabular-nums">{value}</dd>
    </div>
  );
}
function Block({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border min-w-0 rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="text-subtle py-5 text-sm">{children}</p>;
}
