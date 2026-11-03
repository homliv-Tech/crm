"use client";

import { toast } from "@crm/notifications/toast";
import { useCallback, useRef, useState } from "react";
import QuotationSummary from "./quotation-summary";
import OptionalCrm from "./optional-crm";
import CrmConnection from "./crm-connection";
import Button from "./button";
import WorkspaceSidebar from "./workspace-sidebar";
import { saveableTemplate } from "../lib/package-templates";
import QuotationDocument from "./quotation-document";
import ClientProjectStep from "./editor/client-project-step";
import WorkPricingStep from "./editor/work-pricing-step";
import TermsBrandingStep from "./editor/terms-branding-step";
import { useWorkspace } from "../hooks/use-workspace";
import {
  calculate,
  createQuotation,
  createRevision,
  exportErrors,
  money,
  workSections,
  type LineItem,
  type Quotation,
} from "../lib/quotation";

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
    <svg
      aria-hidden="true"
      viewBox="0 0 28 28"
      fill="none"
      className={small ? "quote-mark small" : "quote-mark"}
    >
      <path d="M5 5h13l5 5v13H5V5Z" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M17 5v6h6M9 15h10M9 19h6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
export default function QuotationApp({
  crmEnabled = false,
  crmUrl,
  signInHref,
}: {
  crmEnabled?: boolean;
  crmUrl?: string;
  signInHref?: string;
}) {
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
        crmVersion: 0,
        number: next.number,
        issued: next.issued,
        validUntil: next.validUntil,
        revision: null,
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
    toast.success(
      copy ? "Quotation duplicated" : "Quotation created",
      copy ? `${current.number} copied to ${next.number}` : next.number,
    );
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
    setMessage((message) =>
      message === "Name this work item before saving it as a template." ||
      message ===
        "You can save up to 50 firm templates. Remove an old template to make room."
        ? ""
        : message,
    );
    toast.success(
      "Work template saved",
      `${item.name} · Available in the package menu.`,
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
      toast.success(
        "Quotation revision created",
        `${next.number} · Based on ${current.number}`,
      );
    } catch (error) {
      toast.error(
        `Could not revise quotation ${current.number}`,
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }
  function removeQuote(id = current.id) {
    const target = currentWorkspace.quotes.find((q) => q.id === id);
    if (!target) return;
    if (
      !window.confirm(
        `Delete ${target.number || "this quotation"} from this browser? This cannot be undone.${crmEnabled || target.crmVersion > 0 ? " A saved CRM copy will remain available in the client record." : " Export a backup first if you need a copy."}`,
      )
    )
      return;
    const remaining = currentWorkspace.quotes.filter((q) => q.id !== id);
    if (!remaining.length)
      remaining.push(createQuotation(currentWorkspace.quotes));
    setWorkspace({
      ...currentWorkspace,
      quotes: remaining,
      activeId:
        currentWorkspace.activeId === id
          ? remaining[0].id
          : currentWorkspace.activeId,
    });
    setErrors([]);
    toast.success(
      "Local quotation draft deleted",
      `${current.number}${crmEnabled || current.crmVersion > 0 ? " · Any saved CRM copy is unchanged." : ""}`,
    );
  }
  async function exportPdf() {
    const issues = exportErrors(current);
    if (showIssues(issues)) return;
    setExporting(true);
    try {
      const { downloadPdf } = await import("../lib/pdf");
      const prepared = previewPdf.current;
      await downloadPdf(
        current,
        prepared?.key === JSON.stringify(current) ? prepared.blob : undefined,
      );
      toast.success("Quotation PDF downloaded", current.number);
    } catch (error) {
      toast.error(
        `Could not export PDF for ${current.number}`,
        error instanceof Error ? error.message : "Try again or use Print.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="quotation-workspace">
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
      <header className="quote-topbar no-print">
        <div className="quote-brand">
          <Mark />
          <span>Quotient</span>
          <span className="quote-byline">by Homliv</span>
        </div>
        <span className="quote-workspace-name">
          Architecture & building quotations
        </span>
        <span className="quote-privacy">Local workspace</span>
      </header>
      {/* 240px navigation + fluid white sheet + 8px inset. Inside the sheet: 24px + editing + 24px gap + 312px ledger + 24px. */}
      <div className="quote-frame print-shell">
        <WorkspaceSidebar
          workspace={workspace}
          onAddQuote={() => addQuote()}
          onDeleteQuote={removeQuote}
          onSelectQuote={(id) => {
            setWorkspace({ ...workspace, activeId: id });
            setErrors([]);
            setStep(0);
            setView("edit");
          }}
          backup={backup}
          importBackup={importBackup}
          settings={
            crmEnabled ? (
              <CrmConnection
                workspace={workspace}
                quote={quote}
                update={update}
                setWorkspace={setWorkspace}
              />
            ) : (
              <OptionalCrm
                crmUrl={crmUrl}
                signInHref={signInHref}
                workspace={workspace}
                quote={quote}
                update={update}
                setWorkspace={setWorkspace}
              />
            )
          }
        />
        <main id="editor" tabIndex={-1} className="quote-sheet print-shell">
          <div className="quote-titlebar no-print">
            <div className="quote-document-title">
              <div className="quote-title-line">
                <h1>Quotation</h1>
                <span className="quote-document-number">
                  {quote.number || "Untitled"}
                </span>
                <span className="quote-status">{quote.status}</span>
              </div>
              <p title={quote.title}>
                {quote.title || "Your next project starts here."}
              </p>
            </div>
            <div className="quote-document-actions">
              <details
                className="quote-actions-menu"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.currentTarget.removeAttribute("open");
                    event.currentTarget.querySelector("summary")?.focus();
                  }
                }}
              >
                <summary>
                  More actions <span aria-hidden="true">⌄</span>
                </summary>
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                      addQuote(true);
                    }}
                  >
                    Duplicate quotation
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                      reviseQuote();
                    }}
                  >
                    Create revision
                  </button>
                  <button
                    type="button"
                    className="quote-delete"
                    onClick={(e) => {
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                      removeQuote();
                    }}
                  >
                    Delete local draft
                  </button>
                </div>
              </details>
              <Button
                variant={view === "edit" ? "primary" : "secondary"}
                onClick={() => setView(view === "edit" ? "preview" : "edit")}
              >
                {view === "edit" ? "Review quotation" : "Back to editor"}
                <span aria-hidden="true">{view === "edit" ? "↗" : "←"}</span>
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
          <nav aria-label="Quotation sections" className="quote-tabs no-print">
            {editorSteps.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-current={
                  view === "edit" && step === index ? "step" : undefined
                }
                onClick={() => goToStep(index)}
              >
                {item.title}
              </button>
            ))}
            <button
              type="button"
              aria-current={view === "preview" ? "step" : undefined}
              onClick={() => setView("preview")}
            >
              PDF preview
            </button>
          </nav>
          <div className="quote-step-context no-print">
            <h2 ref={stepHeading} tabIndex={-1}>
              {view === "edit"
                ? editorSteps[step].title
                : "Review your quotation"}
            </h2>
            <span role="status">
              <span aria-hidden="true" className="quote-save-dot" />
              {saveState}
            </span>
          </div>
          <div className="quote-editor-grid print-shell">
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
                <div className="quote-editor-footer">
                  <Button
                    variant="ghost"
                    disabled={step === 0}
                    onClick={() => goToStep(step - 1)}
                  >
                    ← Back
                  </Button>
                  <span className="quote-footer-total">
                    {money(totals.total, quote.currency)}
                  </span>
                  <Button variant="secondary" type="submit">
                    {step < 2
                      ? `Continue to ${step === 0 ? "pricing" : "terms"}`
                      : "Review quotation"}
                    <span aria-hidden="true">→</span>
                  </Button>
                </div>
              </form>
            )}
            {view === "edit" && (
              <QuotationSummary
                quote={quote}
                issues={readiness}
                onFix={fixIssue}
                onReview={() => setView("preview")}
              />
            )}
            {view === "preview" && (
              <div className="quote-preview-shell print-shell">
                <div className="quote-preview-caption no-print">
                  <span className="text-xs font-medium text-stone-600">
                    PDF document
                  </span>
                  <span className="text-xs text-stone-600">
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
              <aside className="quote-ledger no-print space-y-5">
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
                      const { openPdfForPrint } = await import("../lib/pdf");
                      const prepared = previewPdf.current;
                      await openPdfForPrint(
                        quote,
                        prepared?.key === JSON.stringify(quote)
                          ? prepared.blob
                          : undefined,
                      );
                    } catch (error) {
                      toast.error(
                        `Could not open PDF for ${quote.number}`,
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
        </main>
      </div>
    </div>
  );
}
