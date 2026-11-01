import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, validSession } from "../lib/session";
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
test("sessions reject forgery, expiration, password rotation, and malformed tokens", () => {
  const now = Date.now();
  const session = signSession("test-key", now + 1000);
  assert.equal(validSession(session, "test-key", now), true);
  assert.equal(validSession(session + "x", "test-key", now), false);
  assert.equal(validSession(session, "different-key", now), false);
  assert.equal(validSession(session, "test-key", now + 1001), false);
  assert.equal(validSession(undefined, "test-key", now), false);
  assert.equal(validSession(`Infinity.fake`, "test-key", now), false);
});
test("server validation rejects unsafe URLs, invalid records, and out-of-range money", () => {
  const company = { name: "Acme", tags: ["SMB"], owner: "Sarah Nguyen" };
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
    title: "Pilot",
    value: "125.25",
    probability: "60",
    stage: "Qualified",
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
test("company totals exclude closed deals and weight probability by deal value", () => {
  const company = {
    id: companyId,
    name: "Acme",
    tags: ["SMB"],
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
  };
  const deals: Deal[] = [
    { ...base, value: "100.25", probability: 20, stage: "Discovery" },
    { ...base, value: "300.75", probability: 80, stage: "Proposal" },
    { ...base, value: "9999", probability: 100, stage: "Won" },
    { ...base, value: "9999", probability: 0, stage: "Lost" },
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
