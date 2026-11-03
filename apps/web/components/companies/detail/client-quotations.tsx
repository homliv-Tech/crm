"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { calculate, money, type Quotation } from "@crm/quotations/quotation";
import QuotationContextMenu from "@crm/quotations/context-menu";
import { resetStoredQuotationCrmVersion } from "@crm/quotations/workspace";
import { useCompaniesStore } from "@/stores/companies-store";

type SavedQuotation = { id: string; document: Quotation; updatedAt: string };
export default function ClientQuotations({ companyId }: { companyId: string }) {
  const canWrite = useCompaniesStore((state) => state.canWrite);
  const [quotes, setQuotes] = useState<SavedQuotation[]>([]);
  const [status, setStatus] = useState("Loading quotations…");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/quotations?companyId=${encodeURIComponent(companyId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load quotations.");
        setQuotes(result.quotations);
        setStatus(
          result.quotations.length
            ? ""
            : "No quotations saved for this client yet.",
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not load quotations.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [companyId, attempt]);

  async function remove(id: string, number: string) {
    if (!useCompaniesStore.getState().canWrite) return;
    if (
      !window.confirm(
        `Delete ${number || "this quotation"} from CRM? This cannot be undone. Any browser drafts will remain.`,
      )
    )
      return;
    try {
      const response = await fetch(
        `/api/quotations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok && response.status !== 404)
        throw new Error(result.error || "Could not delete quotation.");
      setQuotes((previous) => previous.filter((q) => q.id !== id));
      try {
        resetStoredQuotationCrmVersion(window.localStorage, id);
      } catch {
        setStatus(
          "Quotation deleted from CRM, but the browser draft could not be updated. Export a backup before reloading the quotation generator.",
        );
        return;
      }
      setStatus("Quotation deleted from CRM.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not delete quotation.",
      );
    }
  }
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base">Quotations</h2>
        <Link
          className="text-sm underline"
          href={`/quotations?companyId=${encodeURIComponent(companyId)}`}
        >
          Create quotation
        </Link>
      </div>
      {status && (
        <p role="status" className="text-subtle text-sm">
          {status}
        </p>
      )}
      {quotes.map(({ id, document: q, updatedAt }) => (
        <QuotationContextMenu
          key={id}
          actions={
            canWrite
              ? [
                  {
                    label: "Delete from CRM",
                    onSelect: () => void remove(id, q.number),
                  },
                ]
              : []
          }
        >
          <Link
            key={id}
            className="border-border hover:bg-muted mb-2 block rounded-lg border p-3"
            href={`/quotations?quotationId=${encodeURIComponent(id)}`}
          >
            <p className="text-sm">
              {q.number} · {q.title || "Untitled project"}
            </p>
            <p className="text-subtle mt-1 text-xs">
              {q.status} · {money(calculate(q).total, q.currency)} · Valid until{" "}
              {q.validUntil}
            </p>
            <p className="text-subtle mt-1 text-xs">
              {q.to.name}
              {q.to.email ? ` · ${q.to.email}` : ""}
              {q.to.phone ? ` · ${q.to.phone}` : ""}
            </p>
            {q.siteAddress && (
              <p className="text-subtle mt-1 text-xs">{q.siteAddress}</p>
            )}
            <p className="text-subtle mt-1 text-xs">
              Updated {new Date(updatedAt).toLocaleString()}
            </p>
          </Link>
        </QuotationContextMenu>
      ))}
      <button
        type="button"
        className="mt-2 text-xs underline"
        onClick={() => {
          setStatus("Loading quotations…");
          setAttempt((n) => n + 1);
        }}
      >
        Refresh quotations
      </button>
    </section>
  );
}
