"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/_ui/input";
import { useCompaniesStore } from "@/stores/companies-store";
import { PAYMENT_METHODS, feeCents } from "@/lib/crm/billing";
import { localDateKey } from "@/lib/crm/format";
import { PROJECT_PHASES } from "@/lib/crm/projects";

type QuoteOption = {
  id: string;
  number: string;
  title: string;
  currency: string;
};
export default function BillingFields({
  entity,
  record,
  projectId,
  companyId,
  inputClass,
}: {
  entity: "feeMilestones" | "paymentReceipts";
  record: Record<string, unknown>;
  projectId: string;
  companyId: string;
  inputClass: string;
}) {
  const milestones = useCompaniesStore((s) => s.feeMilestones).filter(
    (m) => m.projectId === projectId,
  );
  const [milestoneId, setMilestoneId] = useState(
    String(record.milestoneId ?? milestones[0]?.id ?? ""),
  );
  const [status, setStatus] = useState(String(record.status ?? "Recorded"));
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const [quotationId, setQuotationId] = useState(
    String(record.quotationId ?? ""),
  );
  useEffect(() => {
    if (entity !== "feeMilestones") return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/quotations?companyId=${encodeURIComponent(companyId)}&projectId=${encodeURIComponent(projectId)}&status=Accepted`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error();
        setQuotes(
          data.quotations.filter((q: QuoteOption) => q.currency === "INR"),
        );
        setQuoteStatus("");
      } catch {
        if (!controller.signal.aborted)
          setQuoteStatus(
            "Could not load accepted quotations. You can save without linking one.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [entity, companyId, projectId, retry]);
  function field(
    name: string,
    label: string,
    type = "text",
    required = false,
    fallback: unknown = "",
  ) {
    return (
      <label className="flex flex-col gap-2 text-sm">
        {label}
        <Input
          name={name}
          type={type}
          required={required}
          defaultValue={String(record[name] ?? fallback)}
          maxLength={type === "text" ? 200 : undefined}
          min={type === "number" ? "0.01" : undefined}
          max={type === "number" ? "999999999999.99" : undefined}
          step={type === "number" ? "0.01" : undefined}
        />
      </label>
    );
  }
  function select(
    name: string,
    label: string,
    options: readonly string[],
    fallback: string,
  ) {
    return (
      <label className="flex flex-col gap-2 text-sm">
        {label}
        <select
          name={name}
          className={inputClass}
          defaultValue={String(record[name] ?? fallback)}
        >
          {options.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
    );
  }
  const selected = milestones.find((m) => m.id === milestoneId);
  const remaining = selected
    ? feeCents(selected.amount) - feeCents(selected.receivedAmount)
    : BigInt(0);
  const defaultAmount = `${remaining / BigInt(100)}.${String(remaining % BigInt(100)).padStart(2, "0")}`;
  return (
    <>
      {entity === "feeMilestones" ? (
        <>
          {field("title", "Fee milestone", "text", true)}
          {select(
            "phase",
            "Project phase",
            PROJECT_PHASES,
            String(record.phase ?? "Briefing"),
          )}
          {field("amount", "Milestone amount (INR)", "number", true)}
          {field("dueDate", "Payment due date", "date", true, localDateKey())}
          {field("invoiceNumber", "Invoice number")}
          {field("invoiceDate", "Invoice issue date", "date")}
          <label className="flex flex-col gap-2 text-sm">
            Accepted project quotation
            <select
              name="quotationId"
              className={inputClass}
              value={quotationId}
              onChange={(e) => setQuotationId(e.target.value)}
            >
              <option value="">No quotation linked</option>
              {quotationId && !quotes.some((q) => q.id === quotationId) && (
                <option value={quotationId}>Previously linked quotation</option>
              )}
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.number} · {q.title}
                </option>
              ))}
            </select>
          </label>
          {quoteStatus && (
            <p role="status" className="text-subtle text-sm">
              {quoteStatus}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setRetry((v) => v + 1)}
              >
                Retry
              </button>
            </p>
          )}
          <p className="text-subtle text-xs">
            Record the invoice number and date when issued. Linking a quotation
            keeps its reference; enter the milestone amount separately.
          </p>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-2 text-sm">
            Fee milestone
            <select
              name="milestoneId"
              className={inputClass}
              value={milestoneId}
              required
              disabled={Boolean(record.id)}
              onChange={(e) => setMilestoneId(e.target.value)}
            >
              <option value="">Choose a milestone</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                  {m.invoiceNumber ? ` · ${m.invoiceNumber}` : ""}
                </option>
              ))}
            </select>
            {Boolean(record.id) && (
              <input type="hidden" name="milestoneId" value={milestoneId} />
            )}
          </label>
          {field("receiptNumber", "Receipt number", "text", true)}
          <div key={milestoneId}>
            {field(
              "amount",
              "Amount received (INR)",
              "number",
              true,
              defaultAmount,
            )}
          </div>
          {field("receivedDate", "Date received", "date", true, localDateKey())}
          {select("method", "Payment method", PAYMENT_METHODS, "Bank transfer")}
          {field("reference", "Bank or transaction reference")}
          <label className="flex flex-col gap-2 text-sm">
            Receipt status
            <select
              name="status"
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option>Recorded</option>
              <option>Voided</option>
            </select>
          </label>
          {status === "Voided" ? (
            <label className="flex flex-col gap-2 text-sm">
              Reason for voiding
              <textarea
                name="voidReason"
                required
                maxLength={1000}
                defaultValue={String(record.voidReason ?? "")}
                className={`${inputClass} h-24 py-2`}
              />
            </label>
          ) : (
            <input type="hidden" name="voidReason" value="" />
          )}
          <p className="text-subtle text-xs">
            Recorded receipts reduce the milestone balance. Void an incorrect
            receipt to keep its history and restore the balance.
          </p>
        </>
      )}
      <label className="flex flex-col gap-2 text-sm">
        Notes
        <textarea
          name="notes"
          defaultValue={String(record.notes ?? "")}
          maxLength={10000}
          className={`${inputClass} h-24 py-2`}
        />
      </label>
    </>
  );
}
