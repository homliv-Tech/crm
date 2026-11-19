"use client";

import { useEffect, useState } from "react";
import type { Teammate } from "@/lib/crm/team";

export default function TeammatePicker({
  value,
  onChange,
  inputClass,
  previousName,
  label = "Responsible teammate",
}: {
  value: string;
  onChange: (value: string) => void;
  inputClass: string;
  previousName?: string;
  label?: string;
}) {
  const [team, setTeam] = useState<Teammate[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/crm/team", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error();
        if (controller.signal.aborted) return;
        setTeam(data.team);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [retry]);
  return (
    <div className="min-w-0">
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        {label}
        <select
          name="assigneeId"
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Unassigned</option>
          {value && !team.some((t) => t.id === value) && (
            <option value={value}>
              {previousName || "Current assignment"}
            </option>
          )}
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.email !== t.name ? ` · ${t.email}` : ""}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <span role="status" className="text-subtle text-xs">
          Could not load teammates. Keep the current assignment or leave
          unassigned.{" "}
          <button
            type="button"
            className="underline"
            onClick={(e) => {
              e.preventDefault();
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        </span>
      )}
    </div>
  );
}
