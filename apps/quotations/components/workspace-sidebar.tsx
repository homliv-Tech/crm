import { useRef, useState, type ReactNode } from "react";
import type { Workspace } from "../lib/quotation";
import Button from "./button";

type Props = {
  settings: ReactNode;
  workspace: Workspace;
  onAddQuote: () => void;
  onSelectQuote: (id: string) => void;
  backup: () => void;
  importBackup: (file?: File) => Promise<void>;
};
export default function WorkspaceSidebar({
  settings,
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
    <aside className="quote-sidebar no-print" aria-label="Quotation workspace">
      <button
        className="quote-mobile-menu"
        type="button"
        aria-expanded={workspaceOpen}
        aria-controls="saved-workspace"
        onClick={() => setWorkspaceOpen(!workspaceOpen)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M4 6h16M4 12h16M4 18h16" /></svg> Workspace & settings{" "}
        <span aria-hidden="true">{workspaceOpen ? "−" : "+"}</span>
      </button>
      <div
        id="saved-workspace"
        className={`quote-workspace-content ${workspaceOpen ? "is-open" : ""}`}
      >
        <div className="quote-sidebar-top">
          <span>Quotations</span>
          <Button
            variant="secondary"
            onClick={onAddQuote}
            aria-label="New quotation"
          >
            + New
          </Button>
        </div>
        <label className="quote-search">
          <span className="sr-only">Search quotations</span>
          <input
            type="search"
            value={query}
            placeholder="Find a quotation…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <nav aria-label="Saved quotations" className="quote-draft-list">
          {visibleQuotes.length ? (
            visibleQuotes.map((q) => (
              <button
                type="button"
                key={q.id}
                aria-current={q.id === workspace.activeId ? "page" : undefined}
                onClick={() => {
                  onSelectQuote(q.id);
                  setWorkspaceOpen(false);
                }}
              >
                <span className="quote-draft-heading">
                  <span>{q.number || "Unnumbered"}</span>
                  <span>{q.status}</span>
                </span>
                <span className="quote-draft-client">
                  {q.to.name || "No client yet"}
                </span>
                {q.title && (
                  <span className="quote-draft-project">{q.title}</span>
                )}
              </button>
            ))
          ) : (
            <div className="quote-search-empty">
              <p>No matching quotations.</p>
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </nav>
        <div className="quote-sidebar-utilities">
          <details className="quote-settings">
            <summary>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 17h16M9 4v6M15 14v6" />
              </svg>
              <span>Settings</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="quote-settings-body">{settings}</div>
          </details>
          <details className="quote-settings">
            <summary>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M4 16v4h16v-4M12 4v11m-4-4 4 4 4-4" />
              </svg>
              <span>Backup & restore</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="quote-settings-body">
              <Button variant="secondary" className="w-full" onClick={backup}>
                Export workspace
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => importInput.current?.click()}
              >
                Import backup
              </Button>
              <p>
                Export a backup before clearing browser data or moving devices.
              </p>
            </div>
          </details>
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
          <p className="quote-sidebar-note">
            Private drafts, saved on this device.
          </p>
        </div>
      </div>
    </aside>
  );
}
