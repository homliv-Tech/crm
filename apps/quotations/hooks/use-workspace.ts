"use client";

import { useEffect, useRef, useState } from "react";
import {
  createQuotation,
  parseWorkspace,
  STORAGE_KEY,
  type Workspace,
} from "../lib/quotation";

function downloadFile(content: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useWorkspace(onImport: () => void) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [saveState, setSaveState] = useState("Loading drafts…");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setWorkspace(parseWorkspace(stored));
          lastSaved.current = stored;
          setSaveState("Saved in this browser");
        } else {
          const quote = createQuotation();
          setWorkspace({ version: 1, activeId: quote.id, quotes: [quote] });
        }
      } catch {
        setBlocked(true);
        setSaveState("Draft saving unavailable");
        setMessage(
          "Saved drafts could not be opened. Existing storage has been preserved. Download a backup or import a valid backup to recover. You can still edit and export PDFs.",
        );
        const quote = createQuotation();
        setWorkspace({ version: 1, activeId: quote.id, quotes: [quote] });
      }
    });
    const onStorage = (event: StorageEvent) => {
      if (
        (event.key === STORAGE_KEY || event.key === null) &&
        event.newValue !== lastSaved.current
      ) {
        setBlocked(true);
        setSaveState("Saving paused");
        setMessage(
          "Drafts changed in another tab. Export a backup of this tab's edits before reloading to use the latest version.",
        );
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!workspace || blocked) return;
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSaved.current) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== lastSaved.current) {
        queueMicrotask(() => {
          setBlocked(true);
          setSaveState("Saving paused");
          setMessage(
            "Drafts changed in another tab. Export a backup of this tab's edits before reloading to use the latest version.",
          );
        });
        return;
      }
      localStorage.setItem(STORAGE_KEY, serialized);
      lastSaved.current = serialized;
      queueMicrotask(() => setSaveState("Saved in this browser"));
    } catch {
      queueMicrotask(() => {
        setSaveState("Not saved — export a backup");
        setMessage(
          "Browser storage is full or unavailable. Export a backup to keep your edits, or remove a large logo and try again.",
        );
      });
    }
  }, [workspace, blocked]);

  async function importBackup(file?: File) {
    if (!file) return;
    let imported: Workspace;
    try {
      if (file.size > 75000000)
        throw new Error("Backup is too large (maximum 75 MB).");
      imported = parseWorkspace(await file.text());
    } catch {
      setMessage(
        "Could not import the backup. Choose a valid Quotient JSON backup under 75 MB. Your existing drafts are unchanged.",
      );
      return;
    }
    if (
      !window.confirm(
        `Replace this workspace with ${imported.quotes.length} imported quotation(s)? Export your current backup first if needed.`,
      )
    )
      return;
    const serialized = JSON.stringify(imported);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      setMessage(
        "Could not import the backup because browser storage is full or unavailable. Free up browser storage or try another browser profile. Your existing drafts are unchanged.",
      );
      return;
    }
    lastSaved.current = serialized;
    setWorkspace(imported);
    setBlocked(false);
    onImport();
    setSaveState("Saved in this browser");
    setMessage("Backup imported successfully.");
  }

  function backup() {
    downloadFile(
      JSON.stringify(workspace, null, 2),
      `quotient-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    if (blocked) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) downloadFile(stored, "quotient-original-storage.json");
      } catch {
        setMessage(
          "Current edits were exported. Original browser storage could not be read.",
        );
      }
    }
  }
  return {
    workspace,
    setWorkspace,
    saveState,
    message,
    setMessage,
    importBackup,
    backup,
  };
}
