"use client";

import { useCallback, useRef, useState } from "react";
import Button from "./button";
import WorkspaceSidebar from "./workspace-sidebar";
import { saveableTemplate } from "@/lib/package-templates";
import QuotationDocument from "./quotation-document";
import ClientProjectStep from "./editor/client-project-step";
import WorkPricingStep from "./editor/work-pricing-step";
import TermsBrandingStep from "./editor/terms-branding-step";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  calculate,
  createQuotation,
  createRevision,
  exportErrors,
  money,
  workSections,
  type LineItem,
  type Quotation,
} from "@/lib/quotation";

const editorSteps = [
  {
    title: "Client & project",
    hint: "Set up the quotation and contact details.",
  },
  { title: "Work & pricing", hint: "Add work items, quantities and rates." },
  {
    title: "Terms & branding",
    hint: "Add your scope, payment terms and finishing touches.",
  },
];

function issueStep(issue: string) {
  return /item|specification|variation/.test(issue) ? 1 : 0;
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-xl bg-emerald-800 font-serif text-white ${small ? "size-8 text-xl" : "size-9 text-2xl"}`}
    >
      q.
    </span>
  );
}
export default function QuotationApp() {
  const [errors, setErrors] = useState<string[]>([]);
  const {
    workspace,
    setWorkspace,
    saveState,
    message,
    setMessage,
    importBackup,
    backup,
  } = useWorkspace(() => setErrors([]));
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const previewPdf = useRef<{ blob: Blob; key: string } | null>(null);
  const onPdfReady = useCallback((blob: Blob, key: string) => {
    previewPdf.current = { blob, key };
  }, []);

  const quote = workspace?.quotes.find((q) => q.id === workspace.activeId);
  if (!workspace || !quote)
    return (
      <main className="mx-auto max-w-6xl p-8">
        <div className="flex items-center gap-3">
          <Mark />
          <h1>Quotient</h1>
        </div>
        <p className="mt-8" role="status">
          Loading your quotation workspace…
        </p>
      </main>
    );
  const totals = calculate(quote);
  const readiness = exportErrors(quote);

  function goToStep(next: number) {
    setStep(next);
    setView("edit");
    requestAnimationFrame(() => {
      stepHeading.current?.focus();
      stepHeading.current?.scrollIntoView({ block: "start" });
    });
  }
  function fixIssue(issue: string) {
    setErrors(readiness);
    goToStep(issueStep(issue));
    requestAnimationFrame(() => {
      const form = document.getElementById("quotation-form");
      if (/specification/.test(issue)) {
        form?.querySelectorAll("details").forEach((detail) => {
          detail.open = true;
        });
      }
      const invalid = Array.from(
        form?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') || [],
      ).find((control) => !control.closest("[hidden]"));
      invalid?.focus();
    });
  }
  function showIssues(issues: string[]) {
    setErrors(issues);
    if (!issues.length) return false;
    setView("edit");
    setStep(issueStep(issues[0]));
    requestAnimationFrame(() => {
      errorSummary.current?.focus();
      errorSummary.current?.scrollIntoView({ block: "center" });
    });
    return true;
  }
  const current = quote;
  const currentWorkspace = workspace;

  function update(patch: Partial<Quotation>, id = current.id) {
    setErrors([]);
    setWorkspace(
      (previous) =>
        previous && {
          ...previous,
          quotes: previous.quotes.map((q) =>
            q.id === id
              ? { ...q, ...patch, updatedAt: new Date().toISOString() }
              : q,
          ),
        },
    );
  }
  function addQuote(copy = false) {
    if (currentWorkspace.quotes.length >= 100) {
      setMessage(
        "This workspace holds up to 100 quotations. Export a backup, then delete an old quotation to make room.",
      );
      return;
    }
    let next = createQuotation(currentWorkspace.quotes);
    next = {
      ...next,
      from: { ...current.from },
      logo: current.logo,
      accent: current.accent,
    };
    if (copy)
      next = {
        ...current,
        id: next.id,
        number: next.number,
        status: "Draft",
        updatedAt: next.updatedAt,
        items: current.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      };
    setWorkspace({
      ...currentWorkspace,
      activeId: next.id,
      quotes: [next, ...currentWorkspace.quotes],
    });
    setErrors([]);
    setView("edit");
    setStep(0);
  }
  function saveTemplate(item: LineItem) {
    if (!item.name.trim()) {
      setMessage("Name this work item before saving it as a template.");
      return;
    }
    const templates = currentWorkspace.templates || [];
    if (templates.length >= 50) {
      setMessage(
        "You can save up to 50 firm templates. Remove an old template to make room.",
      );
      return;
    }
    const template = saveableTemplate(item);
    setWorkspace({ ...currentWorkspace, templates: [...templates, template] });
    setMessage(
      "Firm template saved. Reuse it from the package menu; enter a fresh price and project-specific changes each time.",
    );
  }
  function reviseQuote() {
    if (currentWorkspace.quotes.length >= 100) {
      setMessage(
        "Export a backup and remove an old draft before adding another quotation.",
      );
      return;
    }
    try {
      const next = createRevision(current, currentWorkspace.quotes);
      setWorkspace({
        ...currentWorkspace,
        activeId: next.id,
        quotes: [next, ...currentWorkspace.quotes],
      });
      setErrors([]);
      setView("edit");
      setStep(1);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Could not create a revision.",
      ]);
    }
  }
  function removeQuote() {
    if (
      !window.confirm(
        `Delete ${current.number || "this quotation"}? This cannot be undone. Export a backup first if you need a copy.`,
      )
    )
      return;
    const remaining = currentWorkspace.quotes.filter(
      (q) => q.id !== current.id,
    );
    if (!remaining.length)
      remaining.push(createQuotation(currentWorkspace.quotes));
    setWorkspace({
      ...currentWorkspace,
      quotes: remaining,
      activeId: remaining[0].id,
    });
    setErrors([]);
  }
  async function exportPdf() {
    const issues = exportErrors(current);
    if (showIssues(issues)) return;
    setExporting(true);
    try {
      const { downloadPdf } = await import("@/lib/pdf");
      const prepared = previewPdf.current;
      await downloadPdf(
        current,
        prepared?.key === JSON.stringify(current) ? prepared.blob : undefined,
      );
      setMessage(
        "PDF downloaded. You can now attach it to an email or share it with your client.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `PDF export failed: ${error.message}`
          : "PDF export failed. Try again or use Print.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <datalist id="work-sections">
        {workSections.map((section) => (
          <option key={section} value={section} />
        ))}
      </datalist>
      <a
        href="#editor"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to quotation
      </a>
      <header className="no-print flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="text-xl font-semibold tracking-tight">Quotient</span>
          <span className="ml-2 hidden border-l border-stone-200 pl-4 text-xs text-stone-500 sm:block">
            Architecture · Renovation · Building works
          </span>
        </div>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-[11px] font-medium text-stone-600">
          Private by default · No sign-up
        </span>
      </header>
      <div className="print-shell mx-auto grid max-w-[1700px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <WorkspaceSidebar
          workspace={workspace}
          onAddQuote={() => addQuote()}
          onSelectQuote={(id) => {
            setWorkspace({ ...workspace, activeId: id });
            setErrors([]);
            setStep(0);
            setView("edit");
          }}
          backup={backup}
          importBackup={importBackup}
        />
        <main id="editor" className="print-shell min-w-0 p-5 sm:p-8">
          <div className="no-print mb-7 flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-emerald-800 uppercase">
                {quote.number || "New quotation"} · {quote.status}
              </div>
              <h1>Quotation generator</h1>
              <p className="mt-2 text-stone-500">
                Build your quotation in three steps, then review the PDF before
                sharing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={reviseQuote}>
                Create revision
              </Button>
              <Button variant="secondary" onClick={() => addQuote(true)}>
                Duplicate
              </Button>
              <Button
                variant="secondary"
                disabled={exporting}
                onClick={() => void exportPdf()}
              >
                {exporting ? "Preparing PDF…" : "↓ Download PDF"}
              </Button>
            </div>
          </div>
          {message && (
            <div
              role="status"
              className="no-print mb-5 flex items-start justify-between gap-3 rounded-lg border border-stone-300 bg-white p-4 text-sm text-stone-700"
            >
              <span>{message}</span>
              <Button
                variant="ghost"
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                ×
              </Button>
            </div>
          )}
          {!!errors.length && (
            <div
              role="alert"
              ref={errorSummary}
              tabIndex={-1}
              className="no-print mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <div className="font-semibold">A few details are missing</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errors.map((error) => (
                  <li key={error}>
                    <button
                      type="button"
                      className="min-h-8 cursor-pointer text-left underline underline-offset-4 focus-visible:outline-2"
                      onClick={() => fixIssue(error)}
                    >
                      {error} <span aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <nav
            aria-label="Quotation steps"
            className="no-print mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {editorSteps.map((item, index) => (
              <Button
                key={item.title}
                variant="secondary"
                aria-current={
                  view === "edit" && step === index ? "step" : undefined
                }
                className={`justify-start text-left whitespace-normal ${view === "edit" && step === index ? "border-emerald-700 bg-emerald-50 text-emerald-900" : ""}`}
                onClick={() => goToStep(index)}
              >
                <span aria-hidden="true" className="font-semibold">
                  {index + 1}.
                </span>{" "}
                {item.title}
              </Button>
            ))}
            <Button
              variant="secondary"
              aria-current={view === "preview" ? "step" : undefined}
              className={`justify-start ${view === "preview" ? "border-emerald-700 bg-emerald-50 text-emerald-900" : ""}`}
              onClick={() => setView("preview")}
            >
              4. Review PDF
            </Button>
          </nav>
          <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                ref={stepHeading}
                tabIndex={-1}
                className="scroll-mt-6 focus:outline-none"
              >
                {view === "edit"
                  ? editorSteps[step].title
                  : "Review your quotation"}
              </h2>
              <p className="mt-1 text-stone-600">
                {view === "edit"
                  ? editorSteps[step].hint
                  : "Check the document before downloading or printing."}
              </p>
            </div>
            <span role="status" className="text-xs text-stone-600">
              {saveState}
            </span>
          </div>
          <div className="print-shell grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            {view === "edit" && (
              <form
                id="quotation-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (step < 2) goToStep(step + 1);
                  else setView("preview");
                }}
                noValidate
                className="no-print min-w-0 space-y-5"
              >
                <div hidden={step !== 0} className="space-y-5">
                  <ClientProjectStep
                    quote={quote}
                    update={update}
                    errors={errors}
                  />
                </div>
                <div hidden={step !== 1} className="space-y-5">
                  <WorkPricingStep
                    quote={quote}
                    update={update}
                    errors={errors}
                    workspace={workspace}
                    setWorkspace={setWorkspace}
                    totals={totals}
                    saveTemplate={saveTemplate}
                  />
                </div>
                <div hidden={step !== 2} className="space-y-5">
                  <TermsBrandingStep
                    quote={quote}
                    update={update}
                    errors={errors}
                    setMessage={setMessage}
                  />
                </div>
                <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <Button
                    variant="secondary"
                    disabled={step === 0}
                    onClick={() => goToStep(step - 1)}
                  >
                    ← Back
                  </Button>
                  <span className="min-w-0 text-xs text-stone-600">
                    <span className="block">Step {step + 1} of 3</span>
                    <span className="block font-semibold break-all tabular-nums">
                      {money(totals.total, quote.currency)}
                    </span>
                  </span>
                  <Button variant="primary" type="submit">
                    {step < 2 ? "Continue →" : "Review PDF →"}
                  </Button>
                </div>
                <Button variant="danger" onClick={removeQuote}>
                  Delete quotation
                </Button>
              </form>
            )}
            {view === "edit" && (
              <aside className="no-print space-y-5 rounded-xl border border-stone-200 bg-white p-5 xl:sticky xl:top-6">
                <div>
                  <h2>Quotation summary</h2>
                  <p className="mt-2 break-words text-stone-600">
                    {quote.title || "Untitled project"}
                  </p>
                  <p className="break-words text-stone-600">
                    {quote.to.name || "Add a client to get started"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4 text-sm">
                  <span>
                    {quote.items.length} work{" "}
                    {quote.items.length === 1 ? "item" : "items"}
                  </span>
                  <span className="font-medium tabular-nums">
                    {quote.currency}
                  </span>
                </div>
                <div className="rounded-lg bg-stone-50 p-4">
                  <p className="text-stone-600">Quotation total</p>
                  <p className="mt-1 text-2xl font-semibold break-all tabular-nums">
                    {money(totals.total, quote.currency)}
                  </p>
                  <p className="mt-2 text-xs text-stone-600">
                    Includes discounts, item taxes and additional charges.
                  </p>
                </div>
                <div>
                  <h3>
                    {readiness.length
                      ? "Before you download"
                      : "Ready to download"}
                  </h3>
                  {readiness.length ? (
                    <ul className="mt-2 space-y-2">
                      {readiness.map((issue) => (
                        <li key={issue}>
                          <button
                            type="button"
                            className="min-h-8 cursor-pointer text-left text-xs leading-5 text-stone-600 underline underline-offset-4 focus-visible:outline-2"
                            onClick={() => fixIssue(issue)}
                          >
                            {issue}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-stone-600">
                      All required details are filled in. Review the PDF when
                      you’re ready.
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setView("preview")}
                >
                  Preview PDF →
                </Button>
                <p className="text-xs text-stone-600">
                  Drafts save automatically in this browser. You can move
                  between steps at any time.
                </p>
              </aside>
            )}
            {view === "preview" && (
              <div className="print-shell min-w-0">
                <div className="no-print mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500">
                    LIVE PREVIEW
                  </span>
                  <span className="text-[10px] text-stone-500">
                    Updates as you type
                  </span>
                </div>
                <QuotationDocument quote={quote} onReady={onPdfReady} />
                <p className="no-print mt-3 text-center text-xs text-stone-500">
                  This is the actual PDF, including its page breaks. Downloads
                  use the same document.
                </p>
              </div>
            )}
            {view === "preview" && (
              <aside className="no-print space-y-5 rounded-xl border border-stone-200 bg-white p-5">
                <h2>
                  {readiness.length
                    ? "A few details to complete"
                    : "Ready for your client?"}
                </h2>
                <p className="text-stone-500">
                  {readiness.length
                    ? "You can preview your draft now. Complete the required details before downloading or printing."
                    : "Review your details, then download a PDF or print your quotation."}
                </p>
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={exporting}
                  onClick={() => void exportPdf()}
                >
                  {exporting ? "Preparing…" : "↓ Download PDF"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    const issues = exportErrors(quote);
                    if (showIssues(issues)) return;
                    try {
                      const { openPdfForPrint } = await import("@/lib/pdf");
                      const prepared = previewPdf.current;
                      await openPdfForPrint(
                        quote,
                        prepared?.key === JSON.stringify(quote)
                          ? prepared.blob
                          : undefined,
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Could not open the PDF. Download it to print.",
                      );
                    }
                  }}
                >
                  Open PDF to print
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setView("edit")}
                >
                  ← Back to editing
                </Button>
                <div className="border-t border-stone-200 pt-4">
                  <span className="text-xs font-semibold text-stone-700">
                    A note on sharing
                  </span>
                  <p className="mt-2 text-xs text-stone-500">
                    Attach the PDF to your own email or messaging app. Sending,
                    client acceptance, and invoice conversion are not automated.
                  </p>
                </div>
              </aside>
            )}
          </div>
          <footer className="no-print mt-9 flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-5 text-[11px] text-stone-500">
            <span>Made for the work you love.</span>
            <span>No account. No uploads. Your business stays yours.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
