import { z } from "zod";
import { PROJECT_PHASES } from "./projects";
import type { FeeMilestone } from "./types";

export const PAYMENT_METHODS = [
  "Bank transfer",
  "UPI",
  "Cash",
  "Cheque",
  "Card",
  "Other",
] as const;
export const RECEIPT_STATUSES = ["Recorded", "Voided"] as const;
const uuid = z.uuid().transform((v) => v.toLowerCase());
const text = z.string().trim().min(1).max(200);
const notes = z.string().trim().max(10000).default("");
const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .nullish()
  .transform((v) => v || null);
const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => v || null);
const amount = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z
      .string()
      .trim()
      .regex(
        /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/,
        "Enter an amount with at most two decimal places.",
      ),
  )
  .transform((v) => {
    const [whole, fraction = ""] = v.split(".");
    return `${whole}.${fraction.padEnd(2, "0")}`;
  })
  .refine((v) => feeCents(v) > BigInt(0), "Amount must be greater than zero.");

export const feeMilestoneInput = z
  .object({
    companyId: uuid,
    projectId: uuid,
    title: text,
    phase: z.enum(PROJECT_PHASES),
    amount,
    dueDate: z.iso.date(),
    invoiceNumber: optionalText,
    invoiceDate: optionalDate,
    quotationId: z
      .union([uuid, z.literal("")])
      .nullish()
      .transform((v) => v || null),
    notes,
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.invoiceNumber) !== Boolean(v.invoiceDate))
      ctx.addIssue({
        code: "custom",
        path: ["invoiceNumber"],
        message:
          "Record both an invoice number and its issue date, or leave both empty.",
      });
  });
export const paymentReceiptInput = z
  .object({
    companyId: uuid,
    projectId: uuid,
    milestoneId: uuid,
    receiptNumber: text,
    amount,
    receivedDate: z.iso.date(),
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().max(200).default(""),
    notes,
    status: z.enum(RECEIPT_STATUSES).default("Recorded"),
    voidReason: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.status === "Voided" ? !v.voidReason : Boolean(v.voidReason))
      ctx.addIssue({
        code: "custom",
        path: ["voidReason"],
        message:
          v.status === "Voided"
            ? "Record why this receipt is void."
            : "Only voided receipts can have a void reason.",
      });
  });

export function receiptAmountDefault(
  record: { id?: unknown; milestoneId?: unknown; amount?: unknown },
  selectedMilestoneId: string,
  balance: unknown,
): string {
  const useRecordedAmount =
    Boolean(record.id) || record.milestoneId === selectedMilestoneId;
  return String((useRecordedAmount ? record.amount : undefined) ?? balance);
}

export function feeCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function feeMoney(cents: bigint): string {
  const value = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}₹${(value / BigInt(100)).toLocaleString("en-IN")}.${String(value % BigInt(100)).padStart(2, "0")}`;
}
export function milestoneStatus(m: FeeMilestone, today: string) {
  if (feeCents(m.receivedAmount) === feeCents(m.amount)) return "Paid";
  if (m.invoiceNumber && m.dueDate < today) return "Overdue";
  if (feeCents(m.receivedAmount) > BigInt(0)) return "Part paid";
  return m.invoiceNumber ? "Unpaid" : "Planned";
}
export function summarizeFees(milestones: FeeMilestone[], today: string) {
  return milestones.reduce(
    (totals, m) => {
      const amount = feeCents(m.amount),
        received = feeCents(m.receivedAmount);
      totals.scheduled += amount;
      totals.received += received;
      totals.outstanding += amount - received;
      if (m.invoiceNumber) totals.invoiced += amount;
      if (milestoneStatus(m, today) === "Overdue")
        totals.overdue += amount - received;
      return totals;
    },
    {
      scheduled: BigInt(0),
      received: BigInt(0),
      outstanding: BigInt(0),
      invoiced: BigInt(0),
      overdue: BigInt(0),
    },
  );
}
