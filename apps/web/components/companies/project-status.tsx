import type { ProjectPhase } from "@/lib/crm/projects";

export function ProjectPhaseBadge({ phase }: { phase: ProjectPhase }) {
  const tone =
    phase === "Cancelled"
      ? "text-danger"
      : phase === "On hold"
        ? "text-warning"
        : phase === "Handover"
          ? "text-success"
          : "text-foreground";
  return (
    <span
      className={`border-line-strong bg-background inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${tone}`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-current"
      />
      <span>{phase}</span>
    </span>
  );
}

export function ProjectProgress({
  value,
  label = "Project progress",
}: {
  value: number;
  label?: string;
}) {
  return (
    <progress
      aria-label={label}
      value={value}
      max={100}
      className="bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-soft [&::-moz-progress-bar]:bg-soft block h-1 w-full overflow-hidden rounded-full [&::-webkit-progress-value]:rounded-full"
    />
  );
}
