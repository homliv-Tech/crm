import { PROJECT_PHASES } from "../crm/projects";
import { sql } from "drizzle-orm";
import {
  pgTable,
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
    ...timestamps,
  },
  (t) => [index("contacts_company_idx").on(t.companyId)],
);

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
    ...timestamps,
  },
  (t) => [
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
    ...timestamps,
  },
  (t) => [index("activities_company_date_idx").on(t.companyId, t.occurredAt)],
);
