"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/_ui/button";
import { useCompaniesStore } from "@/stores/companies-store";
import {
  feeCents,
  feeMoney,
  milestoneStatus,
  summarizeFees,
} from "@/lib/crm/billing";
import { localDateKey } from "@/lib/crm/format";
import type { Deal, FeeMilestone } from "@/lib/crm/types";
import { useCrmEditor, selectClass } from "./crm-editor";

export default function ProjectFees({
  project,
  overview,
  onViewAll,
}: {
  project: Deal;
  overview: boolean;
  onViewAll: () => void;
}) {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [filter, setFilter] = useState("All");
  const milestones = state.feeMilestones.filter(
    (m) => m.projectId === project.id,
  );
  const today = localDateKey();
  const totals = summarizeFees(milestones, today);
  const remainingFee = feeCents(project.value) - totals.scheduled;
  const matching = milestones.filter(
    (m) => overview || filter === "All" || milestoneStatus(m, today) === filter,
  );
  const rows = overview ? matching.slice(0, 4) : matching;
  function receipt(m: FeeMilestone) {
    const remaining = feeCents(m.amount) - feeCents(m.receivedAmount);
    edit({
      entity: "paymentReceipts",
      companyId: project.companyId,
      projectId: project.id,
      record: {
        milestoneId: m.id,
        amount: `${remaining / BigInt(100)}.${String(remaining % BigInt(100)).padStart(2, "0")}`,
      },
    });
  }
  return (
    <section className="border-border min-w-0 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">Fee milestones and payments</h2>
        <Button
          className="min-h-11"
          disabled={!state.canWrite || state.saving}
          onClick={() =>
            edit({
              entity: "feeMilestones",
              companyId: project.companyId,
              projectId: project.id,
              record: { phase: project.stage },
            })
          }
        >
          Add milestone
        </Button>
      </div>
      <dl className="border-border my-4 grid grid-cols-2 gap-4 border-y py-4 md:grid-cols-3">
        {[
          ["Project fee", feeCents(project.value)],
          ["Scheduled fees", totals.scheduled],
          ["Invoiced", totals.invoiced],
          ["Received", totals.received],
          ["Outstanding", totals.outstanding],
          ["Overdue invoices", totals.overdue],
        ].map(([label, value]) => (
          <div className="min-w-0" key={String(label)}>
            <dt className="text-subtle text-xs">{String(label)}</dt>
            <dd
              className={`mt-2 text-sm break-words tabular-nums ${label === "Overdue invoices" && totals.overdue > BigInt(0) ? "text-red-400" : ""}`}
            >
              {feeMoney(value as bigint)}
            </dd>
          </div>
        ))}
      </dl>
      {remainingFee !== BigInt(0) && (
        <p className="text-subtle mb-4 text-sm">
          {remainingFee > BigInt(0)
            ? `${feeMoney(remainingFee)} of the project fee has no milestone yet.`
            : `Scheduled fees exceed the project fee by ${feeMoney(-remainingFee)}. Review the agreed fee and milestone amounts.`}
        </p>
      )}
      {!overview && (
        <label className="mb-4 flex max-w-64 flex-col gap-2 text-sm">
          Milestone status
          <select
            className={selectClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["All", "Planned", "Unpaid", "Part paid", "Paid", "Overdue"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
      )}
      {rows.map((m) => {
        const payments = state.paymentReceipts.filter(
          (p) => p.milestoneId === m.id,
        );
        const remaining = feeCents(m.amount) - feeCents(m.receivedAmount);
        const status = milestoneStatus(m, today);
        return (
          <article key={m.id} className="border-border border-b py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium break-words">{m.title}</h3>
                <p className="text-subtle mt-1 text-xs">
                  {m.phase} ·{" "}
                  <span className={status === "Overdue" ? "text-red-400" : ""}>
                    {status}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  disabled={
                    !state.canWrite || state.saving || remaining === BigInt(0)
                  }
                  onClick={() => receipt(m)}
                >
                  Record payment
                </Button>
                <Button
                  className="min-h-11"
                  disabled={!state.canWrite || state.saving}
                  onClick={() =>
                    edit({ entity: "feeMilestones", record: { ...m } })
                  }
                >
                  Edit milestone
                </Button>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-subtle text-xs">Milestone amount</dt>
                <dd className="mt-1 break-words tabular-nums">
                  {feeMoney(feeCents(m.amount))}
                </dd>
              </div>
              <div>
                <dt className="text-subtle text-xs">Received</dt>
                <dd className="mt-1 break-words tabular-nums">
                  {feeMoney(feeCents(m.receivedAmount))}
                </dd>
              </div>
              <div>
                <dt className="text-subtle text-xs">Balance</dt>
                <dd className="mt-1 break-words tabular-nums">
                  {feeMoney(remaining)}
                </dd>
              </div>
              <div>
                <dt className="text-subtle text-xs">Due date</dt>
                <dd className="mt-1">{m.dueDate}</dd>
              </div>
            </dl>
            <p className="text-subtle mt-3 text-xs break-words">
              {m.invoiceNumber
                ? `Invoice ${m.invoiceNumber} · Issued ${m.invoiceDate}`
                : "Invoice not issued"}
            </p>
            {m.quotationId && (
              <Link
                className="mt-2 inline-block text-sm underline"
                href={`/quotations?quotationId=${encodeURIComponent(m.quotationId)}`}
              >
                View linked quotation
              </Link>
            )}
            {m.notes && (
              <p className="mt-3 text-sm break-words whitespace-pre-wrap">
                {m.notes}
              </p>
            )}
            {payments.length > 0 && (
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer text-sm">
                  Receipt history ({payments.length})
                </summary>
                {payments.map((p) => (
                  <div key={p.id} className="border-border border-t py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm break-words">
                          {p.receiptNumber} · {feeMoney(feeCents(p.amount))} ·{" "}
                          {p.status}
                        </p>
                        <p className="text-subtle mt-1 text-xs break-words">
                          {p.receivedDate} · {p.method}
                          {p.reference && ` · ${p.reference}`}
                        </p>
                      </div>
                      <Button
                        className="min-h-11"
                        disabled={!state.canWrite || state.saving}
                        aria-label={`Edit receipt ${p.receiptNumber}`}
                        onClick={() =>
                          edit({ entity: "paymentReceipts", record: { ...p } })
                        }
                      >
                        Edit receipt
                      </Button>
                    </div>
                    {p.status === "Voided" && (
                      <p className="mt-2 text-sm break-words">
                        Void reason: {p.voidReason}
                      </p>
                    )}
                    {p.notes && (
                      <p className="mt-2 text-sm break-words whitespace-pre-wrap">
                        {p.notes}
                      </p>
                    )}
                  </div>
                ))}
              </details>
            )}
          </article>
        );
      })}
      {!rows.length && (
        <p className="text-subtle py-5 text-sm">
          {milestones.length
            ? "No milestones match this status."
            : "Add the advance, design-stage, and handover fee milestones, then record invoices and payments against them."}
        </p>
      )}
      {overview && matching.length > 4 && (
        <button className="mt-3 min-h-11 text-sm underline" onClick={onViewAll}>
          View all {matching.length} fee milestones
        </button>
      )}
      <p className="text-subtle mt-4 text-xs">
        Outstanding covers all scheduled fees less recorded receipts. Overdue
        includes unpaid balances on issued invoices. These records track fees
        and payments; they do not change the project fee or generate invoice
        documents.
      </p>
    </section>
  );
}
