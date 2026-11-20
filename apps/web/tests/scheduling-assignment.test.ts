import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureSchedulingEditVersion,
  resolveSchedulingAssignment,
} from "../lib/crm/scheduling-assignment";

const defaults = {
  followPhaseLead: true,
  projectId: "home",
  phase: "Briefing",
  original: { assigneeId: "alice", assigneeName: "Alice" },
  selectedId: null,
  schedules: [
    {
      projectId: "home",
      phase: "Briefing" as const,
      assigneeId: "alice",
      assigneeName: "Alice",
    },
    {
      projectId: "home",
      phase: "Concept design" as const,
      assigneeId: "bob",
      assigneeName: "Bob",
    },
    {
      projectId: "office",
      phase: "Detailed design" as const,
      assigneeId: "carol",
      assigneeName: "Carol",
    },
  ],
};
test("new deliverables follow the selected phase lead, including phases without a lead", () => {
  assert.deepEqual(resolveSchedulingAssignment(defaults), {
    assigneeId: "alice",
    assigneeName: "Alice",
  });
  assert.deepEqual(
    resolveSchedulingAssignment({ ...defaults, phase: "Concept design" }),
    { assigneeId: "bob", assigneeName: "Bob" },
  );
  assert.deepEqual(
    resolveSchedulingAssignment({ ...defaults, phase: "Detailed design" }),
    { assigneeId: "", assigneeName: "" },
  );
  assert.deepEqual(
    resolveSchedulingAssignment({ ...defaults, phase: "Briefing" }),
    { assigneeId: "alice", assigneeName: "Alice" },
  );
});
test("explicit teammate and Unassigned choices survive phase changes", () => {
  for (const selectedId of ["alice", "carol", ""]) {
    for (const phase of ["Briefing", "Concept design", "Detailed design"]) {
      assert.equal(
        resolveSchedulingAssignment({ ...defaults, selectedId, phase })
          .assigneeId,
        selectedId,
      );
    }
  }
});
test("editing an existing assignment keeps its teammate when the phase changes", () => {
  assert.deepEqual(
    resolveSchedulingAssignment({
      ...defaults,
      followPhaseLead: false,
      phase: "Concept design",
    }),
    { assigneeId: "alice", assigneeName: "Alice" },
  );
  assert.equal(
    resolveSchedulingAssignment({
      ...defaults,
      followPhaseLead: false,
      phase: "Concept design",
      original: { assigneeId: "", assigneeName: "Unassigned" },
    }).assigneeId,
    "",
  );
});

test("schedule editors capture the opening version instead of a subsequently refreshed version", () => {
  for (const entity of ["phaseSchedules", "projectDeliverables"]) {
    const record = { id: "record", rowVersion: "41" };
    const captured = captureSchedulingEditVersion(entity, record);
    record.rowVersion = "42";
    assert.equal(captured.rowVersion, "41");
    assert.equal({ ...record, ...captured }.rowVersion, "41");
    assert.equal(captureSchedulingEditVersion(entity, record).rowVersion, "42");
    assert.deepEqual(captureSchedulingEditVersion(entity, {}), {});
  }
  assert.deepEqual(
    captureSchedulingEditVersion("tasks", { id: "task", rowVersion: "41" }),
    {},
  );
});
