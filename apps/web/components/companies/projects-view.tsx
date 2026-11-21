"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { useCompaniesStore } from "@/stores/companies-store";
import { PROJECT_PHASES } from "@/lib/crm/projects";
import { money } from "@/lib/crm/format";
import { useCrmEditor, selectClass } from "./crm-editor";

export default function ProjectsView() {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("");
  const [phase, setPhase] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const clientName = (id: string) =>
    state.companies.find((c) => c.id === id)?.name ?? "Unknown client";
  const projects = state.deals.filter(
    (p) =>
      (!client || p.companyId === client) &&
      (!phase || p.stage === phase) &&
      `${p.title} ${clientName(p.companyId)} ${p.siteAddress} ${p.owner}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium">Projects</h1>
            <p className="text-soft mt-2 text-sm">
              Open a project to review deadlines, decisions, and delivery.
            </p>
          </div>
          <Button
            variant="primary"
            className="min-h-11 px-4"
            disabled={
              !state.companies.length || state.saving || !state.canWrite
            }
            onClick={() =>
              edit({ entity: "deals", companyId: client || undefined })
            }
          >
            New project
          </Button>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_minmax(10rem,14rem)_minmax(10rem,14rem)_auto]">
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Search projects
            <Input
              className="h-11 text-base sm:text-sm"
              placeholder="Project, client, site, or architect…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Client
            <select
              className={`${selectClass} h-11 text-base sm:text-sm`}
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">All clients</option>
              {state.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Phase
            <select
              className={`${selectClass} h-11 text-base sm:text-sm`}
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
            >
              <option value="">All phases</option>
              {PROJECT_PHASES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div
            className="flex items-end gap-1"
            role="group"
            aria-label="Project view"
          >
            {(["list", "board"] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? "muted" : "ghost"}
                className="min-h-11 px-4 capitalize"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-soft text-sm">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
            {search || client || phase ? ` of ${state.deals.length}` : ""}
          </p>
          {(search || client || phase) && (
            <Button
              variant="ghost"
              className="min-h-11 px-3"
              onClick={() => {
                setSearch("");
                setClient("");
                setPhase("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        {!projects.length ? (
          <div className="border-border rounded-lg border p-6">
            <h2 className="text-base font-medium">
              {state.deals.length
                ? "No matching projects"
                : "Your projects will appear here"}
            </h2>
            <p className="text-soft mt-2 text-sm">
              {state.deals.length
                ? "Try a different search, client, or phase, or clear the filters."
                : state.companies.length
                  ? "Create a project to start planning its delivery."
                  : "Add a client first, then create their project."}
            </p>
          </div>
        ) : view === "list" ? (
          <div>
            <div
              className="text-soft border-border hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-5 border-b px-3 py-3 text-xs lg:grid"
              aria-hidden="true"
            >
              <span>Project / client</span>
              <span>Phase</span>
              <span>Lead architect</span>
              <span className="text-end">Fee / handover</span>
            </div>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => state.openProject(p.id)}
                className="border-border hover:bg-muted/30 focus-visible:ring-ring grid w-full gap-3 border-b p-3 text-start focus-visible:ring-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium break-words">
                    {p.title}
                  </span>
                  <span className="text-soft mt-1 block text-xs break-words">
                    {clientName(p.companyId)}
                    {p.siteAddress ? ` · ${p.siteAddress}` : ""}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">{p.stage}</span>
                  <span className="text-soft mt-1 block text-xs">
                    {p.probability}% complete
                  </span>
                </span>
                <span className="text-soft text-sm break-words">{p.owner}</span>
                <span className="min-w-0 lg:text-end">
                  <span className="block text-sm tabular-nums">
                    {money(Number(p.value))}
                  </span>
                  <span className="text-soft mt-1 block text-xs">
                    {p.closeDate
                      ? `Handover ${p.closeDate}`
                      : "Handover not scheduled"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="text-soft mb-3 text-xs">
              Projects grouped by phase. Scroll horizontally to see more phases
              →
            </p>
            <div
              role="region"
              aria-label="Projects by phase"
              tabIndex={0}
              className="focus-visible:ring-ring overflow-x-auto pb-4 focus-visible:ring-2"
            >
              <div className="grid auto-cols-[minmax(16rem,18rem)] grid-flow-col gap-4">
                {PROJECT_PHASES.filter((s) => !phase || s === phase).map(
                  (stage) => (
                    <section
                      key={stage}
                      className="border-border rounded-lg border p-3"
                    >
                      <h2 className="mb-4 flex items-center justify-between gap-3 text-sm font-medium">
                        {stage}
                        <span className="text-soft tabular-nums">
                          {projects.filter((p) => p.stage === stage).length}
                        </span>
                      </h2>
                      {projects
                        .filter((p) => p.stage === stage)
                        .map((p) => (
                          <article
                            key={p.id}
                            className="border-border mb-3 rounded-md border p-3"
                          >
                            <button
                              className="focus-visible:ring-ring min-h-11 text-start text-sm font-medium break-words hover:underline focus-visible:ring-2"
                              onClick={() => state.openProject(p.id)}
                            >
                              {p.title} →
                            </button>
                            <p className="text-soft mt-1 text-xs break-words">
                              {clientName(p.companyId)} · {p.owner}
                            </p>
                            <p className="my-3 text-sm">
                              {money(Number(p.value))}
                            </p>
                            <select
                              aria-label={`Project phase for ${p.title}`}
                              className={`${selectClass} h-11`}
                              disabled={state.saving || !state.canWrite}
                              value={p.stage}
                              onChange={(e) =>
                                void state.mutate("deals", "PATCH", {
                                  ...p,
                                  stage: e.target.value,
                                })
                              }
                            >
                              {PROJECT_PHASES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </article>
                        ))}
                      {!projects.some((p) => p.stage === stage) && (
                        <p className="text-soft py-4 text-xs">
                          No projects in this phase.
                        </p>
                      )}
                    </section>
                  ),
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
