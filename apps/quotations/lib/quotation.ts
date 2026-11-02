import DecimalValue from "decimal.js";
import { z } from "zod";

const Decimal = DecimalValue.clone({ precision: 40 });

export const currencies = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "CAD",
  "AUD",
] as const;
export const projectTypes = [
  "Renovation",
  "New build",
  "Interior fit-out",
  "Architectural design",
  "Other",
] as const;
export const units = [
  "sq ft",
  "sq m",
  "running ft",
  "running m",
  "cu m",
  "nos",
  "lump sum",
  "day",
  "point",
] as const;
export const workSections = [
  "General",
  "Design",
  "Demolition",
  "Civil works",
  "Plumbing",
  "Electrical",
  "Flooring",
  "Painting",
  "Carpentry",
] as const;
export const statuses = ["Draft", "Sent", "Accepted", "Declined"] as const;
export const accents = {
  forest: "#17644c",
  indigo: "#4338ca",
  slate: "#334155",
} as const;
const text = z.string().max(5000);
const amount = z
  .string()
  .max(16)
  .regex(/^(?:\d{1,9}(?:\.\d{0,2})?)?$/);
const percentage = amount.refine(
  (value) => new Decimal(value || 0).lte(100),
  "Use a percentage from 0 to 100",
);
const date = z.iso.date();
const party = z.object({
  name: text,
  email: text,
  phone: text.default(""),
  address: text,
  taxId: text,
});
export const itemSchema = z.object({
  id: z.string().min(1).max(100),
  name: text,
  description: text,
  section: text.default("General"),
  unit: z.enum(units).default("nos"),
  room: text.default(""),
  sku: text.default(""),
  changes: text.default(""),
  specifications: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        heading: z.string().max(200),
        body: text,
      }),
    )
    .max(20)
    .default([]),
  quantity: amount,
  rate: amount,
  tax: percentage,
});
export const quotationSchema = z
  .object({
    id: z.string().min(1).max(100),
    number: z.string().max(100),
    title: text,
    clientType: z.enum(["Individual", "Company"]).default("Individual"),
    projectType: z.enum(projectTypes).default("Other"),
    siteAddress: text.default(""),
    timeline: text.default(""),
    scope: text.default(""),
    exclusions: text.default(""),
    paymentTerms: text.default(""),
    variationRates: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          name: text,
          unit: z.enum(units),
          rate: amount,
          notes: text,
        }),
      )
      .max(30)
      .default([]),
    revision: z
      .object({
        sourceId: z.string().min(1).max(100),
        sourceNumber: z.string().max(100),
        sequence: z.number().int().min(1).max(100),
        originalTotal: z.string().regex(/^\d{1,24}\.\d{2}$/),
        currency: z.enum(currencies),
        originalItems: z.array(itemSchema).min(1).max(1000),
      })
      .nullable()
      .default(null),
    issued: date,
    validUntil: date,
    currency: z.enum(currencies),
    status: z.enum(statuses),
    from: party,
    to: party,
    items: z.array(itemSchema).min(1).max(100),
    discountType: z.enum(["percent", "fixed"]),
    discount: amount,
    shipping: amount,
    notes: text,
    terms: text,
    accent: z.enum(["forest", "indigo", "slate"]),
    logo: z
      .string()
      .max(700000)
      .regex(/^(?:data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+)?$/),
    updatedAt: z.string().datetime(),
  })
  .superRefine((value, ctx) => {
    if (value.revision && value.revision.currency !== value.currency)
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: "A revision must keep its original currency",
      });
    for (const item of value.items)
      if (
        new Set(item.specifications.map((s) => s.id)).size !==
        item.specifications.length
      )
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Duplicate specification IDs",
        });
    if (
      new Set(value.variationRates.map((r) => r.id)).size !==
      value.variationRates.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["variationRates"],
        message: "Duplicate variation rate IDs",
      });
    if (new Set(value.items.map((item) => item.id)).size !== value.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Duplicate line item IDs",
      });
    if (
      value.discountType === "percent" &&
      new Decimal(value.discount || 0).gt(100)
    )
      ctx.addIssue({
        code: "custom",
        path: ["discount"],
        message: "Discount cannot exceed 100%",
      });
  });
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    activeId: z.string(),
    templates: z.array(itemSchema).max(50).optional(),
    quotes: z.array(quotationSchema).max(100),
  })
  .superRefine((value, ctx) => {
    if (
      value.templates &&
      new Set(value.templates.map((item) => item.id)).size !==
        value.templates.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate template IDs" });
    if (new Set(value.quotes.map((q) => q.id)).size !== value.quotes.length)
      ctx.addIssue({ code: "custom", message: "Duplicate quotation IDs" });
    if (!value.quotes.some((q) => q.id === value.activeId))
      ctx.addIssue({ code: "custom", message: "Active quotation is missing" });
  });
export type Quotation = z.infer<typeof quotationSchema>;
export type LineItem = z.infer<typeof itemSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export const STORAGE_KEY = "crm-quotations-v1";
const round = (value: DecimalValue) =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const decimal = (value: string) => new Decimal(value || 0);

export type Totals = {
  rows: { amount: string; discount: string; tax: string; total: string }[];
  subtotal: string;
  discount: string;
  tax: string;
  shipping: string;
  total: string;
  originalTotal: string;
  beforeAdjustment: string;
};
export function calculate(q: Quotation): Totals {
  if (q.revision) {
    const added = calculate({
      ...q,
      revision: null,
      discount: "0",
      shipping: "0",
    });
    const before = decimal(q.revision.originalTotal)
      .add(added.total)
      .add(decimal(q.shipping));
    const adjustment = Decimal.min(
      before,
      round(
        q.discountType === "percent"
          ? before.mul(decimal(q.discount)).div(100)
          : decimal(q.discount),
      ),
    );
    return {
      ...added,
      discount: adjustment.toFixed(2),
      shipping: decimal(q.shipping).toFixed(2),
      originalTotal: q.revision.originalTotal,
      beforeAdjustment: before.toFixed(2),
      total: before.sub(adjustment).toFixed(2),
    };
  }
  const lines = q.items.map((item) =>
    round(decimal(item.quantity).mul(decimal(item.rate))),
  );
  const subtotal = lines.reduce((sum, value) => sum.add(value), new Decimal(0));
  const requested =
    q.discountType === "percent"
      ? subtotal.mul(decimal(q.discount)).div(100)
      : decimal(q.discount);
  const discount = Decimal.min(subtotal, round(requested));
  const exactShares = lines.map((line) =>
    subtotal.isZero() ? new Decimal(0) : discount.mul(line).div(subtotal),
  );
  const shares = exactShares.map((share) =>
    share.toDecimalPlaces(2, Decimal.ROUND_DOWN),
  );
  const remainder = discount
    .sub(shares.reduce((sum, share) => sum.add(share), new Decimal(0)))
    .mul(100)
    .toNumber();
  const ranked = exactShares
    .map((share, index) => ({ index, fraction: share.sub(shares[index]) }))
    .sort((a, b) => b.fraction.cmp(a.fraction));
  for (let i = 0; i < remainder; i++)
    shares[ranked[i].index] = shares[ranked[i].index].add("0.01");
  const rows = q.items.map((item, index) => {
    const allocated = shares[index];
    const taxable = lines[index].sub(allocated);
    const tax = round(taxable.mul(decimal(item.tax)).div(100));
    return {
      amount: lines[index].toFixed(2),
      discount: allocated.toFixed(2),
      tax: tax.toFixed(2),
      total: taxable.add(tax).toFixed(2),
    };
  });
  const tax = rows.reduce((sum, row) => sum.add(row.tax), new Decimal(0));
  return {
    rows,
    originalTotal: "0.00",
    beforeAdjustment: subtotal.add(tax).add(decimal(q.shipping)).toFixed(2),
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    tax: tax.toFixed(2),
    shipping: decimal(q.shipping).toFixed(2),
    total: subtotal.sub(discount).add(tax).add(decimal(q.shipping)).toFixed(2),
  };
}

export function money(value: string, currency: Quotation["currency"]) {
  const [whole, fraction] = new Decimal(value).toFixed(2).split(".");
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(BigInt(whole))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

export function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function newItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    room: "",
    sku: "",
    changes: "",
    specifications: [],
    section: "General",
    unit: "nos",
    quantity: "1",
    rate: "",
    tax: "0",
  };
}

