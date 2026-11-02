import assert from "node:assert/strict";

import { test } from "node:test";
import Decimal from "decimal.js";
import {
  calculate,
  createQuotation,
  exportErrors,
  newItem,
  money,
  parseWorkspace,
  quotationSchema,
} from "../lib/quotation";
import { getQuotationPdf, downloadPdf } from "../lib/pdf";
import { registerQuotationFonts } from "../components/quotation-pdf";

registerQuotationFonts(new URL("../public/fonts", import.meta.url).pathname);

function validQuote() {
  const q = createQuotation([], new Date("2026-11-02T12:00:00Z"));
  q.from.name = "Acme Studio";
  q.to.name = "Client & Co.";
  q.items = [
    { ...newItem(), name: "Design", quantity: "2", rate: "100.10", tax: "18" },
  ];
  return q;
}

test("decimal pricing applies discount before item tax and adds untaxed charges", () => {
  const q = validQuote();
  q.discount = "10";
  q.shipping = "12.50";
  const result = calculate(q);
  assert.equal(result.subtotal, "200.20");
  assert.equal(result.discount, "20.02");
  assert.equal(result.tax, "32.43");
  assert.equal(result.total, "225.11");
});

test("rounds each line and tax half up, handles fractional quantity and zero rates", () => {
  const q = validQuote();
  q.items = [{ ...q.items[0], quantity: "0.5", rate: "0.01", tax: "50" }];
  assert.equal(calculate(q).subtotal, "0.01");
  assert.equal(calculate(q).tax, "0.01");
  assert.equal(calculate(q).total, "0.02");
  q.items[0].rate = "0";
  assert.equal(calculate(q).total, "0.00");
  assert.deepEqual(exportErrors(q), []);
});

test("fixed discounts are capped and all discount cents are allocated across mixed tax rates", () => {
  const q = validQuote();
  q.items = Array.from({ length: 100 }, (_, i) => ({
    ...newItem(),
    name: `Item ${i}`,
    quantity: "1",
    rate: "0.01",
    tax: i % 2 ? "18" : "0",
  }));
  q.discountType = "fixed";
  q.discount = "0.49";
  const result = calculate(q);
  assert.equal(
    result.rows
      .reduce((sum, row) => sum.add(row.discount), new Decimal(0))
      .toFixed(2),
    "0.49",
  );
  assert.equal(result.total, "0.51");
  assert.ok(result.rows.every((row) => Number(row.total) >= 0));
  q.discount = "999";
  assert.equal(calculate(q).total, "0.00");
  q.items.forEach((item) => {
    item.rate = "0";
  });
  assert.equal(calculate(q).discount, "0.00");
});

test("mixed tax rates use proportionally allocated discount", () => {
  const q = validQuote();
  q.items = [
    { ...newItem(), name: "A", quantity: "1", rate: "100", tax: "10" },
    { ...newItem(), name: "B", quantity: "1", rate: "200", tax: "20" },
  ];
  q.discountType = "fixed";
  q.discount = "30";
  assert.deepEqual(
    calculate(q).rows.map((r) => [r.discount, r.tax]),
    [
      ["10.00", "9.00"],
      ["20.00", "36.00"],
    ],
  );
  assert.equal(calculate(q).total, "315.00");
});

test("required fields, zero quantity, invalid dates and emails block PDF export", () => {
  const q = createQuotation();
  assert.equal(exportErrors(q).length, 3);
  const valid = validQuote();
  valid.validUntil = "2026-10-01";
  valid.to.email = "broken";
  valid.items[0].quantity = "0";
  assert.equal(exportErrors(valid).length, 3);
  assert.equal(
    quotationSchema.safeParse({ ...valid, discount: "101" }).success,
    false,
  );
  assert.equal(
    quotationSchema.safeParse({ ...valid, shipping: "-1" }).success,
    false,
  );
  assert.equal(
    quotationSchema.safeParse({ ...valid, currency: "INVALID" }).success,
    false,
  );
});

