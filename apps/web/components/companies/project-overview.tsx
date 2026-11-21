"use client";

import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import { localDateKey, money } from "@/lib/crm/format";
import type { Deal } from "@/lib/crm/types";
import { ProjectProgress } from "./project-status";
import { useCrmEditor } from "./crm-editor";

type Destination =
  | "tasks"
  | "schedule"
  | "approvals"
  | "changes"
  | "coordination";

export default function ProjectOverview({
  project,
  onNavigate,
}: {
  project: Deal;
  onNavigate: (section: Destination) => void;
}) {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const today = localDateKey();
  const tasks = state.tasks.filter(
    (t) => t.projectId === project.id && !t.completed,
  );
  const deliverables = state.projectDeliverables.filter(
    (d) => d.projectId === project.id && !d.completed,
  );
  const decisions = state.projectDecisions.filter(
    (d) => d.projectId === project.id && d.status === "Pending",
  );
  const submissions = state.projectSubmissions.filter(
    (s) =>
      s.projectId === project.id &&
      (s.status === "Pending" || s.status === "Changes requested"),
  );
  const upcoming = [
    ...tasks.map((t) => ({
      id: t.id,
      title: t.title,
      date: t.dueDate,
      owner: t.owner,
      kind: "Task",
      section: "tasks" as const,
    })),
    ...deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      date: d.dueDate,
      owner: d.assigneeName,
      kind: "Deliverable",
      section: "schedule" as const,
    })),
    ...decisions.map((d) => ({
      id: d.id,
      title: d.title,
      date: d.dueDate,
      owner: d.decisionMaker,
      kind: d.kind,
      section:
        d.kind === "Design change"
          ? ("changes" as const)
          : ("approvals" as const),
    })),
    ...submissions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.dueDate,
      owner:
        state.projectPartners.find((p) => p.id === s.partnerId)?.name ??
        "Unassigned",
      kind: "Submission",
      section: "coordination" as const,
    })),
  ]
    .filter((item) => item.date)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const overdue = upcoming.filter((item) => item.date! < today).length;
  return (
    <div className="space-y-8">
      <div className="border-border bg-secondary/30 grid grid-cols-2 overflow-hidden rounded-xl border lg:grid-cols-4">
        {[
          {
            label: "Open tasks",
            count: tasks.length,
            section: "tasks" as const,
          },
          {
            label: "Deliverables remaining",
            count: deliverables.length,
            section: "schedule" as const,
          },
          {
            label: "Approvals pending",
            count: decisions.filter((d) => d.kind !== "Design change").length,
            section: "approvals" as const,
          },
          {
            label: "Submissions pending",
            count: submissions.length,
            section: "coordination" as const,
          },
        ].map((item) => (
          <button
            key={item.section}
            className="group border-border hover:bg-muted/50 focus-visible:ring-ring border-e border-b p-5 text-start transition-colors duration-150 even:border-e-0 focus-visible:ring-2 focus-visible:ring-inset lg:border-b-0 lg:last:border-e-0 lg:even:border-e"
            onClick={() => onNavigate(item.section)}
          >
            <span className="text-soft flex items-center justify-between gap-2 text-xs">
              {item.label}
              <span aria-hidden="true" className="group-hover:text-foreground">
                ↗
              </span>
            </span>
            <span className="mt-3 block text-3xl font-medium tracking-tight tabular-nums">
              {item.count}
            </span>
          </button>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(16rem,1fr)]">
        <section
          aria-labelledby="upcoming-heading"
          className="border-border min-w-0 overflow-hidden rounded-xl border"
        >
          <div className="bg-secondary/30 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 id="upcoming-heading" className="text-base font-medium">
                Upcoming work
              </h2>
              <p className="text-soft mt-1 text-sm">
                {overdue
                  ? `${overdue} overdue · Earliest deadlines first`
                  : "Tasks, deliverables, and decisions in due-date order."}
              </p>
            </div>
            <Button
              variant="secondary"
              className="min-h-11 px-4"
              disabled={!state.canWrite || state.saving}
              onClick={() =>
                edit({
                  entity: "tasks",
                  companyId: project.companyId,
                  projectId: project.id,
                })
              }
            >
              Add task
            </Button>
          </div>
          {upcoming.slice(0, 6).map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              className="group border-border hover:bg-secondary/50 focus-visible:ring-ring flex min-h-20 w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-5 py-4 text-start transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset"
              onClick={() => onNavigate(item.section)}
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="block text-sm break-words">{item.title}</span>
                <span className="text-soft mt-1 block text-xs break-words">
                  {item.kind} · {item.owner}
                </span>
              </span>
              <span
                className={`text-xs tabular-nums ${item.date! < today ? "text-danger" : "text-soft"}`}
              >
                {item.date! < today ? "Overdue · " : "Due "}
                {item.date}
              </span>
              <span
                aria-hidden="true"
                className="text-soft group-hover:text-foreground"
              >
                →
              </span>
            </button>
          ))}
          {!upcoming.length && (
            <div className="border-border border-t px-5 py-10">
              <p className="text-sm">No upcoming deadlines.</p>
              <p className="text-soft mt-2 text-sm">
                Add a task or plan the project’s deliverables to see what needs
                to happen next.
              </p>
              <Button
                variant="link"
                className="mt-3 min-h-11"
                onClick={() => onNavigate("schedule")}
              >
                Plan the schedule →
              </Button>
            </div>
          )}
          {upcoming.length > 6 && (
            <p className="text-soft border-border border-t px-5 py-4 text-xs">
              Showing the next 6 of {upcoming.length} dated items. Open
              Delivery, Decisions, or People for the full lists.
            </p>
          )}
        </section>
        <aside
          className="border-border min-w-0 rounded-xl border p-5"
          aria-labelledby="project-details-heading"
        >
          <h2 id="project-details-heading" className="text-base font-medium">
            Project details
          </h2>
          <div className="border-border mt-5 flex items-center gap-3 border-b pb-5">
            <span
              aria-hidden="true"
              className="border-line-strong bg-muted/40 flex size-10 shrink-0 items-center justify-center rounded-full border text-xs font-medium"
            >
              {project.owner
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")}
            </span>
            <div className="min-w-0">
              <p className="text-soft text-xs">Lead architect</p>
              <p className="mt-1 text-sm break-words">{project.owner}</p>
            </div>
          </div>
          <dl className="space-y-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-soft text-xs">Architectural fee</dt>
              <dd className="text-sm font-medium tabular-nums">
                {money(Number(project.value))}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-soft text-xs">Target handover</dt>
              <dd className="text-sm tabular-nums">
                {project.closeDate || "Not scheduled"}
              </dd>
            </div>
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <dt className="text-soft text-xs">Project progress</dt>
                <dd className="text-sm tabular-nums">{project.probability}%</dd>
              </div>
              <ProjectProgress value={project.probability} />
            </div>
          </dl>
          <details
            className="border-border border-t pt-3"
            open={Boolean(project.brief) || undefined}
          >
            <summary className="focus-visible:ring-ring min-h-11 cursor-pointer rounded-sm py-3 text-sm font-medium focus-visible:ring-2">
              Project brief
            </summary>
            <p className="text-soft mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {project.brief ||
                "Add the scope, client requirements, and design constraints using Edit project."}
            </p>
          </details>
        </aside>
      </div>
    </div>
  );
}
