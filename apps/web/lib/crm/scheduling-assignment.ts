import type { PhaseSchedule } from "./types";

type Assignment = { assigneeId?: string | null; assigneeName?: string | null };
export function resolveSchedulingAssignment({
  followPhaseLead,
  projectId,
  phase,
  original,
  selectedId,
  schedules,
}: {
  followPhaseLead: boolean;
  projectId: string;
  phase: string;
  original: Assignment;
  // null follows the default; an empty string is an explicit Unassigned choice.
  selectedId: string | null;
  schedules: Pick<
    PhaseSchedule,
    "projectId" | "phase" | "assigneeId" | "assigneeName"
  >[];
}) {
  const fallback = followPhaseLead
    ? schedules.find((s) => s.projectId === projectId && s.phase === phase)
    : original;
  const assigneeId = selectedId ?? fallback?.assigneeId ?? "";
  return {
    assigneeId,
    assigneeName:
      assigneeId === fallback?.assigneeId ? (fallback.assigneeName ?? "") : "",
  };
}

// Capture primitive version data once, alongside the form's initial field values.
export function captureSchedulingEditVersion(
  entity: string,
  record: { id?: unknown; rowVersion?: unknown },
) {
  return record.id &&
    (entity === "phaseSchedules" || entity === "projectDeliverables")
    ? { rowVersion: record.rowVersion }
    : {};
}
