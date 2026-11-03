import assert from "node:assert/strict";
import { test } from "node:test";
import { createCrmMutationRunner } from "../lib/crm-mutations";
import { createQuotation, type Workspace } from "../lib/quotation";
import { resetQuotationCrmVersion } from "../lib/workspace";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a pending save blocks deletion until its version update is applied", async () => {
  const quote = { ...createQuotation(), crmVersion: 1 };
  let workspace: Workspace = {
    version: 1,
    activeId: quote.id,
    quotes: [quote],
  };
  const states: boolean[] = [];
  const runMutation = createCrmMutationRunner((busy) => states.push(busy));
  const response = deferred();
  let deletes = 0;
  const remove = () =>
    runMutation(async () => {
      deletes++;
      workspace = resetQuotationCrmVersion(workspace, quote.id);
    });
  const save = runMutation(async () => {
    await response.promise;
    workspace = {
      ...workspace,
      quotes: workspace.quotes.map((q) => ({ ...q, crmVersion: 2 })),
    };
  });
  await remove();
  assert.equal(deletes, 0);
  assert.deepEqual(states, [true]);
  response.resolve();
  await save;
  assert.equal(workspace.quotes[0].crmVersion, 2);
  await remove();
  assert.equal(deletes, 1);
  assert.equal(workspace.quotes[0].crmVersion, 0);
  assert.deepEqual(states, [true, false, true, false]);
});

test("a pending deletion blocks saves and allows recreation only after its reset", async () => {
  let version = 4;
  const runMutation = createCrmMutationRunner(() => {});
  const response = deferred();
  const saves: number[] = [];
  const save = () =>
    runMutation(async () => {
      saves.push(version);
    });
  const removal = runMutation(async () => {
    await response.promise;
    version = 0;
  });
  await save();
  assert.deepEqual(saves, []);
  response.resolve();
  await removal;
  await save();
  assert.deepEqual(saves, [0]);
});

test("a failed mutation releases the guard and restores the controls for retry", async () => {
  const states: boolean[] = [];
  const runMutation = createCrmMutationRunner((busy) => states.push(busy));
  const error = new Error("CRM unavailable");
  await assert.rejects(
    runMutation(async () => {
      throw error;
    }),
    (received: unknown) => received === error,
  );
  let retried = false;
  await runMutation(async () => {
    retried = true;
  });
  assert.equal(retried, true);
  assert.deepEqual(states, [true, false, true, false]);
});