test("new quotations use unique numbers, local calendar dates, and 30 day validity", () => {
  const first = validQuote();
  const next = createQuotation([first], new Date(2026, 11, 20, 23));
  assert.equal(next.number, "QT-0002");
  assert.equal(next.issued, "2026-12-20");
  assert.equal(next.validUntil, "2027-01-19");
  assert.notEqual(next.id, first.id);
  assert.equal(
    quotationSchema.safeParse({
      ...first,
      items: [first.items[0], first.items[0]],
    }).success,
    false,
  );
});

test("backup round trips and rejects corrupted, ambiguous, unsafe, and unknown-version storage", () => {
  const q = validQuote();
  const workspace = { version: 1, activeId: q.id, quotes: [q] };
  assert.deepEqual(parseWorkspace(JSON.stringify(workspace)), workspace);
  for (const value of [
    "broken json",
    JSON.stringify({ ...workspace, version: 2 }),
    JSON.stringify({ ...workspace, activeId: "missing" }),
    JSON.stringify({ ...workspace, quotes: [q, q] }),
    JSON.stringify({
      ...workspace,
      quotes: [{ ...q, logo: "javascript:alert(1)" }],
    }),
  ])
    assert.throws(() => parseWorkspace(value));
});

test("PDF embeds fonts and paginates long quotations using the shared preview/export renderer", async () => {
  const q = validQuote();
  q.from.name = "Café Studio";
  q.items = Array.from({ length: 100 }, (_, index) => ({
    ...newItem(),
    name: `Service ${index + 1}`,
    description: "Detailed deliverables and project scope. ".repeat(5),
    quantity: "1",
    rate: "1250",
    tax: "18",
  }));
  q.notes = "Long notes for the project. ".repeat(150);
  q.terms = "Payment and delivery terms. ".repeat(150);
  const blob = await getQuotationPdf(q);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(
    (bytes.toString("latin1").match(/\/Type \/Page\b/g) || []).length > 5,
  );
  assert.ok(bytes.byteLength > 50000);
  assert.equal(await getQuotationPdf(structuredClone(q)), blob);
  await assert.rejects(() => downloadPdf(createQuotation()), /business name/);
});

test("large supported quantities preserve cents in calculations and display", () => {
  const q = validQuote();
  q.items = [
    {
      ...newItem(),
      name: "Large order",
      quantity: "999999999.99",
      rate: "999999999.99",
      tax: "0",
    },
  ];
  assert.equal(calculate(q).total, "999999999980000000.00");
  assert.equal(
    money("999999999980000000.01", "USD"),
    "$999,999,999,980,000,000.01",
  );
});

test("legacy generic backups migrate without changing existing prices or terms", () => {
  const q = validQuote();
  q.terms = "Existing agreed terms";
  const legacy = JSON.parse(JSON.stringify(q));
  for (const key of [
    "clientType",
    "projectType",
    "siteAddress",
    "timeline",
    "scope",
    "exclusions",
    "paymentTerms",
  ])
    delete legacy[key];
  for (const item of legacy.items) {
    delete item.unit;
    delete item.section;
  }
  const restored = parseWorkspace(
    JSON.stringify({ version: 1, activeId: q.id, quotes: [legacy] }),
  ).quotes[0];
  assert.equal(restored.clientType, "Individual");
  assert.equal(restored.projectType, "Other");
  assert.equal(restored.items[0].unit, "nos");
  assert.equal(restored.items[0].section, "General");
  assert.equal(restored.terms, q.terms);
  assert.equal(calculate(restored).total, calculate(q).total);
});

test("construction starter lists leave measurements and rates to the firm", async () => {
  const { starterItems } = await import("../lib/quotation");
  for (const type of [
    "Renovation",
    "New build",
    "Interior fit-out",
    "Architectural design",
  ] as const) {
    const items = starterItems(type);
    assert.ok(items.length >= 3);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
    assert.ok(
      items.every(
        (item) =>
          item.name &&
          item.section &&
          item.unit &&
          item.quantity === "" &&
          item.rate === "",
      ),
    );
    assert.ok(
      exportErrors({ ...validQuote(), items }).some((error) =>
        error.includes("quantity"),
      ),
    );
  }
  assert.deepEqual(starterItems("Other"), []);
});

