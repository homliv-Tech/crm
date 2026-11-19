import { PAYMENT_METHODS, RECEIPT_STATUSES } from "../crm/billing";
import { DECISION_KINDS, DECISION_STATUSES } from "../crm/decisions";
import { PROJECT_PHASES, type DeliveryPhase } from "../crm/projects";
import { sql } from "drizzle-orm";
import {
  pgTable,
  jsonb,
  text,
  integer,
  numeric,
  timestamp,
  date,
  boolean,
  index,
  check,
  pgEnum,
  uuid,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";

export const dealStage = pgEnum("deal_stage", PROJECT_PHASES);
export const activityType = pgEnum("activity_type", [
  "Note",
  "Call",
  "Email",
  "Meeting",
]);
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    logo: text("logo"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    owner: text("owner").notNull(),
    website: text("website").notNull().default(""),
    description: text("description").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("companies_name_idx").on(t.name),
    check("company_name_required", sql`length(trim(${t.name})) > 0`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    role: text("role").notNull().default(""),
    projectId: uuid("project_id").references(() => deals.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("contacts_project_idx").on(t.projectId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "contacts_project_client_fk",
    }),
    index("contacts_company_idx").on(t.companyId),
  ],
);

// The landing site's enquiry UUID is the delivery idempotency key.
export const landingEnquiries = pgTable("landing_enquiries", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  apartmentType: text("apartment_type").notNull(),
  budget: text("budget").notNull(),
  message: text("message").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    value: numeric("value", { precision: 14, scale: 2 }).notNull().default("0"),
    probability: integer("probability").notNull().default(0),
    stage: dealStage("stage").notNull().default("Briefing"),
    owner: text("owner").notNull(),
    closeDate: date("close_date"),
    siteAddress: text("site_address").notNull().default(""),
    brief: text("brief").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    unique("deals_id_company_unique").on(t.id, t.companyId),
    index("deals_company_idx").on(t.companyId),
    index("deals_stage_idx").on(t.stage),
    check("deal_value_positive", sql`${t.value} >= 0`),
    check("deal_probability_range", sql`${t.probability} between 0 and 100`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    owner: text("owner").notNull(),
    dueDate: date("due_date").notNull(),
    completed: boolean("completed").notNull().default(false),
    projectId: uuid("project_id").references(() => deals.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "tasks_project_client_fk",
    }),
    index("tasks_company_idx").on(t.companyId),
    index("tasks_due_idx").on(t.completed, t.dueDate),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: activityType("type").notNull().default("Note"),
    body: text("body").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    projectId: uuid("project_id").references(() => deals.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("activities_project_idx").on(t.projectId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "activities_project_client_fk",
    }),
    index("activities_company_date_idx").on(t.companyId, t.occurredAt),
  ],
);

// The full validated document preserves pricing, terms and client details as quoted.
export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    document: jsonb("document")
      .$type<import("@crm/quotations/quotation").Quotation>()
      .notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("quotations_company_idx").on(t.companyId)],
);

// Secrets are stored as hashes; the short-lived code is exchanged once using PKCE.
export const quotationConnections = pgTable("quotation_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  challenge: text("challenge").notNull(),
  tokenHash: text("token_hash").unique(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  organizationId: text("organization_id").notNull(),
  audience: text("audience").notNull(),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Store document links with the studio's chosen storage provider.
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    ...timestamps,
  },
  (t) => [
    index("project_files_company_idx").on(t.companyId),
    index("project_files_project_idx").on(t.projectId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "project_files_project_client_fk",
    }),
  ],
);

export const decisionKind = pgEnum("decision_kind", DECISION_KINDS);
export const decisionStatus = pgEnum("decision_status", DECISION_STATUSES);

export const projectDecisions = pgTable(
  "project_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: decisionKind("kind").notNull(),
    phase: dealStage("phase").notNull(),
    description: text("description").notNull().default(""),
    decisionMaker: text("decision_maker").notNull(),
    dueDate: date("due_date").notNull(),
    revision: text("revision").notNull(),
    status: decisionStatus("status").notNull().default("Pending"),
    approvedRevision: text("approved_revision").notNull().default(""),
    decisionDate: date("decision_date"),
    decisionNote: text("decision_note").notNull().default(""),
    additionalFee: numeric("additional_fee", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    scheduleImpactDays: integer("schedule_impact_days").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("project_decisions_company_idx").on(t.companyId),
    index("project_decisions_project_idx").on(t.projectId),
    index("project_decisions_due_idx").on(t.status, t.dueDate),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "project_decisions_project_client_fk",
    }),
    check(
      "decision_required_text",
      sql`length(trim(${t.title})) > 0 and length(trim(${t.decisionMaker})) > 0 and length(trim(${t.revision})) > 0`,
    ),
    check(
      "decision_approved_revision",
      sql`(${t.status} = 'Approved' and length(trim(${t.approvedRevision})) > 0) or (${t.status} <> 'Approved' and ${t.approvedRevision} = '')`,
    ),
    check(
      "decision_date_matches_status",
      sql`(${t.status} = 'Pending' and ${t.decisionDate} is null) or (${t.status} <> 'Pending' and ${t.decisionDate} is not null)`,
    ),
    check("decision_fee_nonnegative", sql`${t.additionalFee} >= 0`),
    check(
      "decision_schedule_range",
      sql`${t.scheduleImpactDays} between -3650 and 3650`,
    ),
    check(
      "decision_change_impacts_only",
      sql`${t.kind} = 'Design change' or (${t.additionalFee} = 0 and ${t.scheduleImpactDays} = 0)`,
    ),
  ],
);