export function createQuotation(
  existing: Quotation[] = [],
  now = new Date(),
): Quotation {
  const issued = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const expiry = new Date(`${issued}T12:00:00`);
  expiry.setDate(expiry.getDate() + 30);
  let sequence = 1;
  while (
    existing.some((q) => q.number === `QT-${String(sequence).padStart(4, "0")}`)
  )
    sequence++;
  return {
    id: crypto.randomUUID(),
    number: `QT-${String(sequence).padStart(4, "0")}`,
    title: "",
    clientType: "Individual",
    projectType: "Renovation",
    siteAddress: "",
    timeline: "",
    scope: "",
    exclusions: "",
    paymentTerms: "",
    variationRates: [],
    revision: null,
    issued,
    validUntil: `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`,
    currency: "INR",
    status: "Draft",
    from: { name: "", email: "", phone: "", address: "", taxId: "" },
    to: { name: "", email: "", phone: "", address: "", taxId: "" },
    items: [newItem()],
    discountType: "percent",
    discount: "0",
    shipping: "0",
    notes: "Thank you for considering our firm for your project.",
    terms: "",
    accent: "forest",
    logo: "",
    updatedAt: now.toISOString(),
  };
}

export function exportErrors(q: Quotation): string[] {
  const errors: string[] = [];
  if (!quotationSchema.safeParse(q).success)
    return ["Check the quotation fields for invalid values."];
  if (!q.number.trim()) errors.push("Enter a quotation number.");
  if (!q.from.name.trim()) errors.push("Enter your business name.");
  if (!q.to.name.trim()) errors.push("Enter your client's name.");
  if (q.validUntil < q.issued)
    errors.push("Valid until must be on or after the quotation date.");
  if (
    q.items.some(
      (item) =>
        !item.name.trim() || decimal(item.quantity).lte(0) || item.rate === "",
    )
  )
    errors.push(
      "Give every item a name, quantity greater than zero, and rate.",
    );
  if (
    q.items.some((item) =>
      item.specifications.some(
        (spec) =>
          (spec.heading.trim() || spec.body.trim()) &&
          (!spec.heading.trim() || !spec.body.trim()),
      ),
    )
  )
    errors.push(
      "Complete each specification heading and details, or remove unused sections.",
    );
  if (q.variationRates.some((rate) => !rate.name.trim() || rate.rate === ""))
    errors.push(
      "Give every variation rate a name and rate, or remove unused rates.",
    );
  for (const p of [q.from, q.to])
    if (p.email && !z.email().safeParse(p.email).success)
      errors.push("Enter a valid email address or leave it blank.");
  return [...new Set(errors)];
}

