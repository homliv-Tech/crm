import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CrmRequestError,
  crmRequest,
  deleteCrmQuotation,
  openCrmQuotation,
} from "../lib/crm";
import { createQuotation, type Workspace } from "../lib/quotation";

test("CRM deletion accepts successful and already-removed responses while preserving other failures", async (t) => {
  let status = 200;
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json(status === 200 ? { deleted: true } : { error: "CRM error" }, {
      status,
    }),
  );
  const id = crypto.randomUUID();
  await deleteCrmQuotation(crmRequest, id);
  assert.equal(
    fetchMock.mock.calls[0].arguments[0],
    `/api/quotations?id=${id}`,
  );
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.method, "DELETE");
  status = 404;
  await deleteCrmQuotation(crmRequest, id);
  // A missing quotation remains an error outside deletion.
  await assert.rejects(
    crmRequest(`/api/quotations?id=${id}`),
    (error: unknown) =>
      error instanceof CrmRequestError &&
      error.status === 404 &&
      error.message === "CRM error",
  );
  for (status of [401, 403, 409, 500, 503]) {
    await assert.rejects(
      deleteCrmQuotation(crmRequest, id),
      (error: unknown) =>
        error instanceof CrmRequestError && error.status === status,
    );
  }
});

test("connected CRM deletion ignores only typed 404 errors", async () => {
  const id = crypto.randomUUID();
  await deleteCrmQuotation(async () => {
    throw new CrmRequestError("Already removed", 404);
  }, id);
  for (const error of [
    new CrmRequestError("Forbidden", 403),
    new Error("Network unavailable"),
    new Error("404"),
  ]) {
    await assert.rejects(
      deleteCrmQuotation(async () => {
        throw error;
      }, id),
      (received: unknown) => received === error,
    );
  }
});

test("opening CRM quotations selects saved versions and preserves newer local edits", () => {
  const local = createQuotation();
  local.updatedAt = "2026-11-03T10:00:00.000Z";
  local.title = "Unsaved local edits";
  const workspace: Workspace = {
    version: 1,
    activeId: local.id,
    quotes: [local],
  };
  const older = {
    ...local,
    title: "CRM copy",
    updatedAt: "2026-11-02T10:00:00.000Z",
  };
  const preserved = openCrmQuotation(workspace, {
    document: older,
    version: 3,
  });
  assert.equal(preserved.quotes[0].title, "Unsaved local edits");
  const newer = { ...older, updatedAt: "2026-11-04T10:00:00.000Z" };
  const refreshed = openCrmQuotation(workspace, {
    document: newer,
    version: 4,
  });
  assert.equal(refreshed.quotes.length, 1);
  assert.equal(refreshed.quotes[0].title, "CRM copy");
  assert.equal(refreshed.quotes[0].crmVersion, 4);
  const another = createQuotation();
  const opened = openCrmQuotation(workspace, { document: another, version: 2 });
  assert.equal(opened.activeId, another.id);
  assert.equal(opened.quotes.length, 2);
  assert.equal(workspace.quotes.length, 1);
});

test("opening CRM documents respects workspace capacity and validates saved documents", () => {
  const quotes = Array.from({ length: 100 }, () => createQuotation());
  const workspace: Workspace = { version: 1, activeId: quotes[0].id, quotes };
  assert.throws(
    () =>
      openCrmQuotation(workspace, { document: createQuotation(), version: 1 }),
    /Workspace is full/,
  );
  assert.equal(
    openCrmQuotation(workspace, { document: quotes[0], version: 2 }).quotes
      .length,
    100,
  );
  assert.throws(() =>
    openCrmQuotation(workspace, { document: {}, version: 1 }),
  );
});
