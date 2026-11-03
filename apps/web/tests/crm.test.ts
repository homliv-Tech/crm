import { test } from "node:test";
import assert from "node:assert/strict";
import {
  companyInput,
  contactInput,
  dealInput,
  taskInput,
} from "../lib/crm/validation";
import { summarizeCompanies } from "../lib/crm/summaries";
import { filterCompanies, DEFAULT_FILTERS } from "../lib/companies";
import type { Deal, Activity } from "../lib/crm/types";
import { splitOpportunityValues } from "../lib/crm/money";

const companyId = "64ae6ce3-ec75-4b16-bb68-32e5cfc4b321";
test("initial opportunity values preserve cents when split or represented as binary floats", () => {
  assert.deepEqual(splitOpportunityValues(0.29, 1), ["0.29"]);
  assert.deepEqual(splitOpportunityValues(100.01, 3), [
    "33.34",
    "33.34",
    "33.33",
  ]);
  assert.deepEqual(splitOpportunityValues(0.01, 3), ["0.01", "0.00", "0.00"]);
  assert.deepEqual(splitOpportunityValues(0, 0), []);
});
test("server validation rejects unsafe URLs, invalid records, and out-of-range money", () => {
  const company = {
    name: "Acme",
    tags: ["Residential"],
    owner: "Sarah Nguyen",
  };
  assert.equal(companyInput.safeParse(company).success, true);
  assert.equal(
    companyInput.safeParse({ ...company, name: " " }).success,
    false,
  );
  assert.equal(
    companyInput.safeParse({ ...company, website: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal(
    companyInput.safeParse({
      ...company,
      logo: "data:image/svg+xml;base64,PHN2Zz4=",
    }).success,
    false,
  );
  assert.equal(
    contactInput.safeParse({ companyId, name: "Jane", email: "bad-address" })
      .success,
    false,
  );
  const deal = {
    companyId,
    title: "Consultation",
    value: "125.25",
    probability: "60",
    stage: "Concept design",
    owner: "Sarah",
    closeDate: "",
  };
  assert.equal(dealInput.parse(deal).value, "125.25");
  assert.equal(dealInput.parse(deal).closeDate, null);
  assert.equal(
    dealInput.safeParse({ ...deal, probability: 101 }).success,
    false,
  );
  assert.equal(dealInput.safeParse({ ...deal, value: -1 }).success, false);
  assert.equal(
    dealInput.safeParse({ ...deal, stage: "unknown" }).success,
    false,
  );
  assert.equal(
    taskInput.safeParse({
      companyId,
      title: "Follow up",
      owner: "Sarah",
      dueDate: "2026-02-30",
    }).success,
    false,
  );
});
test("client totals exclude handed-over and cancelled projects and weight progress by fees", () => {
  const company = {
    id: companyId,
    name: "Acme",
    tags: ["Residential"],
    logo: null,
    owner: "Sarah",
    website: "",
    description: "",
  };
  const base = {
    id: "d",
    companyId,
    title: "Deal",
    owner: "Sarah",
    closeDate: null,
    siteAddress: "",
    brief: "",
  };
  const deals: Deal[] = [
    { ...base, value: "100.25", probability: 20, stage: "Briefing" },
    { ...base, value: "300.75", probability: 80, stage: "Detailed design" },
    { ...base, value: "9999", probability: 100, stage: "Handover" },
    { ...base, value: "9999", probability: 0, stage: "Cancelled" },
  ];
  const now = new Date("2026-11-01T12:00:00Z");
  const activity: Activity = {
    id: "a",
    companyId,
    type: "Call",
    body: "Called buyer",
    occurredAt: "2026-10-31T12:00:00Z",
  };
  const [result] = summarizeCompanies([company], deals, [activity], now);
  assert.equal(result.pipelineValue, 401);
  assert.equal(result.openDeals, 2);
  assert.equal(result.winProbability, 65);
  assert.equal(result.activityDays, 1);
  assert.equal(
    result.trend.reduce((a, b) => a + b, 0),
    1,
  );
  assert.equal(result.lastInteraction.label, "Call");
  const [empty] = summarizeCompanies([company], [], [], now);
  assert.equal(empty.pipelineValue, 0);
  assert.equal(empty.winProbability, 0);
  assert.equal(empty.lastInteraction.date, "");
  assert.equal(filterCompanies([empty], DEFAULT_FILTERS).length, 1);
  assert.equal(
    filterCompanies([empty], { ...DEFAULT_FILTERS, activityWindow: 7 }).length,
    0,
  );
});

test("projects validate architectural phases, site details, and progress", async () => {
  const { PROJECT_PHASES, isActiveProject } =
    await import("../lib/crm/projects");
  const project = {
    companyId,
    title: "Courtyard house",
    value: "12500.50",
    probability: 35,
    owner: "Architect",
    closeDate: "2026-12-01",
    siteAddress: "14 Garden Road",
    brief: "Retain the existing courtyard.",
  };
  for (const stage of PROJECT_PHASES) {
    const parsed = dealInput.parse({ ...project, stage });
    assert.equal(parsed.stage, stage);
    assert.equal(parsed.siteAddress, project.siteAddress);
    assert.equal(parsed.brief, project.brief);
  }
  assert.equal(isActiveProject("On hold"), true);
  assert.equal(isActiveProject("Handover"), false);
  assert.equal(isActiveProject("Cancelled"), false);
  for (const stage of ["Discovery", "Won", "Lost"]) {
    assert.equal(dealInput.safeParse({ ...project, stage }).success, false);
  }
  assert.equal(
    dealInput.safeParse({ ...project, stage: "Briefing", probability: -1 })
      .success,
    false,
  );
  assert.equal(
    dealInput.safeParse({
      ...project,
      stage: "Briefing",
      siteAddress: "x".repeat(1001),
    }).success,
    false,
  );
});
