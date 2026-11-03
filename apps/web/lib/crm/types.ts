import type { ProjectPhase } from "./projects";
import type { Company } from "@/data/companies";

export type CrmCompany = Company & { website: string; description: string };
export type Contact = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};
export type Deal = {
  id: string;
  companyId: string;
  title: string;
  value: string;
  probability: number;
  stage: ProjectPhase;
  siteAddress: string;
  brief: string;
  owner: string;
  closeDate: string | null;
};
export type Task = {
  id: string;
  companyId: string;
  title: string;
  owner: string;
  dueDate: string;
  completed: boolean;
};
export type Activity = {
  id: string;
  companyId: string;
  type: "Note" | "Call" | "Email" | "Meeting";
  body: string;
  occurredAt: string;
};
export type CrmSnapshot = {
  companies: CrmCompany[];
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  activities: Activity[];
};
