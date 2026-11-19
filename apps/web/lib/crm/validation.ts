import { z } from "zod";
import { PROJECT_PHASES } from "./projects";
import { SEGMENTS, STAGES } from "@/data/companies";

const name = z.string().trim().min(1, "A name is required.").max(200);
const owner = z.string().trim().min(1).max(200);
const date = z.iso.date();
const optionalDate = z
  .union([date, z.literal("")])
  .nullable()
  .transform((v) => v || null);
export const companyInput = z
  .object({
    name,
    logo: z
      .string()
      .max(750_000)
      .refine(
        (v) =>
          /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ||
          /^\/assets\/[a-zA-Z0-9/_.-]+$/.test(v),
        "Use a PNG, JPEG, WebP, or GIF logo.",
      )
      .nullish(),
    tags: z.array(z.enum([...SEGMENTS, ...STAGES])).max(11),
    owner,
    website: z
      .union([z.url({ protocol: /^https?$/ }), z.literal("")])
      .default(""),
    description: z.string().trim().max(10000).default(""),
    // Optional initial opportunities are created atomically with the company.
    openDeals: z.number().int().min(0).max(100).default(0),
    pipelineValue: z.number().min(0).max(999999999999).default(0),
    winProbability: z.number().int().min(0).max(100).default(0),
    lastInteraction: z
      .object({ date, label: z.enum(["Note", "Call", "Email", "Meeting"]) })
      .optional(),
  })
  .refine((value) => value.openDeals > 0 || value.pipelineValue === 0, {
    message: "Add at least one active project when setting a fee total.",
    path: ["openDeals"],
  });
export const companyCreateInput = companyInput.refine(
  (value) => value.openDeals > 0 || value.winProbability === 0,
  {
    message: "Add at least one active project when setting initial progress.",
    path: ["openDeals"],
  },
);
const projectReference = z
  .union([z.uuid(), z.literal("")])
  .nullish()
  // Drizzle skips undefined on updates; only explicit empty values unlink projects.
  .transform((v) => (v === "" ? null : v));
export const contactInput = z.object({
  companyId: z.uuid(),
  projectId: projectReference,
  name,
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(100).default(""),
  role: z.string().trim().max(200).default(""),
});
export const dealInput = z.object({
  companyId: z.uuid(),
  title: name,
  value: z.coerce
    .number()
    .min(0)
    .max(999999999999)
    .transform((v) => v.toFixed(2)),
  probability: z.coerce.number().int().min(0).max(100),
  stage: z.enum(PROJECT_PHASES),
  siteAddress: z.string().trim().max(1000).default(""),
  brief: z.string().trim().max(10000).default(""),
  owner,
  closeDate: optionalDate,
});
export const taskInput = z.object({
  companyId: z.uuid(),
  projectId: projectReference,
  title: name,
  owner,
  dueDate: date,
  completed: z.boolean().default(false),
});
export const activityInput = z.object({
  companyId: z.uuid(),
  projectId: projectReference,
  type: z.enum(["Note", "Call", "Email", "Meeting"]),
  body: z.string().trim().min(1).max(10000),
  occurredAt: z.iso
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
});
export const projectFileInput = z.object({
  companyId: z.uuid(),
  projectId: z.uuid(),
  title: name,
  url: z.url({ protocol: /^https?$/ }).max(4000),
});
export const entitySchemas = {
  projectFiles: projectFileInput,
  companies: companyInput,
  contacts: contactInput,
  deals: dealInput,
  tasks: taskInput,
  activities: activityInput,
};
export type Entity = keyof typeof entitySchemas;
