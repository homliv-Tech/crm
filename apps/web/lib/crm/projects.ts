export const PROJECT_PHASES = [
  "Briefing",
  "Concept design",
  "Detailed design",
  "Approvals",
  "Construction",
  "Handover",
  "On hold",
  "Cancelled",
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export function isActiveProject(stage: ProjectPhase) {
  return stage !== "Handover" && stage !== "Cancelled";
}
