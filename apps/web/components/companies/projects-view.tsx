"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { useCompaniesStore } from "@/stores/companies-store";
import { PROJECT_PHASES, type ProjectPhase } from "@/lib/crm/projects";
import { trackProjectMoveFocus } from "@/lib/crm/project-move-focus";
import { activateProjectLink, projectHref } from "@/lib/crm/project-navigation";
import { money } from "@/lib/crm/format";
import { ProjectPhaseBadge, ProjectProgress } from "./project-status";
import { useCrmEditor, selectClass } from "./crm-editor";

export default function ProjectsView() {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("");
  const [phase, setPhase] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const draggedId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropPhase, setDropPhase] = useState<ProjectPhase | null>(null);
  const [moveMessage, setMoveMessage] = useState("");
  const phaseFilter = useRef<HTMLSelectElement>(null);
  const phaseControls = useRef(new Map<string, HTMLSelectElement>());
  const projectControls = useRef(new Map<string, HTMLAnchorElement>());
  const moveFocus = useRef<{
    projectId: string;
    tracker: ReturnType<typeof trackProjectMoveFocus>;
    settled: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const pending = moveFocus.current;
    if (pending && !pending.tracker.reconcile(!pending.settled))
      moveFocus.current = null;
  });
  useEffect(() => () => moveFocus.current?.tracker.cancel(), []);
  const canDrag = state.canWrite && !state.saving;
  function endDrag() {
    draggedId.current = null;
    setDragging(null);
    setDropPhase(null);
  }
  async function moveProject(id: string, stage: ProjectPhase) {
    const focusAttempt = moveFocus.current;
    try {
      const current = useCompaniesStore.getState();
      const project = current.deals.find((p) => p.id === id);
      if (
        !project ||
        !current.canWrite ||
        current.saving ||
        current.projectPhaseSaves[id]
      ) {
        setMoveMessage(
          "Move cancelled. The project is unavailable or editing is disabled.",
        );
        return;
      }
      if (project.stage === stage) {
        setMoveMessage(`${project.title} is already in ${stage}.`);
        return;
      }
      setMoveMessage(`Moving ${project.title} to ${stage}…`);
      const saved = await current.changeProjectPhase(id, stage);
      setMoveMessage(
        saved
          ? `${project.title} moved to ${stage}.`
          : `Could not confirm the move for ${project.title}. Refresh the board and try again.`,
      );
    } finally {
      if (focusAttempt?.projectId === id && moveFocus.current === focusAttempt)
        focusAttempt.settled = true;
    }
  }

  function dragOver(event: DragEvent<HTMLElement>, stage: ProjectPhase) {
    if (!draggedId.current || !canDrag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropPhase(stage);
  }
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
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              All projects
            </h1>
            <p className="text-soft mt-2 text-sm">
              Your studio’s work, from first brief to handover.
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
        <div className="border-border bg-secondary/40 mb-5 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_minmax(10rem,13rem)_minmax(10rem,13rem)_auto]">
          <label className="text-soft flex min-w-0 flex-col gap-2 text-xs">
            Search projects
            <Input
              className="h-11 text-base sm:text-sm"
              placeholder="Project, client, site, or architect…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="text-soft flex min-w-0 flex-col gap-2 text-xs">
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
          <label className="text-soft flex min-w-0 flex-col gap-2 text-xs">
            Phase
            <select
              ref={phaseFilter}
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
            className="border-line-strong bg-background flex gap-1 self-end rounded-lg border p-1"
            role="group"
            aria-label="Project view"
          >
            {(["list", "board"] as const).map((v) => (
              <Button
                key={v}
                variant="ghost"
                className={`min-h-9 flex-1 rounded-md px-4 capitalize ${view === v ? "bg-muted text-foreground" : "text-soft"}`}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-soft text-sm">
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
          <div className="border-border overflow-hidden rounded-xl border">
            <div
              className="text-soft border-border hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-5 border-b px-5 py-3 text-xs lg:grid"
              aria-hidden="true"
            >
              <span>Project / client</span>
              <span>Phase</span>
              <span>Lead architect</span>
              <span className="text-end">Fee / handover</span>
            </div>
            {projects.map((p) => (
              <a
                key={p.id}
                href={projectHref(p.id)}
                onClick={(event) =>
                  activateProjectLink(event, p.id, state.openProject)
                }
                className="group border-border hover:bg-secondary focus-visible:ring-ring grid w-full gap-4 border-b px-5 py-5 text-start transition-colors duration-150 last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-5"
              >
                <span className="min-w-0">
                  <span className="text-foreground block text-[15px] font-medium break-words">
                    {p.title}
                    <span
                      aria-hidden="true"
                      className="text-soft group-hover:text-foreground ms-2 inline-block"
                    >
                      ↗
                    </span>
                  </span>
                  <span className="text-soft mt-1 block text-xs break-words">
                    {clientName(p.companyId)}
                    {p.siteAddress ? ` · ${p.siteAddress}` : ""}
                  </span>
                </span>
                <span className="min-w-0">
                  <ProjectPhaseBadge phase={p.stage} />
                  <span className="mt-3 block max-w-36">
                    <ProjectProgress
                      value={p.probability}
                      label={`Progress for ${p.title}`}
                    />
                    <span className="text-soft mt-1.5 block text-xs tabular-nums">
                      {p.probability}% complete
                    </span>
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
              </a>
            ))}
          </div>
        ) : (
          <>
            <p className="text-soft mb-3 text-xs">
              {state.canWrite
                ? "Drag a project to another phase, or use its phase menu."
                : "Projects grouped by phase."}{" "}
              Scroll horizontally for more phases →
            </p>
            <p
              role="status"
              aria-live="polite"
              className="text-soft mb-3 text-sm"
            >
              {moveMessage}
            </p>
            <div
              onDragOver={(event) => {
                if (!draggedId.current || !canDrag) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX < bounds.left + 56)
                  event.currentTarget.scrollLeft -= 36;
                else if (event.clientX > bounds.right - 56)
                  event.currentTarget.scrollLeft += 36;
              }}
              role="region"
              aria-label="Projects by phase"
              tabIndex={0}
              className="focus-visible:ring-ring overflow-x-auto pb-4 focus-visible:ring-2"
            >
              <div className="grid auto-cols-[minmax(16rem,18rem)] grid-flow-col gap-4">
                {PROJECT_PHASES.map((stage) => (
                  <section
                    key={stage}
                    onDragOver={(event) => dragOver(event, stage)}
                    onDragEnter={(event) => dragOver(event, stage)}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      )
                        setDropPhase((active) =>
                          active === stage ? null : active,
                        );
                    }}
                    onDrop={(event) => {
                      const id = draggedId.current;
                      if (!id || !canDrag) return;
                      event.preventDefault();
                      endDrag();
                      void moveProject(id, stage);
                    }}
                    aria-label={`${stage} phase`}
                    className={`min-h-72 rounded-xl border p-4 transition-colors duration-150 ${dropPhase === stage ? "border-ring bg-muted/70 ring-ring ring-1" : "border-border bg-secondary/30"}`}
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
                          draggable={canDrag && !state.projectPhaseSaves[p.id]}
                          aria-busy={Boolean(state.projectPhaseSaves[p.id])}
                          onDragStart={(event) => {
                            if (!canDrag || state.projectPhaseSaves[p.id]) {
                              event.preventDefault();
                              return;
                            }
                            draggedId.current = p.id;
                            setDragging(p.id);
                            setMoveMessage(
                              `Moving ${p.title}. Drop it in a phase column.`,
                            );
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", p.id);
                          }}
                          onDragEnd={() => {
                            if (draggedId.current)
                              setMoveMessage("Move cancelled.");
                            endDrag();
                          }}
                          className={`border-line-strong bg-background mb-3 rounded-lg border p-4 ${canDrag && !state.projectPhaseSaves[p.id] ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === p.id ? "opacity-40" : ""}`}
                        >
                          <a
                            href={projectHref(p.id)}
                            draggable={false}
                            ref={(element) => {
                              if (element)
                                projectControls.current.set(p.id, element);
                              else projectControls.current.delete(p.id);
                            }}
                            className="focus-visible:ring-ring inline-flex min-h-11 items-center text-start text-sm font-medium break-words hover:underline focus-visible:ring-2"
                            onClick={(event) => {
                              if (draggedId.current) {
                                event.preventDefault();
                                return;
                              }
                              activateProjectLink(
                                event,
                                p.id,
                                state.openProject,
                              );
                            }}
                          >
                            {p.title} →
                          </a>
                          <p className="text-soft mt-1 text-xs break-words">
                            {clientName(p.companyId)} · {p.owner}
                          </p>
                          <p className="my-3 text-sm">
                            {money(Number(p.value))}
                          </p>
                          {state.projectPhaseSaves[p.id] && (
                            <p role="status" className="text-soft mb-2 text-xs">
                              Saving phase…
                            </p>
                          )}
                          <select
                            ref={(element) => {
                              if (element)
                                phaseControls.current.set(p.id, element);
                              else phaseControls.current.delete(p.id);
                            }}
                            aria-label={`Project phase for ${p.title}`}
                            className={`${selectClass} h-11`}
                            disabled={
                              state.saving ||
                              !state.canWrite ||
                              Boolean(state.projectPhaseSaves[p.id])
                            }
                            value={p.stage}
                            onDragStart={(event) => event.preventDefault()}
                            onChange={(e) => {
                              moveFocus.current?.tracker.cancel();
                              moveFocus.current = {
                                projectId: p.id,
                                settled: false,
                                tracker: trackProjectMoveFocus(
                                  e.currentTarget,
                                  () => ({
                                    phase: phaseControls.current.get(p.id),
                                    open: projectControls.current.get(p.id),
                                    fallback: phaseFilter.current,
                                  }),
                                ),
                              };
                              void moveProject(
                                p.id,
                                e.target.value as ProjectPhase,
                              );
                            }}
                          >
                            {PROJECT_PHASES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </article>
                      ))}
                    {!projects.some((p) => p.stage === stage) && (
                      <p className="text-soft py-4 text-xs">
                        {dragging
                          ? "Drop project here"
                          : "No projects in this phase."}
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
