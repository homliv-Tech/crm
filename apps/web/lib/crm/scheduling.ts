import { z } from "zod";
import { DELIVERY_PHASES } from "./projects";
import type { PhaseSchedule } from "./types";

export const CHECKLIST_TYPES = [
  "Residential",
  "Interiors",
  "Renovation",
  "Commercial",
] as const;
export type ChecklistType = (typeof CHECKLIST_TYPES)[number];
type StarterItem = {
  key: string;
  phase: (typeof DELIVERY_PHASES)[number];
  title: string;
};
const phases = DELIVERY_PHASES;
function checklist(titles: readonly string[]): StarterItem[] {
  return titles.map((title, index) => ({
    key: `deliverable-${index + 1}`,
    phase: phases[Math.floor(index / 2)],
    title,
  }));
}
export const CHECKLIST_STARTERS: Record<ChecklistType, StarterItem[]> = {
  Residential: checklist([
    "Document the client brief and room requirements",
    "Collect the site survey and site constraints",
    "Prepare the site layout and concept plans",
    "Review massing, elevations, and the initial budget",
    "Complete architectural plans, elevations, and sections",
    "Coordinate structural and building services drawings",
    "Record client sign-off of the submitted design",
    "Prepare applicable submissions and track review comments",
    "Maintain the issued construction drawing register",
    "Record site reviews and resolve construction queries",
    "Close the snag list with the client and contractor",
    "Collect as-built drawings and the handover pack",
  ]),
  Interiors: checklist([
    "Complete the measured survey and existing-services record",
    "Confirm the space brief and furniture requirements",
    "Prepare space plans and furniture layouts",
    "Review mood boards, finishes, and the initial budget",
    "Complete joinery and interior detail drawings",
    "Coordinate lighting, electrical, and services layouts",
    "Record client approval of finishes and material samples",
    "Review shop drawings and vendor submissions",
    "Coordinate installation sequencing with contractors",
    "Inspect joinery, finishes, and site workmanship",
    "Close the interior snag list",
    "Collect warranties, care guides, and final drawings",
  ]),
  Renovation: checklist([
    "Survey existing conditions and record visible defects",
    "Confirm retained, altered, and demolished scope",
    "Compare renovation options and agree the concept",
    "Plan phasing, occupancy, and protection of retained work",
    "Prepare demolition and alteration drawings",
    "Coordinate structural interventions and services changes",
    "Review applicable permissions with the project consultants",
    "Record approval of the renovation scope and revisions",
    "Review demolition findings and record scope changes",
    "Inspect retained-work protection and new construction",
    "Close renovation defects and outstanding work",
    "Update as-built records and the handover information",
  ]),
  Commercial: checklist([
    "Confirm the business brief and operational requirements",
    "Record site, tenancy, and existing-building constraints",
    "Prepare test fits and space-planning options",
    "Review capacity, circulation, and the project budget",
    "Coordinate the architectural technical package",
    "Coordinate specialist, services, and fit-out information",
    "Record client and applicable landlord design sign-offs",
    "Maintain the applicable submissions and approvals register",
    "Resolve contractor RFIs and coordinate site information",
    "Record site inspections and quality observations",
    "Collect testing, commissioning, and close-out records",
    "Close snags and assemble the building handover pack",
  ]),
};
const uuid = z.uuid().transform((v) => v.toLowerCase());
const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .nullish()
  .transform((v) => v || null);
const assignee = z
  .string()
  .trim()
  .max(128)
  .nullish()
  .transform((v) => v || null);
const notes = z.string().trim().max(10000).default("");
export const schedulingPatchVersionInput = z.object({
  rowVersion: z
    .string({ error: "Reload this record before saving." })
    .regex(/^[0-9]{1,10}$/, "Invalid record version."),
});
export const phaseScheduleInput = z
  .object({
    companyId: uuid,
    projectId: uuid,
    phase: z.enum(DELIVERY_PHASES),
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    actualStart: optionalDate,
    actualEnd: optionalDate,
    assigneeId: assignee,
    notes,
  })
  .superRefine((v, ctx) => {
    if (v.plannedStart && v.plannedEnd && v.plannedEnd < v.plannedStart)
      ctx.addIssue({
        code: "custom",
        path: ["plannedEnd"],
        message: "Planned finish cannot be before planned start.",
      });
    if (v.actualEnd && (!v.actualStart || v.actualEnd < v.actualStart))
      ctx.addIssue({
        code: "custom",
        path: ["actualEnd"],
        message: "Record an actual start on or before the actual finish.",
      });
  });
export const projectDeliverableInput = z.object({
  companyId: uuid,
  projectId: uuid,
  phase: z.enum(DELIVERY_PHASES),
  title: z.string().trim().min(1).max(200),
  notes,
  assigneeId: assignee,
  dueDate: optionalDate,
  completed: z.boolean().default(false),
});
export const applyChecklistInput = z.object({
  action: z.literal("applyTemplate"),
  companyId: uuid,
  projectId: uuid,
  templateKey: z.enum(CHECKLIST_TYPES),
  assigneeId: assignee,
});
export function phaseScheduleStatus(
  schedule: Pick<
    PhaseSchedule,
    "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd"
  >,
  today: string,
) {
  if (schedule.actualEnd) return "Completed";
  if (schedule.plannedEnd && schedule.plannedEnd < today) return "Overdue";
  if (schedule.actualStart) return "In progress";
  return schedule.plannedStart || schedule.plannedEnd
    ? "Planned"
    : "Not planned";
}
export function calendarDaysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000,
  );
}