export function parseWorkspace(raw: string): Workspace {
  return workspaceSchema.parse(JSON.parse(raw));
}

export function starterItems(
  projectType: Quotation["projectType"],
): LineItem[] {
  const design: [string, LineItem["unit"], string][] = [
    ["Site survey and measured drawings", "lump sum", "Design"],
    ["Concept design and space planning", "lump sum", "Design"],
    ["Working drawings and specifications", "lump sum", "Design"],
  ];
  const renovation: typeof design = [
    ["Dismantling and debris removal", "lump sum", "Demolition"],
    ["Masonry and plaster repairs", "sq ft", "Civil works"],
    ["Plumbing installation", "nos", "Plumbing"],
    ["Electrical points and wiring", "nos", "Electrical"],
    ["Flooring supply and installation", "sq ft", "Flooring"],
    ["Surface preparation and painting", "sq ft", "Painting"],
  ];
  const building: typeof design = [
    ["Excavation and earthwork", "cu m", "Civil works"],
    ["Foundation and structural works", "cu m", "Civil works"],
    ["Masonry and plastering", "sq ft", "Civil works"],
    ["Plumbing installation", "nos", "Plumbing"],
    ["Electrical points and wiring", "nos", "Electrical"],
    ["Flooring and finishes", "sq ft", "Flooring"],
  ];
  const interiors: typeof design = [
    ["Space planning and working drawings", "lump sum", "Design"],
    ["Partitions and ceiling work", "sq ft", "Civil works"],
    ["Custom cabinetry and joinery", "running ft", "Carpentry"],
    ["Lighting and electrical points", "nos", "Electrical"],
    ["Surface preparation and painting", "sq ft", "Painting"],
  ];
  const selected =
    projectType === "Architectural design"
      ? design
      : projectType === "New build"
        ? building
        : projectType === "Interior fit-out"
          ? interiors
          : projectType === "Renovation"
            ? renovation
            : [];
  return selected.map(([name, unit, section]) => ({
    ...newItem(),
    name,
    unit,
    section,
    quantity: "",
  }));
}

