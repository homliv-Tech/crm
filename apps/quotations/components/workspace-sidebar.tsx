import { useRef, useState } from "react";
import type { Workspace } from "@/lib/quotation";
import Button from "./button";

type Props = {
  workspace: Workspace;
  onAddQuote: () => void;
  onSelectQuote: (id: string) => void;
  backup: () => void;
  importBackup: (file?: File) => Promise<void>;
};

export default function WorkspaceSidebar({
  workspace,
  onAddQuote,
  onSelectQuote,
  backup,
  importBackup,
}: Props) {
  const [query, setQuery] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const visibleQuotes = workspace.quotes.filter((q) =>
    `${q.number} ${q.to.name} ${q.title}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <aside className="no-print border-b border-stone-200 bg-[#fbfcfa] p-5 lg:min-h-[calc(100vh-80px)] lg:border-r lg:border-b-0">
      <Button
        variant="secondary"
        className="w-full justify-between lg:hidden"
        aria-expanded={workspaceOpen}
        aria-controls="saved-workspace"
        onClick={() => setWorkspaceOpen(!workspaceOpen)}
      >
        Saved quotations ({workspace.quotes.length}){" "}
        <span aria-hidden="true">{workspaceOpen ? "−" : "+"}</span>
      </Button>
      <div
        id="saved-workspace"
        className={`${workspaceOpen ? "mt-5 block" : "hidden"} lg:mt-0 lg:block`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
            Your workspace
          </span>
          <span className="text-xs text-stone-500">
            {workspace.quotes.length}/100
          </span>
        </div>
        <Button variant="primary" className="mt-5 w-full" onClick={onAddQuote}>
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>{" "}
          New quotation
        </Button>
        <label className="mt-5 block">
          <span className="sr-only">Search quotations</span>
          <input
            type="search"
            value={query}
            placeholder="Search quotations…"
            onChange={(e) => setQuery(e.target.value)}
            className="bg-white text-base sm:text-xs"
          />
        </label>
        <nav
          aria-label="Saved quotations"
          className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-420px)]"
        >
          {visibleQuotes.length ? (
            visibleQuotes.map((q) => (
              <Button
                key={q.id}
                variant="ghost"
                aria-current={q.id === workspace.activeId ? "page" : undefined}
                onClick={() => {
                  onSelectQuote(q.id);
                  setWorkspaceOpen(false);
                }}
                className={`w-full justify-start p-3 text-left whitespace-normal ${q.id === workspace.activeId ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-transparent"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-semibold break-all">
                      {q.number || "Unnumbered"}
                    </span>
                    <span className="text-[10px] font-normal text-stone-600">
                      {q.status}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] font-normal break-words text-stone-600">
                    {q.to.name || "No client yet"}
                  </span>
                </span>
              </Button>
            ))
          ) : (
            <div className="px-3 py-5">
              <p className="text-stone-600">No quotations match “{query}”.</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => setQuery("")}
              >
                Clear search
              </Button>
            </div>
          )}
        </nav>
        <div className="mt-8 space-y-2 border-t border-stone-200 pt-5">
          <Button
            variant="ghost"
            className="w-full justify-start text-xs"
            onClick={backup}
          >
            ↓ Export workspace backup
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-xs"
            onClick={() => importInput.current?.click()}
          >
            ↑ Import backup
          </Button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import workspace backup"
            onChange={(e) => {
              void importBackup(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="px-3 pt-2 text-xs text-stone-500">
            Drafts stay in this browser. Export a backup before clearing browser
            data or moving devices.
          </p>
        </div>
      </div>
    </aside>
  );
}
