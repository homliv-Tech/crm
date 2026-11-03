import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createQuotation,
  parseWorkspace,
  STORAGE_KEY,
  type Workspace,
} from "../lib/quotation";
import {
  resetQuotationCrmVersion,
  resetStoredQuotationCrmVersion,
} from "../lib/workspace";

test("CRM deletion resets the saved browser draft version without changing its contents", () => {
  const quote = {
    ...createQuotation(),
    crmVersion: 4,
    title: "Unsaved local changes",
  };
  const other = { ...createQuotation(), crmVersion: 7 };
  const workspace: Workspace = {
    version: 1,
    activeId: quote.id,
    quotes: [quote, other],
    templates: [quote.items[0]],
  };
  const expected = resetQuotationCrmVersion(workspace, quote.id);
  assert.deepEqual(expected, {
    ...workspace,
    quotes: [{ ...quote, crmVersion: 0 }, other],
  });
  assert.equal(workspace.quotes[0].crmVersion, 4);
  assert.equal(expected.quotes[1], other);

  const values = new Map([
    [STORAGE_KEY, JSON.stringify(workspace)],
    ["other-app", "preserved"],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  resetStoredQuotationCrmVersion(storage, quote.id);
  assert.deepEqual(
    parseWorkspace(values.get(STORAGE_KEY)!),
    parseWorkspace(JSON.stringify(expected)),
  );
  assert.equal(values.get("other-app"), "preserved");
});

test("missing and already-reset drafts do not rewrite browser storage", () => {
  const quote = createQuotation();
  const workspace: Workspace = {
    version: 1,
    activeId: quote.id,
    quotes: [quote],
  };
  assert.equal(resetQuotationCrmVersion(workspace, quote.id), workspace);
  assert.equal(resetQuotationCrmVersion(workspace, "missing"), workspace);
  for (const stored of [null, JSON.stringify(workspace)]) {
    const storage = {
      getItem: () => stored,
      setItem: () => {
        assert.fail("Unexpected storage write");
      },
    };
    resetStoredQuotationCrmVersion(storage, quote.id);
    resetStoredQuotationCrmVersion(storage, "missing");
  }
});

test("invalid or unavailable storage is preserved and reports failure", () => {
  for (const stored of ["invalid JSON", '{"version":1,"quotes":[]}']) {
    assert.throws(() =>
      resetStoredQuotationCrmVersion(
        {
          getItem: () => stored,
          setItem: () => {
            assert.fail("Invalid storage must not be overwritten");
          },
        },
        "quote",
      ),
    );
  }
  const quote = { ...createQuotation(), crmVersion: 2 };
  const stored = JSON.stringify({
    version: 1,
    activeId: quote.id,
    quotes: [quote],
  });
  const failure = new Error("Storage unavailable");
  assert.throws(
    () =>
      resetStoredQuotationCrmVersion(
        {
          getItem: () => stored,
          setItem: () => {
            throw failure;
          },
        },
        quote.id,
      ),
    (error: unknown) => error === failure,
  );
});
