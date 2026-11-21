import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { matchesCoordinationScope } from "../lib/crm/coordination";

const existing = {
  companyId: "abcdef12-3456-4789-abcd-123456789abc",
  projectId: "fedcba98-7654-4321-abcd-abcdef123456",
};
test("coordination scope comparisons accept uppercase and mixed-case IDs for the existing client and project", () => {
  for (const companyId of [
    existing.companyId,
    existing.companyId.toUpperCase(),
  ]) {
    for (const projectId of [
      existing.projectId,
      existing.projectId.toUpperCase(),
    ])
      assert.equal(
        matchesCoordinationScope(existing, { companyId, projectId }),
        true,
      );
  }
  assert.equal(
    matchesCoordinationScope(existing, {
      companyId: "AbCdEf12-3456-4789-AbCd-123456789aBc",
      projectId: "FeDcBa98-7654-4321-aBcD-AbCdEf123456",
    }),
    true,
  );
});
test("coordination scope comparisons still reject different client or project IDs", () => {
  for (const changed of [
    {
      companyId: crypto.randomUUID(),
      projectId: existing.projectId.toUpperCase(),
    },
    {
      companyId: existing.companyId.toUpperCase(),
      projectId: crypto.randomUUID(),
    },
    { companyId: crypto.randomUUID(), projectId: crypto.randomUUID() },
  ])
    assert.equal(matchesCoordinationScope(existing, changed), false);
});
test("coordination scope IDs are validated before comparison", () => {
  for (const invalid of [
    {},
    { ...existing, companyId: "bad" },
    { ...existing, projectId: "" },
    { ...existing, companyId: null },
    { ...existing, projectId: [existing.projectId] },
  ])
    assert.throws(
      () => matchesCoordinationScope(existing, invalid),
      z.ZodError,
    );
});