test("architecture details survive backups and unit pricing stays quantity times rate", () => {
  const q = validQuote();
  q.clientType = "Company";
  q.projectType = "Interior fit-out";
  q.siteAddress = "3rd floor, Example Business Park";
  q.timeline = "10 weeks after site handover";
  q.scope = "Office fit-out including partitions and joinery";
  q.exclusions = "Client-supplied appliances";
  q.paymentTerms = "Payments against agreed stage completion";
  q.items = [
    {
      ...newItem(),
      name: "Cabinetry",
      section: "Carpentry",
      unit: "running ft",
      quantity: "12.50",
      rate: "1500.25",
      tax: "0",
    },
  ];
  const restored = parseWorkspace(
    JSON.stringify({ version: 1, activeId: q.id, quotes: [q] }),
  ).quotes[0];
  assert.deepEqual(restored, q);
  assert.equal(calculate(restored).total, "18753.13");
  assert.equal(
    quotationSchema.safeParse({
      ...q,
      items: [{ ...q.items[0], unit: "invalid" }],
    }).success,
    false,
  );
  assert.equal(createQuotation().paymentTerms, "");
  assert.equal(createQuotation().terms, "");
});

test("revisions reproduce the reference's original + additions - adjustment without double counting", async () => {
  const { createRevision, summaryRows, amountInWords } =
    await import("../lib/quotation");
  const source = validQuote();
  source.items = [
    {
      ...newItem(),
      name: "Original project scope",
      quantity: "1",
      rate: "1469000",
      tax: "0",
    },
  ];
  const revision = createRevision(source, [source]);
  revision.items = [20000, 43000, 43000, 38000, 20000, 28000, 35000].map(
    (rate, index) => ({
      ...newItem(),
      name: `Additional package ${index + 1}`,
      quantity: "1",
      rate: String(rate),
      tax: "0",
    }),
  );
  revision.discountType = "fixed";
  revision.discount = "96000";
  const result = calculate(revision);
  assert.equal(result.originalTotal, "1469000.00");
  assert.equal(result.subtotal, "227000.00");
  assert.equal(result.beforeAdjustment, "1696000.00");
  assert.equal(result.total, "1600000.00");
  assert.equal(summaryRows(revision)[0][1], "₹14,69,000.00");
  assert.equal(amountInWords(result.total, "INR"), "Sixteen Lakh Rupees Only");
  assert.equal(revision.revision?.sourceId, source.id);
  source.items[0].rate = "1";
  assert.equal(revision.revision?.originalItems[0].rate, "1469000");
  assert.equal(calculate(revision).total, "1600000.00");
  assert.deepEqual(exportErrors(revision), []);
});

test("successive and sibling revisions retain snapshots, unique numbers, and currency", async () => {
  const { createRevision } = await import("../lib/quotation");
  const source = validQuote();
  const first = createRevision(source, [source]);
  first.items = [
    { ...newItem(), name: "Additional work", rate: "100", tax: "18" },
  ];
  const sibling = createRevision(source, [source, first]);
  assert.notEqual(sibling.number, first.number);
  const next = createRevision(first, [source, first, sibling]);
  assert.equal(next.revision?.originalTotal, calculate(first).total);
  assert.equal(next.revision?.originalItems.length, 2);
  assert.equal(next.number, "QT-0001-R3");
  assert.equal(
    quotationSchema.safeParse({ ...first, currency: "USD" }).success,
    false,
  );
  assert.throws(() => createRevision(createQuotation(), []), /Complete/);
  const restored = parseWorkspace(
    JSON.stringify({ version: 1, activeId: first.id, quotes: [first] }),
  );
  assert.equal(restored.quotes[0].revision?.sourceId, source.id);
});

test("revision adjustments apply after new work tax and do not re-tax the original total", async () => {
  const { createRevision } = await import("../lib/quotation");
  const source = validQuote();
  source.discount = "10";
  source.shipping = "5";
  const revision = createRevision(source, [source]);
  revision.items = [
    { ...newItem(), name: "Added work", rate: "100", tax: "18" },
  ];
  revision.discountType = "percent";
  revision.discount = "10";
  revision.shipping = "10";
  assert.equal(calculate(revision).tax, "18.00");
  const expected = new Decimal(calculate(source).total)
    .add(118)
    .add(10)
    .mul("0.9")
    .toFixed(2);
  assert.equal(calculate(revision).total, expected);
  revision.discountType = "fixed";
  revision.discount = "9999999";
  assert.equal(calculate(revision).total, "0.00");
});

