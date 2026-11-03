import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const origin = new URL(base).origin;
const authOnly = process.argv.includes("--auth-only");
let cookie = "";
let companyId = "";
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  expected = 200,
  authenticated = true,
  requestOrigin = origin,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      Origin: requestOrigin,
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: expected ${expected}, got ${response.status}`,
  );
  return response;
}
async function json(
  path: string,
  method = "GET",
  data?: unknown,
  expected = 200,
) {
  return (await call(path, method, data, expected)).json();
}
async function main() {
  await call("/api/crm", "GET", undefined, 401, false);
  await call("/api/auth/access", "GET", undefined, 401, false);
  await call("/api/crm/export", "POST", {}, 401, false);
  await call("/api/crm/companies", "POST", {}, 401, false);
  await call("/api/admin/users", "GET", undefined, 401, false);
  await call("/api/auth", "POST", { password: "retired-password" }, 410, false);
  if (!process.env.TEST_COOKIE_FILE) {
    assert.ok(
      authOnly,
      "Set TEST_COOKIE_FILE to a private file containing an admin/member WorkOS Cookie header, or use --auth-only.",
    );
    console.log("Unauthenticated WorkOS access checks passed.");
    return;
  }
  cookie = readFileSync(process.env.TEST_COOKIE_FILE, "utf8").trim();
  await call("/", "GET", undefined, 200);
  await call("/api/crm/unknown", "POST", {}, 404);
  await call(
    "/api/crm/companies",
    "POST",
    {},
    403,
    true,
    "https://other-origin.example",
  );
  await call("/api/crm/companies", "POST", { name: " " }, 400);
  await call("/api/crm/tasks", "DELETE", { id: "not-a-uuid" }, 400);
  if (!authOnly) {
    const account = {
      name: `Integration test ${crypto.randomUUID()}`,
      owner: "Integration runner",
      tags: ["Residential", "Consultation"],
      openDeals: 3,
      pipelineValue: 0.29,
      lastInteraction: {
        date: new Date().toISOString().slice(0, 10),
        label: "Meeting",
      },
      winProbability: 40,
    };
    const created = await json("/api/crm/companies", "POST", account, 201);
    companyId = created.id;
    assert.ok(companyId);
    const snapshot = await json("/api/crm");
    const company = snapshot.companies.find(
      (c: { id: string }) => c.id === companyId,
    );
    assert.equal(company.openDeals, 3);
    assert.ok(Math.abs(company.pipelineValue - 0.29) < 0.001);
    await json("/api/crm/companies", "PATCH", {
      ...account,
      id: companyId,
      name: `${account.name} updated`,
      website: "https://example.com",
    });
    const contact = {
      companyId,
      name: "Test buyer",
      email: "buyer@example.com",
      role: "Buyer",
    };
    const { id: contactId } = await json(
      "/api/crm/contacts",
      "POST",
      contact,
      201,
    );
    await json("/api/crm/contacts", "PATCH", {
      ...contact,
      id: contactId,
      name: "Updated buyer",
    });
    const deal = {
      companyId,
      title: "Test opportunity",
      value: "2500.25",
      probability: 75,
      stage: "Detailed design",
      owner: "Integration runner",
      closeDate: "2026-12-15",
    };
    const { id: dealId } = await json("/api/crm/deals", "POST", deal, 201);
    await json("/api/crm/deals", "PATCH", {
      ...deal,
      id: dealId,
      stage: "Handover",
    });
    const task = {
      companyId,
      title: "Test follow up",
      owner: "Integration runner",
      dueDate: "2026-12-01",
      completed: false,
    };
    const { id: taskId } = await json("/api/crm/tasks", "POST", task, 201);
    await json("/api/crm/tasks", "PATCH", {
      ...task,
      id: taskId,
      completed: true,
    });
    const activity = {
      companyId,
      type: "Call",
      body: "Discussed requirements",
    };
    const { id: activityId } = await json(
      "/api/crm/activities",
      "POST",
      activity,
      201,
    );
    await json("/api/crm/activities", "PATCH", {
      ...activity,
      id: activityId,
      body: "Updated requirements",
    });
    const saved = await json("/api/crm");
    assert.equal(
      saved.contacts.find((c: { id: string }) => c.id === contactId).name,
      "Updated buyer",
    );
    assert.equal(
      saved.tasks.find((t: { id: string }) => t.id === taskId).completed,
      true,
    );
    assert.equal(
      saved.deals.find((d: { id: string }) => d.id === dealId).stage,
      "Handover",
    );
    assert.equal(
      saved.activities.find((a: { id: string }) => a.id === activityId).body,
      "Updated requirements",
    );
    assert.equal(
      saved.companies.find((c: { id: string }) => c.id === companyId)
        .lastInteraction.label,
      "Call",
    );
    await call(
      "/api/crm/contacts",
      "POST",
      { ...contact, companyId: crypto.randomUUID() },
      409,
    );
    await json("/api/crm/contacts", "DELETE", { id: contactId });
    await call("/api/crm/contacts", "DELETE", { id: contactId }, 404);
    await json("/api/crm/companies", "DELETE", { id: companyId });
    const cleaned = await json("/api/crm");
    assert.ok(
      !cleaned.companies.some((c: { id: string }) => c.id === companyId),
    );
    for (const entity of ["contacts", "deals", "tasks", "activities"])
      assert.ok(
        !cleaned[entity].some(
          (r: { companyId: string }) => r.companyId === companyId,
        ),
      );
    companyId = "";
  }
  console.log(
    authOnly
      ? "Authentication and API validation checks passed."
      : "Authentication, validation, CRM CRUD, persistence, and cascade checks passed.",
  );
}
main()
  .catch(() => {
    console.error(
      "Integration checks failed. Check server output, credentials, and the writable database connection.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (companyId) {
      try {
        await json("/api/crm/companies", "DELETE", { id: companyId });
      } catch {
        console.error(
          `Test account cleanup failed; remove account ${companyId} after reconnecting.`,
        );
      }
    }
  });
