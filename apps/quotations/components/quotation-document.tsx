"use client";

import { useEffect, useState } from "react";
import type { Quotation } from "../lib/quotation";
import Button from "./button";

export default function QuotationDocument({
  quote,
  onReady,
}: {
  quote: Quotation;
  onReady: (blob: Blob, key: string) => void;
}) {
  const [preview, setPreview] = useState<{ url: string; key: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(quote);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const { getQuotationPdf } = await import("@/lib/pdf");
        const blob = await getQuotationPdf(JSON.parse(key));
        if (!active) return;
        onReady(blob, key);
        const url = URL.createObjectURL(blob);
        setPreview({ url, key });
        setError("");
      } catch {
        if (active)
          setError(
            "The PDF preview could not be generated. Try again or check the logo file.",
          );
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, retry, onReady]);
  // Keep the displayed PDF usable while its replacement is rendering or fails.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  return (
    <section
      aria-label="Quotation preview"
      className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
    >
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-2 text-xs text-stone-500">
        <span role="status">
          {error
            ? "Preview unavailable"
            : preview?.key === key
              ? "PDF preview · matches your download"
              : "Updating PDF preview…"}
        </span>
        {preview && preview.key === key && !error && (
          <a
            href={preview.url}
            target="_blank"
            rel="noreferrer"
            className="rounded text-emerald-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Open full PDF / print
          </a>
        )}
      </div>
      {error && (
        <div role="alert" className="space-y-3 p-5">
          <p>{error}</p>
          <Button
            variant="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry preview
          </Button>
        </div>
      )}
      {preview ? (
        <iframe
          src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`}
          title={`Quotation ${quote.number} PDF preview`}
          className="h-[75vh] min-h-[620px] w-full border-0 bg-stone-100"
          aria-busy={preview.key !== key}
        />
      ) : (
        !error && (
          <div className="flex min-h-[620px] items-start justify-center px-5 pt-20 text-sm text-stone-500">
            Preparing your quotation…
          </div>
        )
      )}
    </section>
  );
}
