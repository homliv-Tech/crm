export const DELIVERY_PHASES = [
  "Briefing",
  "Concept design",
  "Detailed design",
  "Approvals",
  "Construction",
  "Handover",
] as const;

export const PROJECT_PHASES = [
  ...DELIVERY_PHASES,
  "On hold",
  "Cancelled",
] as const;

export type DeliveryPhase = (typeof DELIVERY_PHASES)[number];
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export function isActiveProject(stage: ProjectPhase) {
  return stage !== "Handover" && stage !== "Cancelled";
}
