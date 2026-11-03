import assert from "node:assert/strict";
import { test } from "node:test";
import { clientPatch, type CrmData } from "../lib/crm";
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
