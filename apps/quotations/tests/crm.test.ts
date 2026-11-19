import assert from "node:assert/strict";
import { test } from "node:test";
import { clientPatch, createClientQuote, type CrmData } from "../lib/crm";
import {
  createQuotation,
  createRevision,
  quotationSchema,
} from "../lib/quotation";

const companyId = crypto.randomUUID();
const data: CrmData = {
  companies: [
    { id: companyId, name: "Studio client", description: "Client context" },
  ],
  contacts: [],
  deals: [],
  role: "member",
};
test("client selection clears previous recipient details without inventing contact or billing data", () => {
  const q = createQuotation();
  q.to = {
    name: "Old client",
    email: "old@example.com",
    phone: "123",
    address: "Old billing address",
    taxId: "OLD",
  };
  const selected = quotationSchema.parse({
    ...q,
    ...clientPatch(data, companyId),
  });
  assert.deepEqual(selected.to, {
    name: "Studio client",
    email: "",
    phone: "",
    address: "",
    taxId: "",
  });
  assert.deepEqual(selected.crm, {
    companyId,
    contactId: null,
    projectId: null,
  });
  assert.equal(selected.clientType, "Company");
  assert.deepEqual(clientPatch(data, ""), { crm: null });
});
test("old backups remain valid and revisions keep the client link with a fresh save version", () => {
  const q = createQuotation();
  const { crm, crmVersion, ...legacy } = q;
  assert.equal(crm, null);
  assert.equal(crmVersion, 0);
  assert.equal(quotationSchema.parse(legacy).crm, null);
  assert.equal(quotationSchema.parse(legacy).crmVersion, 0);
  q.crm = { companyId, projectId: null, contactId: null };
  q.crmVersion = 4;
  q.from.name = "Firm";
  q.to.name = "Client";
  q.items[0] = { ...q.items[0], name: "Design", rate: "100" };
  const revision = createRevision(q, [q]);
  assert.deepEqual(revision.crm, q.crm);
  assert.equal(revision.crmVersion, 0);
  assert.notEqual(revision.id, q.id);
});

test("project entry creates a separate prefilled draft and respects ownership and capacity", () => {
  const existing = createQuotation();
  const workspace = {
    version: 1 as const,
    activeId: existing.id,
    quotes: [existing],
  };
  const project = {
    id: crypto.randomUUID(),
    companyId,
    title: "Courtyard home",
    siteAddress: "14 Garden Road",
    brief: "Retain courtyard",
  };
  const snapshot = {
    ...data,
    deals: [
      project,
      { ...project, id: "foreign-project", companyId: "other-client" },
    ],
  };
  const next = createClientQuote(workspace, snapshot, companyId, project.id);
  assert.equal(next.quotes.length, 2);
  assert.equal(next.quotes[1], existing);
  assert.notEqual(next.activeId, existing.id);
  assert.equal(next.quotes[0].crm?.projectId, project.id);
  assert.equal(next.quotes[0].title, project.title);
  assert.equal(next.quotes[0].siteAddress, project.siteAddress);
  assert.equal(next.quotes[0].scope, project.brief);
  assert.equal(
    createClientQuote(workspace, snapshot, companyId, "foreign-project")
      .quotes[0].crm?.projectId,
    null,
  );
  const full = {
    ...workspace,
    quotes: Array.from({ length: 100 }, () => createQuotation()),
  };
  assert.equal(createClientQuote(full, snapshot, companyId, project.id), full);
  assert.equal(
    createClientQuote(workspace, snapshot, "missing", project.id),
    workspace,
  );
});
