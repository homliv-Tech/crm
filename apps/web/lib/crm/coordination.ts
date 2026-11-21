import { z } from "zod";

export const COORDINATION_ROLES = [
  "Structural engineer",
  "Services consultant",
  "Contractor",
  "Vendor",
] as const;
export const SUBMISSION_STATUSES = [
  "Pending",
  "Submitted",
  "Changes requested",
  "Accepted",
] as const;
const scope = { companyId: z.uuid(), projectId: z.uuid() };
const text = z.string().trim().min(1).max(200);
export const projectPartnerInput = z.object({
  ...scope,
  name: text,
  firm: z.string().trim().max(200).default(""),
  role: z.enum(COORDINATION_ROLES),
  email: z
    .union([z.email({ pattern: z.regexes.html5Email }), z.literal("")])
    .default(""),
  phone: z.string().trim().max(100).default(""),
  responsibilities: z.string().trim().min(1).max(10000),
});
export const projectSubmissionInput = z.object({
  ...scope,
  partnerId: z.uuid(),
  title: text,
  dueDate: z.iso.date().refine((value) => !value.startsWith("0000-"), {
    message: "Use a year from 0001 to 9999.",
  }),
  status: z.enum(SUBMISSION_STATUSES).default("Pending"),
  url: z
    .union([z.url({ protocol: /^https?$/ }).max(4000), z.literal("")])
    .default(""),
  notes: z.string().trim().max(10000).default(""),
});

export const projectSubmissionStatusInput = z.object({
  action: z.literal("changeStatus"),
  id: z.uuid(),
  status: z.enum(SUBMISSION_STATUSES),
});
