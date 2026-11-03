"use client";

import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import { money } from "@/lib/crm/format";
import { isActiveProject, PROJECT_PHASES } from "@/lib/crm/projects";
import { useCrmEditor } from "./crm-editor";

export function Forecast() {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const open = state.deals.filter((d) => isActiveProject(d.stage));
  const fees = open.reduce((v, d) => v + Number(d.value), 0);
  const today = new Date().toISOString().slice(0, 10);
  const tasks = state.tasks.filter((t) => !t.completed);
  const deadlines = open
    .filter((d) => d.closeDate)
    .sort((a, b) => a.closeDate!.localeCompare(b.closeDate!));
  const clientName = (id: string) =>
    state.companies.find((c) => c.id === id)?.name ?? "Unknown client";

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
      <p className="text-subtle mb-6 text-sm">
        Keep client relationships, design work, and upcoming handovers in view.
        Fees are the total architectural fees for active projects, including
        projects on hold.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Clients", state.companies.length],
          ["Active projects", open.length],
          ["Active project fees", money(fees)],
          ["Overdue tasks", tasks.filter((t) => t.dueDate < today).length],
        ].map(([label, value]) => (
          <div className="border-border rounded-xl border p-5" key={label}>
            <p className="text-subtle mb-3 text-sm">{label}</p>
            <p className="text-2xl font-medium tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="border-border mt-6 rounded-xl border p-5">
        <h2 className="mb-5 text-base">Projects by phase</h2>
        <div className="flex flex-wrap gap-3">
          {PROJECT_PHASES.map((phase) => (
            <div
              key={phase}
              className="bg-muted/30 min-w-36 flex-1 rounded-lg p-3"
            >
              <p className="text-subtle text-sm">{phase}</p>
              <p className="mt-2 text-xl tabular-nums">
                {state.deals.filter((d) => d.stage === phase).length}
              </p>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="mt-5"
          onClick={() => state.setActiveTab("deals")}
        >
          View projects
        </Button>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="border-border rounded-xl border p-5">
          <h2 className="mb-4 text-base">Target handovers</h2>
          <div className="divide-border divide-y">
            {deadlines.slice(0, 6).map((project) => (
              <div key={project.id} className="py-3">
                <Button
                  variant="subtle"
                  disabled={!state.canWrite}
                  onClick={() =>
                    edit({ entity: "deals", record: { ...project } })
                  }
                >
                  {project.title}
                </Button>
                <p className="text-subtle mt-1 text-xs">
                  {clientName(project.companyId)} · {project.stage}
                </p>
                <p
                  className={`mt-2 text-xs ${project.closeDate! < today ? "text-red-400" : "text-subtle"}`}
                >
                  {project.closeDate! < today ? "Overdue · " : ""}
                  {project.closeDate}
                </p>
              </div>
            ))}
          </div>
          {!deadlines.length && (
            <p className="text-subtle text-sm">
              Set a target handover date on a project to see it here.
            </p>
          )}
        </section>
        <section className="border-border rounded-xl border p-5">
          <h2 className="mb-4 text-base">Tasks needing attention</h2>
          <div className="divide-border divide-y">
            {[...tasks]
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .slice(0, 6)
              .map((task) => (
                <div key={task.id} className="py-3">
                  <Button
                    variant="subtle"
                    disabled={!state.canWrite}
                    onClick={() =>
                      edit({ entity: "tasks", record: { ...task } })
                    }
                  >
                    {task.title}
                  </Button>
                  <p className="text-subtle mt-1 text-xs">
                    {clientName(task.companyId)} · {task.owner}
                  </p>
                  <p
                    className={`mt-2 text-xs ${task.dueDate < today ? "text-red-400" : "text-subtle"}`}
                  >
                    Due {task.dueDate}
                  </p>
                </div>
              ))}
          </div>
          {!tasks.length && (
            <p className="text-subtle text-sm">
              No outstanding tasks. Add a task to track a drawing review, site
              visit, or client decision.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