test("room grouping retains line associations and specifications survive backup restore", async () => {
  const { groupedItems } = await import("../lib/quotation");
  const { packageItem } = await import("../lib/package-templates");
  const q = validQuote();
  const kitchen = packageItem("kitchen");
  kitchen.rate = "100";
  kitchen.specifications.forEach((spec) => {
    spec.body = "Project-specific selection\nSecond agreed inclusion";
  });
  kitchen.changes = "Client to supply the chimney";
  kitchen.sku = "K-01";
  q.items = [
    kitchen,
    { ...newItem(), room: "Bedroom", name: "Painting", rate: "200" },
    { ...newItem(), room: "Kitchen", name: "Electrical", rate: "300" },
  ];
  q.variationRates = [
    {
      id: crypto.randomUUID(),
      name: "Extra electrical points",
      unit: "point",
      rate: "1100",
      notes: "Wiring and fitting included",
    },
  ];
  const before = calculate(q).total;
  assert.equal(before, "600.00");
  assert.deepEqual(
    groupedItems(q.items).map((group) => group.items.map((row) => row.index)),
    [[0, 2], [1]],
  );
  const restored = parseWorkspace(
    JSON.stringify({ version: 1, activeId: q.id, quotes: [q] }),
  ).quotes[0];
  assert.deepEqual(restored, q);
  assert.deepEqual(exportErrors(restored), []);
  kitchen.specifications[0].body = "";
  assert.ok(
    exportErrors(q).some((message) => message.includes("specification")),
  );
  q.variationRates[0].rate = "";
  assert.ok(exportErrors(q).some((message) => message.includes("variation")));
});

test("amount words handle zero, paise and Indian grouping; large totals still format exactly", async () => {
  const { amountInWords } = await import("../lib/quotation");
  assert.equal(amountInWords("0", "INR"), "Zero Rupees Only");
  assert.equal(
    amountInWords("12345678.25", "INR"),
    "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Twenty Five Paise Only",
  );
  assert.equal(amountInWords("1000000000", "INR"), "");
  assert.equal(money("1469000", "INR"), "₹14,69,000.00");
});

test("firm templates retain specifications in backups and reset project pricing and changes on reuse", async () => {
  const { packageItem, saveableTemplate, instantiateTemplate } =
    await import("../lib/package-templates");
  const item = packageItem("wardrobe");
  item.rate = "88000";
  item.changes = "Client-specific change";
  item.specifications[0].body = "Height: 7 ft\nDepth: 2 ft";
  const template = saveableTemplate(item);
  const q = validQuote();
  const restored = parseWorkspace(
    JSON.stringify({
      version: 1,
      activeId: q.id,
      quotes: [q],
      templates: [template],
    }),
  );
  assert.deepEqual(restored.templates?.[0], template);
  const copy = instantiateTemplate(restored.templates![0]);
  assert.equal(copy.rate, "");
  assert.equal(copy.changes, "");
  assert.equal(copy.quantity, "1");
  assert.equal(copy.unit, "lump sum");
  assert.equal(copy.specifications[0].body, "Height: 7 ft\nDepth: 2 ft");
  assert.notEqual(copy.id, item.id);
  assert.notEqual(copy.specifications[0].id, template.specifications[0].id);
  copy.specifications[0].body = "Updated";
  assert.equal(template.specifications[0].body, "Height: 7 ft\nDepth: 2 ft");
});

test("preview and export reuse the same PDF blob and updates produce a new document", async () => {
  const quote = validQuote();
  quote.logo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  const preview = getQuotationPdf(quote);
  assert.equal(getQuotationPdf(structuredClone(quote)), preview);
  const blob = await preview;
  const changed = { ...quote, from: { ...quote.from, name: "Updated Studio" } };
  const update = await getQuotationPdf(changed);
  assert.notEqual(update, blob);
  assert.equal(await getQuotationPdf(changed), update);
});
