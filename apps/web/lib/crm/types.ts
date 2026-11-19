import type { ProjectPhase } from "./projects";
import type { Company } from "@/data/companies";

export type CrmCompany = Company & { website: string; description: string };
export type Contact = {
  projectId?: string | null;
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
  projectId?: string | null;
  id: string;
  companyId: string;
  title: string;
  owner: string;
  dueDate: string;
  completed: boolean;
};
export type Activity = {
  projectId?: string | null;
  id: string;
  companyId: string;
  type: "Note" | "Call" | "Email" | "Meeting";
  body: string;
  occurredAt: string;
};
export type ProjectFile = {
  id: string;
  companyId: string;
  projectId: string;
  title: string;
  url: string;
};
export type ProjectDecision = {
  id: string;
  companyId: string;
  projectId: string;
  title: string;
  kind: (typeof import("./decisions").DECISION_KINDS)[number];
  phase: ProjectPhase;
  description: string;
  decisionMaker: string;
  dueDate: string;
  revision: string;
  status: (typeof import("./decisions").DECISION_STATUSES)[number];
  approvedRevision: string;
  decisionDate: string | null;
  decisionNote: string;
  additionalFee: string;
  scheduleImpactDays: number;
};
export type FeeMilestone = {
  id: string;
  companyId: string;
  projectId: string;
  title: string;
  phase: ProjectPhase;
  amount: string;
  receivedAmount: string;
  dueDate: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  quotationId: string | null;
  notes: string;
};
export type PaymentReceipt = {
  id: string;
  companyId: string;
  projectId: string;
  milestoneId: string;
  receiptNumber: string;
  amount: string;
  receivedDate: string;
  method: (typeof import("./billing").PAYMENT_METHODS)[number];
  reference: string;
  notes: string;
  status: (typeof import("./billing").RECEIPT_STATUSES)[number];
  voidReason: string;
};
export type CrmSnapshot = {
  feeMilestones: FeeMilestone[];
  paymentReceipts: PaymentReceipt[];
  projectDecisions: ProjectDecision[];
  projectFiles: ProjectFile[];
  companies: CrmCompany[];
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  activities: Activity[];
};