export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const receiptStatus = pgEnum("receipt_status", RECEIPT_STATUSES);

export const feeMilestones = pgTable(
  "fee_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    phase: dealStage("phase").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    receivedAmount: numeric("received_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    dueDate: date("due_date").notNull(),
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date"),
    quotationId: uuid("quotation_id").references(() => quotations.id, {
      onDelete: "set null",
    }),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    unique("fee_milestones_identity_unique").on(t.id, t.projectId, t.companyId),
    unique("fee_milestones_invoice_unique").on(t.invoiceNumber),
    index("fee_milestones_company_idx").on(t.companyId),
    index("fee_milestones_project_idx").on(t.projectId),
    index("fee_milestones_quotation_idx").on(t.quotationId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "fee_milestones_project_client_fk",
    }).onDelete("cascade"),
    check("milestone_title_required", sql`length(trim(${t.title})) > 0`),
    check("milestone_amount_positive", sql`${t.amount} > 0`),
    check(
      "milestone_received_range",
      sql`${t.receivedAmount} >= 0 and ${t.receivedAmount} <= ${t.amount}`,
    ),
    check(
      "milestone_invoice_pair",
      sql`(${t.invoiceNumber} is null and ${t.invoiceDate} is null) or (length(trim(${t.invoiceNumber})) > 0 and ${t.invoiceNumber} is not null and ${t.invoiceDate} is not null)`,
    ),
  ],
);

export const paymentReceipts = pgTable(
  "payment_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    projectId: uuid("project_id").notNull(),
    milestoneId: uuid("milestone_id").notNull(),
    receiptNumber: text("receipt_number").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    receivedDate: date("received_date").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: receiptStatus("status").notNull().default("Recorded"),
    voidReason: text("void_reason").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    unique("payment_receipts_number_unique").on(t.projectId, t.receiptNumber),
    index("payment_receipts_company_idx").on(t.companyId),
    index("payment_receipts_project_idx").on(t.projectId),
    index("payment_receipts_milestone_idx").on(t.milestoneId),
    foreignKey({
      columns: [t.milestoneId, t.projectId, t.companyId],
      foreignColumns: [
        feeMilestones.id,
        feeMilestones.projectId,
        feeMilestones.companyId,
      ],
      name: "payment_receipts_milestone_scope_fk",
    }).onDelete("cascade"),
    check("receipt_number_required", sql`length(trim(${t.receiptNumber})) > 0`),
    check("receipt_amount_positive", sql`${t.amount} > 0`),
    check(
      "receipt_void_reason",
      sql`(${t.status} = 'Recorded' and ${t.voidReason} = '') or (${t.status} = 'Voided' and length(trim(${t.voidReason})) > 0)`,
    ),
  ],
);

export const phaseSchedules = pgTable(
  "phase_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    projectId: uuid("project_id").notNull(),
    phase: dealStage("phase").$type<DeliveryPhase>().notNull(),
    plannedStart: date("planned_start"),
    plannedEnd: date("planned_end"),
    actualStart: date("actual_start"),
    actualEnd: date("actual_end"),
    assigneeId: text("assignee_id"),
    assigneeName: text("assignee_name").notNull().default("Unassigned"),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    unique("phase_schedules_project_phase_unique").on(t.projectId, t.phase),
    index("phase_schedules_company_idx").on(t.companyId),
    index("phase_schedules_assignee_idx").on(t.assigneeId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "phase_schedules_project_client_fk",
    }).onDelete("cascade"),
    check(
      "schedule_delivery_phase",
      sql`${t.phase} not in ('On hold', 'Cancelled')`,
    ),
    check(
      "schedule_planned_order",
      sql`${t.plannedStart} is null or ${t.plannedEnd} is null or ${t.plannedEnd} >= ${t.plannedStart}`,
    ),
    check(
      "schedule_actual_order",
      sql`${t.actualEnd} is null or (${t.actualStart} is not null and ${t.actualEnd} >= ${t.actualStart})`,
    ),
  ],
);
export const projectDeliverables = pgTable(
  "project_deliverables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    projectId: uuid("project_id").notNull(),
    phase: dealStage("phase").$type<DeliveryPhase>().notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    dueDate: date("due_date"),
    assigneeId: text("assignee_id"),
    assigneeName: text("assignee_name").notNull().default("Unassigned"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    templateKey: text("template_key"),
    templateItemKey: text("template_item_key"),
    ...timestamps,
  },
  (t) => [
    unique("deliverables_starter_unique").on(
      t.projectId,
      t.templateKey,
      t.templateItemKey,
    ),
    index("deliverables_company_idx").on(t.companyId),
    index("deliverables_project_phase_idx").on(t.projectId, t.phase),
    index("deliverables_due_idx").on(t.completed, t.dueDate),
    index("deliverables_assignee_idx").on(t.assigneeId),
    foreignKey({
      columns: [t.projectId, t.companyId],
      foreignColumns: [deals.id, deals.companyId],
      name: "deliverables_project_client_fk",
    }).onDelete("cascade"),
    check("deliverable_title_required", sql`length(trim(${t.title})) > 0`),
    check(
      "deliverable_delivery_phase",
      sql`${t.phase} not in ('On hold', 'Cancelled')`,
    ),
    check(
      "deliverable_completion_date",
      sql`(${t.completed} and ${t.completedAt} is not null) or (not ${t.completed} and ${t.completedAt} is null)`,
    ),
    check(
      "deliverable_template_pair",
      sql`(${t.templateKey} is null and ${t.templateItemKey} is null) or (${t.templateKey} is not null and ${t.templateItemKey} is not null)`,
    ),
  ],
);
