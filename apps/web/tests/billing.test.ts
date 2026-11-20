import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as tables from "../lib/db/schema";
import type { getDb } from "../lib/db";
import type { FeeMilestone } from "../lib/crm/types";
import {
  feeMilestoneInput,
  paymentReceiptInput,
  feeCents,
  feeMoney,
  receiptAmountDefault,
  milestoneStatus,
  summarizeFees,
} from "../lib/crm/billing";
import { createBillingHandler } from "../lib/crm/billing-handler";
import { createQuotation } from "@crm/quotations/quotation";

const companyId = "abcdef01-2345-4678-9abc-def012345678";
const projectId = "abcdef02-2345-4678-9abc-def012345678";
const milestone = {
  companyId,
  projectId,
  title: "Concept design",
  phase: "Concept design",
  amount: "100.10",
  dueDate: "2026-11-01",
  invoiceNumber: "INV-1",
  invoiceDate: "2026-10-01",
};
function request(
  body: object,
  method = "POST",
  origin = "https://crm.example",
) {
  return new Request("https://crm.example/api/crm/billing", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("new receipt amounts follow milestone changes while existing receipts retain their stored amount", () => {
  const draft = { milestoneId: "advance", amount: "50.00" };
  assert.equal(receiptAmountDefault(draft, "advance", "75.00"), "50.00");
  assert.equal(receiptAmountDefault(draft, "concept", "100.00"), "100.00");
  assert.equal(receiptAmountDefault(draft, "advance", "75.00"), "50.00");
  assert.equal(receiptAmountDefault(draft, "", "0.00"), "0.00");
  assert.equal(receiptAmountDefault({}, "concept", "100.00"), "100.00");
  assert.equal(
    receiptAmountDefault({ ...draft, amount: null }, "advance", "75.00"),
    "75.00",
  );
  const saved = { ...draft, id: "receipt" };
  assert.equal(receiptAmountDefault(saved, "advance", "0.00"), "50.00");
  assert.equal(receiptAmountDefault(saved, "concept", "100.00"), "50.00");
});

test("billing validates money, invoice pairs, and void reasons without losing paise", () => {
  assert.equal(feeMilestoneInput.parse(milestone).amount, "100.10");
  assert.equal(
    feeMilestoneInput.parse({ ...milestone, amount: "0.01" }).amount,
    "0.01",
  );
  assert.equal(
    feeMilestoneInput.parse({ ...milestone, amount: "999999999999.99" }).amount,
    "999999999999.99",
  );
  for (const amount of [
    "0",
    "-1",
    "1.001",
    "1e2",
    "",
    "1000000000000",
    "NaN",
    "Infinity",
  ])
    assert.equal(
      feeMilestoneInput.safeParse({ ...milestone, amount }).success,
      false,
      amount,
    );
  for (const overrides of [
    { invoiceNumber: "" },
    { invoiceDate: "" },
    { dueDate: "2026-02-30" },
    { quotationId: "invalid" },
  ])
    assert.equal(
      feeMilestoneInput.safeParse({ ...milestone, ...overrides }).success,
      false,
    );
  assert.equal(
    feeMilestoneInput.parse({
      ...milestone,
      invoiceNumber: "",
      invoiceDate: "",
    }).invoiceNumber,
    null,
  );
  const receipt = {
    companyId,
    projectId,
    milestoneId: crypto.randomUUID(),
    receiptNumber: "R-1",
    amount: "50.05",
    receivedDate: "2026-11-19",
    method: "UPI",
  };
  assert.equal(paymentReceiptInput.parse(receipt).status, "Recorded");
  assert.equal(
    paymentReceiptInput.safeParse({ ...receipt, status: "Voided" }).success,
    false,
  );
  assert.equal(
    paymentReceiptInput.safeParse({ ...receipt, voidReason: "mistake" })
      .success,
    false,
  );
  assert.equal(
    paymentReceiptInput.safeParse({
      ...receipt,
      status: "Voided",
      voidReason: "Duplicate entry",
    }).success,
    true,
  );
  assert.equal(feeCents("0.10") + feeCents("0.20"), BigInt(30));
  assert.equal(feeMoney(BigInt(12345678)), "₹1,23,456.78");
  assert.equal(feeMoney(-BigInt(1)), "-₹0.01");
});

test("fee summaries distinguish planned fees, invoices, part payments, and overdue balances", () => {
  const base: FeeMilestone = {
    ...feeMilestoneInput.parse(milestone),
    id: "m",
    receivedAmount: "0.00",
  };
  const rows = [
    { ...base, amount: "0.10", invoiceNumber: null, invoiceDate: null },
    { ...base, amount: "0.20", receivedAmount: "0.05" },
    { ...base, amount: "1.00", receivedAmount: "1.00" },
  ];
  assert.equal(milestoneStatus(rows[0], "2026-11-19"), "Planned");
  assert.equal(milestoneStatus(rows[1], "2026-11-19"), "Overdue");
  assert.equal(milestoneStatus(rows[1], "2026-11-01"), "Part paid");
  assert.equal(milestoneStatus(rows[2], "2026-11-19"), "Paid");
  assert.deepEqual(summarizeFees(rows, "2026-11-19"), {
    scheduled: BigInt(130),
    received: BigInt(105),
    outstanding: BigInt(25),
    invoiced: BigInt(120),
    overdue: BigInt(15),
  });
  assert.deepEqual(summarizeFees([], "2026-11-19"), {
    scheduled: BigInt(0),
    received: BigInt(0),
    outstanding: BigInt(0),
    invoiced: BigInt(0),
    overdue: BigInt(0),
  });
});

test("billing rejects viewers, foreign origins, invalid inputs, and receipt deletion", async () => {
  let allowed = false,
    calls = 0;
  const dependencies = {
    authorize: async () =>
      allowed ? {} : Response.json({ error: "Forbidden" }, { status: 403 }),
    getDb: () => {
      calls++;
      throw new Error("Unexpected database access");
    },
  };
  for (const entity of ["feeMilestones", "paymentReceipts"] as const) {
    const mutate = createBillingHandler(dependencies, entity);
    for (const method of ["POST", "PATCH", "DELETE"])
      assert.equal((await mutate(request(milestone, method))).status, 403);
    allowed = true;
    assert.equal(
      (await mutate(request(milestone, "POST", "https://other.example")))
        .status,
      403,
    );
    assert.equal((await mutate(request({}))).status, 400);
    allowed = false;
  }
  allowed = true;
  assert.equal(
    (
      await createBillingHandler(
        dependencies,
        "paymentReceipts",
      )(request({ id: crypto.randomUUID() }, "DELETE"))
    ).status,
    409,
  );
  assert.equal(calls, 0);
});

test("billing ledger serializes payments, supports voids, enforces ownership, and retains receipt history", async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [company, other] = await db
      .insert(tables.companies)
      .values([
        { id: companyId, name: "Homeowner", owner: "Architect" },
        { name: "Other client", owner: "Architect" },
      ])
      .returning();
    const [project, sibling, foreign] = await db
      .insert(tables.deals)
      .values([
        {
          id: projectId,
          companyId: company.id,
          title: "Home",
          owner: "Architect",
          value: "500.00",
          closeDate: "2027-06-01",
        },
        { companyId: company.id, title: "Office", owner: "Architect" },
        { companyId: other.id, title: "Other", owner: "Architect" },
      ])
      .returning();
    const document = createQuotation();
    document.currency = "INR";
    document.status = "Accepted";
    document.crm = { companyId, projectId, contactId: null };
    await db
      .insert(tables.quotations)
      .values({ id: document.id, companyId, document });
    const deps = {
      authorize: async () => ({}),
      getDb: () => db as unknown as ReturnType<typeof getDb>,
    };
    const saveMilestone = createBillingHandler(deps, "feeMilestones"),
      saveReceipt = createBillingHandler(deps, "paymentReceipts");
    const source = { ...milestone, quotationId: document.id };
    assert.equal(
      (await saveMilestone(request({ ...source, projectId: foreign.id })))
        .status,
      400,
    );
    assert.equal(
      (
        await saveMilestone(
          request({ ...source, quotationId: crypto.randomUUID() }),
        )
      ).status,
      400,
    );
    const created = await saveMilestone(request(source));
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    const current = async () =>
      (
        await db
          .select()
          .from(tables.feeMilestones)
          .where(eq(tables.feeMilestones.id, id))
      )[0];
    assert.equal((await current()).receivedAmount, "0.00");
    assert.equal(
      (await saveMilestone(request(source))).status,
      409,
      "invoice numbers are unique",
    );
    assert.equal(
      (
        await saveMilestone(
          request({ ...source, id, projectId: sibling.id }, "PATCH"),
        )
      ).status,
      400,
    );
    const receipt = {
      companyId,
      projectId,
      milestoneId: id,
      receiptNumber: "R-1",
      amount: "30.05",
      receivedDate: "2026-11-19",
      method: "UPI",
    };
    assert.equal(
      (await saveReceipt(request({ ...receipt, projectId: foreign.id })))
        .status,
      400,
    );
    const first = await saveReceipt(request(receipt));
    assert.equal(first.status, 201);
    const receiptId = (await first.json()).id;
    assert.equal((await current()).receivedAmount, "30.05");
    assert.equal(
      (await saveReceipt(request(receipt))).status,
      409,
      "duplicate receipts are rejected",
    );
    const simultaneous = await Promise.all(
      ["R-2", "R-3"].map((receiptNumber) =>
        saveReceipt(request({ ...receipt, receiptNumber, amount: "60.00" })),
      ),
    );
    assert.deepEqual(simultaneous.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await current()).receivedAmount, "90.05");
    assert.equal(
      (await db.select().from(tables.paymentReceipts)).length,
      2,
      "failed overpayments roll back receipt creation",
    );
    assert.equal(
      (
        await saveMilestone(
          request({ ...source, id, amount: "90.00" }, "PATCH"),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await saveReceipt(
          request({ ...receipt, receiptNumber: "R-final", amount: "10.05" }),
        )
      ).status,
      201,
    );
    assert.equal((await current()).receivedAmount, "100.10");
    assert.equal(milestoneStatus(await current(), "2026-11-19"), "Paid");
    assert.equal(
      (
        await saveReceipt(
          request({ ...receipt, id: receiptId, amount: "30.06" }, "PATCH"),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await saveReceipt(
          request(
            {
              ...receipt,
              id: receiptId,
              status: "Voided",
              voidReason: "Duplicate bank entry",
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    assert.equal((await current()).receivedAmount, "70.05");
    assert.equal(
      (await saveReceipt(request({ ...receipt, id: receiptId }, "PATCH")))
        .status,
      200,
    );
    assert.equal((await current()).receivedAmount, "100.10");
    assert.equal(
      (await saveReceipt(request({ id: receiptId }, "DELETE"))).status,
      409,
    );
    assert.equal((await saveMilestone(request({ id }, "DELETE"))).status, 409);
    assert.equal(
      (
        await saveReceipt(
          request(
            { ...receipt, id: receiptId, projectId: sibling.id },
            "PATCH",
          ),
        )
      ).status,
      400,
    );
    const [unchanged] = await db
      .select()
      .from(tables.deals)
      .where(eq(tables.deals.id, project.id));
    assert.equal(unchanged.value, "500.00");
    assert.equal(unchanged.closeDate, "2027-06-01");
    for (const status of ["Draft", "Declined"] as const) {
      await db
        .update(tables.quotations)
        .set({ document: { ...document, status } })
        .where(eq(tables.quotations.id, document.id));
      assert.equal(
        (
          await saveMilestone(
            request({ ...source, invoiceNumber: `INV-${status}` }),
          )
        ).status,
        400,
      );
    }
    // An existing source reference remains usable after the quote's status changes.
    assert.equal(
      (
        await saveMilestone(
          request({ ...source, id, notes: "Historical source" }, "PATCH"),
        )
      ).status,
      200,
    );
    await db
      .update(tables.quotations)
      .set({ document: { ...document, currency: "USD" } })
      .where(eq(tables.quotations.id, document.id));
    assert.equal(
      (await saveMilestone(request({ ...source, invoiceNumber: "INV-USD" })))
        .status,
      400,
    );
    const empty = await saveMilestone(
      request({ ...milestone, invoiceNumber: null, invoiceDate: null }),
    );
    const emptyId = (await empty.json()).id;
    await assert.rejects(
      db
        .update(tables.paymentReceipts)
        .set({ milestoneId: emptyId })
        .where(eq(tables.paymentReceipts.id, receiptId)),
    );
    await assert.rejects(
      db.insert(tables.paymentReceipts).values({
        ...paymentReceiptInput.parse(receipt),
        milestoneId: emptyId,
        projectId: foreign.id,
        receiptNumber: "forged",
      }),
    );
    assert.equal(
      (await saveMilestone(request({ id: emptyId }, "DELETE"))).status,
      200,
    );
    assert.equal(
      (await saveMilestone(request({ id: emptyId }, "DELETE"))).status,
      404,
    );
    await db.delete(tables.deals).where(eq(tables.deals.id, project.id));
    assert.equal((await db.select().from(tables.feeMilestones)).length, 0);
    assert.equal((await db.select().from(tables.paymentReceipts)).length, 0);
    const [cleanup] = await db
      .insert(tables.feeMilestones)
      .values({ ...feeMilestoneInput.parse(milestone), projectId: sibling.id })
      .returning();
    await db.insert(tables.paymentReceipts).values({
      ...paymentReceiptInput.parse(receipt),
      milestoneId: cleanup.id,
      projectId: sibling.id,
    });
    await db
      .delete(tables.companies)
      .where(eq(tables.companies.id, company.id));
    assert.equal((await db.select().from(tables.feeMilestones)).length, 0);
    assert.equal((await db.select().from(tables.paymentReceipts)).length, 0);
  } finally {
    await client.close();
  }
});