export function createRevision(
  source: Quotation,
  existing: Quotation[],
): Quotation {
  if (exportErrors(source).length)
    throw new Error(
      "Complete the current quotation before creating a revision.",
    );
  const originalItems = [
    ...(source.revision?.originalItems || []),
    ...source.items,
  ];
  if (originalItems.length > 1000)
    throw new Error(
      "This revision chain has reached 1,000 work items. Start a new quotation.",
    );
  let sequence = (source.revision?.sequence || 0) + 1;
  const baseNumber = source.number.replace(/-R\d+$/, "").slice(0, 90);
  while (existing.some((q) => q.number === `${baseNumber}-R${sequence}`))
    sequence++;
  if (sequence > 100)
    throw new Error("Maximum 100 revisions reached for this quotation.");
  const fresh = createQuotation(existing);
  return quotationSchema.parse({
    ...structuredClone(source),
    id: fresh.id,
    number: `${baseNumber}-R${sequence}`,
    issued: fresh.issued,
    validUntil: fresh.validUntil,
    status: "Draft",
    updatedAt: fresh.updatedAt,
    items: [newItem()],
    discount: "0",
    shipping: "0",
    revision: {
      sourceId: source.id,
      sourceNumber: source.number,
      sequence,
      originalTotal: calculate(source).total,
      currency: source.currency,
      originalItems,
    },
  });
}

export function groupedItems(items: LineItem[]) {
  const groups = new Map<
    string,
    { room: string; items: { item: LineItem; index: number }[] }
  >();
  items.forEach((item, index) => {
    const key = item.room.trim();
    if (!groups.has(key)) groups.set(key, { room: key, items: [] });
    groups.get(key)!.items.push({ item, index });
  });
  let number = 0;
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.map((row) => ({ ...row, number: ++number })),
  }));
}

export function summaryRows(q: Quotation): [string, string][] {
  const t = calculate(q);
  return [
    ...(q.revision
      ? [
          [`Original total (${q.revision.sourceNumber})`, t.originalTotal] as [
            string,
            string,
          ],
        ]
      : []),
    [q.revision ? "Additional work subtotal" : "Subtotal", t.subtotal],
    ...(!q.revision && decimal(t.discount).gt(0)
      ? [["Discount", `−${money(t.discount, q.currency)}`] as [string, string]]
      : []),
    [q.revision ? "Tax on additional work" : "Tax", t.tax],
    ...(decimal(t.shipping).gt(0)
      ? [["Additional charges", t.shipping] as [string, string]]
      : []),
    ...(q.revision
      ? ([
          ["Subtotal before adjustment", t.beforeAdjustment],
          ["Discount / adjustment", `−${money(t.discount, q.currency)}`],
        ] as [string, string][])
      : []),
  ].map(([label, value]) => [
    label,
    value.startsWith("−") ? value : money(value, q.currency),
  ]);
}

export function amountInWords(value: string, currency: Quotation["currency"]) {
  const [whole, fraction] = new Decimal(value).toFixed(2).split(".");
  if (BigInt(whole) > BigInt("999999999")) return "";
  const small = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  function words(n: number): string {
    if (n < 20) return small[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${small[n % 10]}`.trim();
    for (const [size, label] of (currency === "INR"
      ? [
          [10000000, "Crore"],
          [100000, "Lakh"],
          [1000, "Thousand"],
          [100, "Hundred"],
        ]
      : [
          [1000000, "Million"],
          [1000, "Thousand"],
          [100, "Hundred"],
        ]) as [number, string][]) {
      if (n >= size)
        return `${words(Math.floor(n / size))} ${label} ${words(n % size)}`.trim();
    }
    return "";
  }
  return `${words(Number(whole)) || "Zero"} ${currency === "INR" ? "Rupees" : currency}${Number(fraction) ? ` and ${words(Number(fraction))} ${currency === "INR" ? "Paise" : "Minor Units"}` : ""} Only`;
}
