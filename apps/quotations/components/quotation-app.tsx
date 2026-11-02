"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Button from "./button";
import ItemDetailEditor from "./item-detail-editor";
import {
  packageItem,
  packageTemplates,
  saveableTemplate,
  instantiateTemplate,
} from "@/lib/package-templates";
import QuotationDocument from "./quotation-document";
import {
  accents,
  projectTypes,
  units,
  workSections,
  starterItems,
  calculate,
  createQuotation,
  createRevision,
  currencies,
  exportErrors,
  money,
  newItem,
  parseWorkspace,
  quotationSchema,
  statuses,
  STORAGE_KEY,
  type LineItem,
  type Quotation,
  type Workspace,
} from "@/lib/quotation";

type FieldProps = { label: string; children: ReactNode; hint?: string };
function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-xs font-medium text-stone-600">{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] leading-5 text-stone-500">
          {hint}
        </span>
      )}
    </label>
  );
}
function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-500">
          {number}
        </span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
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
function downloadFile(content: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function QuotationApp() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [saveState, setSaveState] = useState("Loading drafts…");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [exporting, setExporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef("");
  const previewPdf = useRef<{ blob: Blob; key: string } | null>(null);
  const onPdfReady = useCallback((blob: Blob, key: string) => {
    previewPdf.current = { blob, key };
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setWorkspace(parseWorkspace(stored));
          lastSaved.current = stored;
          setSaveState("Saved in this browser");
        } else {
          const quote = createQuotation();
          setWorkspace({ version: 1, activeId: quote.id, quotes: [quote] });
        }
      } catch {
        setBlocked(true);
        setSaveState("Draft saving unavailable");
        setMessage(
          "Saved drafts could not be opened. Existing storage has been preserved. Download a backup or import a valid backup to recover. You can still edit and export PDFs.",
        );
        const quote = createQuotation();
        setWorkspace({ version: 1, activeId: quote.id, quotes: [quote] });
      }
    });
    const onStorage = (event: StorageEvent) => {
      if (
        (event.key === STORAGE_KEY || event.key === null) &&
        event.newValue !== lastSaved.current
      ) {
        setBlocked(true);
        setSaveState("Saving paused");
        setMessage(
          "Drafts changed in another tab. Export a backup of this tab's edits before reloading to use the latest version.",
        );
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!workspace || blocked) return;
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSaved.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      lastSaved.current = serialized;
      queueMicrotask(() => setSaveState("Saved in this browser"));
    } catch {
      queueMicrotask(() => {
        setSaveState("Not saved — export a backup");
        setMessage(
          "Browser storage is full or unavailable. Export a backup to keep your edits, or remove a large logo and try again.",
        );
      });
    }
  }, [workspace, blocked]);

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
  function updateItem(id: string, patch: Partial<LineItem>) {
    update({
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  }
  function setNumber(
    value: string,
    apply: (value: string) => void,
    percent = false,
  ) {
    if (
      /^(?:\d{1,9}(?:\.\d{0,2})?)?$/.test(value) &&
      (!percent || Number(value) <= 100)
    )
      apply(value);
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
    setErrors(issues);
    if (issues.length) {
      setView("edit");
      return;
    }
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
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 75000000)
        throw new Error("Backup is too large (maximum 75 MB).");
      const imported = parseWorkspace(await file.text());
      if (
        !window.confirm(
          `Replace this workspace with ${imported.quotes.length} imported quotation(s)? Export your current backup first if needed.`,
        )
      )
        return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      lastSaved.current = JSON.stringify(imported);
      setWorkspace(imported);
      setBlocked(false);
      setErrors([]);
      setSaveState("Saved in this browser");
      setMessage("Backup imported successfully.");
    } catch {
      setMessage(
        "Could not import the backup. Choose a valid Quotient JSON backup under 75 MB. Your existing drafts are unchanged.",
      );
    }
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    const quoteId = current.id;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 500000
    ) {
      setMessage("Choose a PNG or JPEG logo smaller than 500 KB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = data;
      });
      update({ logo: data }, quoteId);
    } catch {
      setMessage(
        "This image could not be opened. Choose another PNG or JPEG logo.",
      );
    }
  }
  function backup() {
    downloadFile(
      JSON.stringify(currentWorkspace, null, 2),
      `quotient-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    if (blocked) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) downloadFile(stored, "quotient-original-storage.json");
      } catch {
        setMessage(
          "Current edits were exported. Original browser storage could not be read.",
        );
      }
    }
  }
  const visibleQuotes = workspace.quotes.filter((q) =>
    `${q.number} ${q.to.name} ${q.title}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const field = (
    key:
      | "number"
      | "title"
      | "notes"
      | "terms"
      | "siteAddress"
      | "timeline"
      | "scope"
      | "exclusions"
      | "paymentTerms",
    label: string,
    placeholder: string,
    multiline = false,
  ) => (
    <Field label={label}>
      {multiline ? (
        <textarea
          rows={3}
          value={current[key]}
          maxLength={5000}
          placeholder={placeholder}
          onChange={(e) => update({ [key]: e.target.value })}
        />
      ) : (
        <input
          value={current[key]}
          maxLength={key === "number" ? 100 : 5000}
          placeholder={placeholder}
          onChange={(e) => update({ [key]: e.target.value })}
        />
      )}
    </Field>
  );

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
        <aside className="no-print border-b border-stone-200 bg-[#fbfcfa] p-5 lg:min-h-[calc(100vh-80px)] lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
              Your workspace
            </span>
            <span className="text-xs text-stone-500">
              {workspace.quotes.length}/100
            </span>
          </div>
          <Button
            variant="primary"
            className="mt-5 w-full"
            onClick={() => addQuote()}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>{" "}
            New quotation
          </Button>
          <label className="mt-5 block">
            <span className="sr-only">Search quotations</span>
            <input
              type="search"
              value={query}
              placeholder="Search quotations…"
              onChange={(e) => setQuery(e.target.value)}
              className="bg-white text-xs"
            />
          </label>
          <nav
            aria-label="Saved quotations"
            className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-420px)]"
          >
            {visibleQuotes.length ? (
              visibleQuotes.map((q) => (
                <Button
                  key={q.id}
                  variant="ghost"
                  aria-current={q.id === quote.id ? "page" : undefined}
                  onClick={() => {
                    setWorkspace({ ...workspace, activeId: q.id });
                    setErrors([]);
                  }}
                  className={`w-full justify-start p-3 text-left whitespace-normal ${q.id === quote.id ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-transparent"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs font-semibold break-all">
                        {q.number || "Unnumbered"}
                      </span>
                      <span className="text-[10px] font-normal text-stone-600">
                        {q.status}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] font-normal break-words text-stone-600">
                      {q.to.name || "No client yet"}
                    </span>
                  </span>
                </Button>
              ))
            ) : (
              <p className="px-3 py-5 text-stone-500">
                No matching quotations.
              </p>
            )}
          </nav>
          <div className="mt-8 space-y-2 border-t border-stone-200 pt-5">
            <Button
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={backup}
            >
              ↓ Export workspace backup
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={() => importInput.current?.click()}
            >
              ↑ Import backup
            </Button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import workspace backup"
              onChange={(e) => {
                void importBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="px-3 pt-2 text-xs text-stone-500">
              Drafts stay in this browser. Export a backup before clearing
              browser data or moving devices.
            </p>
          </div>
        </aside>
        <main id="editor" className="print-shell min-w-0 p-5 sm:p-8">
          <div className="no-print mb-7 flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-emerald-800 uppercase">
                From first survey to final finish
              </div>
              <h1>Quotation generator</h1>
              <p className="mt-2 text-stone-500">
                Prepare clear project quotations for homeowners and businesses.
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
                variant="primary"
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
              className="no-print mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <div className="font-semibold">A few details are missing</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div
              className="flex gap-1 rounded-lg bg-stone-200/60 p-1"
              aria-label="Workspace view"
            >
              <Button
                variant="ghost"
                aria-pressed={view === "edit"}
                className={view === "edit" ? "bg-white shadow-sm" : ""}
                onClick={() => setView("edit")}
              >
                1. Edit quotation
              </Button>
              <Button
                variant="ghost"
                aria-pressed={view === "preview"}
                className={view === "preview" ? "bg-white shadow-sm" : ""}
                onClick={() => setView("preview")}
              >
                2. Preview & export
              </Button>
            </div>
            <span role="status" className="text-xs text-stone-500">
              {saveState}
            </span>
          </div>
          <div
            className={`print-shell grid items-start gap-7 ${view === "edit" ? "2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]" : "lg:grid-cols-[minmax(0,1fr)_260px]"}`}
          >
            {view === "edit" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setView("preview");
                }}
                className="no-print min-w-0 space-y-5"
              >
                <Section number="01" title="The essentials">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {field("number", "Quotation number *", "QT-0001")}
                    <Field label="Currency">
                      <select
                        disabled={!!quote.revision}
                        value={quote.currency}
                        onChange={(e) =>
                          update({
                            currency: e.target.value as Quotation["currency"],
                          })
                        }
                      >
                        {currencies.map((currency) => (
                          <option key={currency}>{currency}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Quotation date *">
                      <input
                        type="date"
                        value={quote.issued}
                        onChange={(e) => {
                          if (
                            e.target.value &&
                            quotationSchema.shape.issued.safeParse(
                              e.target.value,
                            ).success
                          )
                            update({ issued: e.target.value });
                        }}
                        required
                      />
                    </Field>
                    <Field label="Valid until *">
                      <input
                        type="date"
                        value={quote.validUntil}
                        min={quote.issued}
                        onChange={(e) => {
                          if (
                            e.target.value &&
                            quotationSchema.shape.validUntil.safeParse(
                              e.target.value,
                            ).success
                          )
                            update({ validUntil: e.target.value });
                        }}
                        required
                      />
                    </Field>
                  </div>
                  {field(
                    "title",
                    "Project / quotation title",
                    "e.g. Apartment renovation · Indiranagar",
                  )}
                  <Field
                    label="Status"
                    hint="For your records only. Update this manually as the conversation progresses."
                  >
                    <select
                      value={quote.status}
                      onChange={(e) =>
                        update({
                          status: e.target.value as Quotation["status"],
                        })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </Field>
                </Section>
                <Section number="02" title="Client & project site">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Client type">
                      <select
                        value={quote.clientType}
                        onChange={(e) =>
                          update({
                            clientType: e.target
                              .value as Quotation["clientType"],
                          })
                        }
                      >
                        <option value="Individual">
                          Individual / homeowner
                        </option>
                        <option value="Company">Company / organization</option>
                      </select>
                    </Field>
                    <Field label="Project type">
                      <select
                        value={quote.projectType}
                        onChange={(e) =>
                          update({
                            projectType: e.target
                              .value as Quotation["projectType"],
                          })
                        }
                      >
                        {projectTypes.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {field(
                    "siteAddress",
                    "Project site address",
                    "Site address, floor / unit, city and postal code",
                    true,
                  )}
                  {field(
                    "timeline",
                    "Expected duration / schedule",
                    "e.g. 8–10 weeks from site handover, subject to approvals",
                  )}

                  <div className="grid gap-6 sm:grid-cols-2">
                    {(["from", "to"] as const).map((side) => (
                      <div key={side} className="min-w-0 space-y-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full ${side === "from" ? "bg-emerald-700" : "bg-stone-400"}`}
                          />
                          <h3>
                            {side === "from"
                              ? "From · Your firm"
                              : "To · Your client"}
                          </h3>
                        </div>
                        <Field
                          label={
                            side === "from"
                              ? "Firm name *"
                              : quote.clientType === "Individual"
                                ? "Client full name *"
                                : "Company name *"
                          }
                        >
                          <input
                            value={quote[side].name}
                            maxLength={5000}
                            placeholder={
                              side === "from"
                                ? "Your architecture / building firm"
                                : quote.clientType === "Individual"
                                  ? "Homeowner’s full name"
                                  : "Client’s registered company name"
                            }
                            onChange={(e) =>
                              update({
                                [side]: {
                                  ...quote[side],
                                  name: e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="Email">
                          <input
                            type="email"
                            value={quote[side].email}
                            maxLength={5000}
                            placeholder="hello@company.com"
                            onChange={(e) =>
                              update({
                                [side]: {
                                  ...quote[side],
                                  email: e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="Phone">
                          <input
                            type="tel"
                            value={quote[side].phone}
                            maxLength={5000}
                            placeholder="Phone number with country code"
                            onChange={(e) =>
                              update({
                                [side]: {
                                  ...quote[side],
                                  phone: e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field
                          label={
                            side === "from" ? "Firm address" : "Billing address"
                          }
                        >
                          <textarea
                            rows={3}
                            value={quote[side].address}
                            maxLength={5000}
                            placeholder="Street, city, state, postal code"
                            onChange={(e) =>
                              update({
                                [side]: {
                                  ...quote[side],
                                  address: e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="GSTIN / tax ID (optional)">
                          <input
                            value={quote[side].taxId}
                            maxLength={5000}
                            placeholder="Tax registration number"
                            onChange={(e) =>
                              update({
                                [side]: {
                                  ...quote[side],
                                  taxId: e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                      </div>
                    ))}
                  </div>
                </Section>
                {quote.revision && (
                  <Section
                    number="R"
                    title={`Revision of ${quote.revision.sourceNumber}`}
                  >
                    <p>
                      The original final total of{" "}
                      {money(quote.revision.originalTotal, quote.currency)} is
                      carried forward. Enter only additional work below. The
                      final discount / adjustment applies after the original
                      total, additional work tax, and charges.
                    </p>
                    <details className="rounded-lg border border-stone-200 p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        View preserved original scope (
                        {quote.revision.originalItems.length} items)
                      </summary>
                      <div className="mt-3 space-y-2 text-xs">
                        {quote.revision.originalItems.map((item, index) => (
                          <div key={`${item.id}-${index}`}>
                            {item.room && `${item.room} · `}
                            {item.name} — {item.quantity} {item.unit}
                          </div>
                        ))}
                      </div>
                    </details>
                  </Section>
                )}
                <Section
                  number="03"
                  title={
                    quote.revision
                      ? "Additional work & packages"
                      : "Bill of quantities & work items"
                  }
                >
                  <Field
                    label="Add a package template"
                    hint="Includes editable specification headings. Enter your firm's materials, selections and price; remove unused sections."
                  >
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value || quote.items.length >= 100)
                          return;
                        const saved = e.target.value.startsWith("saved:")
                          ? currentWorkspace.templates?.find(
                              (item) => item.id === e.target.value.slice(6),
                            )
                          : undefined;
                        if (e.target.value.startsWith("saved:") && !saved)
                          return;
                        const item = saved
                          ? instantiateTemplate(saved)
                          : packageItem(
                              e.target.value as keyof typeof packageTemplates,
                            );
                        const empty =
                          quote.items.length === 1 &&
                          !quote.items[0].name &&
                          !quote.items[0].rate &&
                          !quote.items[0].description &&
                          !quote.items[0].specifications.length &&
                          !quote.items[0].room &&
                          !quote.items[0].sku &&
                          !quote.items[0].changes &&
                          (quote.items[0].quantity === "1" ||
                            quote.items[0].quantity === "");
                        update({
                          items: empty ? [item] : [...quote.items, item],
                        });
                      }}
                      disabled={quote.items.length >= 100}
                    >
                      <option value="">Choose a package…</option>
                      {(workspace.templates || []).map((item) => (
                        <option key={item.id} value={`saved:${item.id}`}>
                          My firm · {item.name}
                        </option>
                      ))}
                      {Object.entries(packageTemplates).map(
                        ([key, template]) => (
                          <option key={key} value={key}>
                            {template.name}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  {!!workspace.templates?.length && (
                    <details className="rounded-lg border border-stone-200 p-3">
                      <summary className="cursor-pointer text-xs font-medium">
                        Manage saved firm templates (
                        {workspace.templates.length})
                      </summary>
                      <div className="mt-3 space-y-2">
                        {workspace.templates.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-xs break-words">
                              {item.name}
                            </span>
                            <Button
                              variant="ghost"
                              aria-label={`Delete template ${item.name}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete saved template ${item.name}? Existing quotation items will be kept.`,
                                  )
                                )
                                  setWorkspace({
                                    ...workspace,
                                    templates: workspace.templates?.filter(
                                      (template) => template.id !== item.id,
                                    ),
                                  });
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <div className="space-y-3 rounded-lg bg-stone-50 p-4">
                    <p className="text-stone-600">
                      Start with a work list for{" "}
                      {quote.projectType.toLowerCase()}, then enter your
                      measured quantities, specifications, and rates. Starter
                      lists do not include prices.
                    </p>
                    <Button
                      variant="secondary"
                      disabled={quote.projectType === "Other"}
                      onClick={() => {
                        if (
                          quote.items.some(
                            (item) =>
                              item.name || item.rate || item.description,
                          ) &&
                          !window.confirm(
                            "Replace the current work items with a starter list? Existing quantities, rates and descriptions will be removed.",
                          )
                        )
                          return;
                        const items = starterItems(quote.projectType);
                        if (items.length) update({ items });
                      }}
                    >
                      Use {quote.projectType.toLowerCase()} starter list
                    </Button>
                  </div>

                  <div className="divide-y divide-stone-200">
                    {quote.items.map((item, index) => (
                      <fieldset
                        key={item.id}
                        className="min-w-0 space-y-3 py-5 first:pt-0"
                      >
                        <legend className="sr-only">Item {index + 1}</legend>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-stone-500">
                            ITEM {String(index + 1).padStart(2, "0")}
                          </span>
                          <Button
                            variant="ghost"
                            disabled={quote.items.length === 1}
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() => {
                              if (
                                item.name &&
                                !window.confirm(`Remove ${item.name}?`)
                              )
                                return;
                              update({
                                items: quote.items.filter(
                                  (row) => row.id !== item.id,
                                ),
                              });
                            }}
                            className="text-xs"
                          >
                            Remove
                          </Button>
                        </div>
                        <Field label="Work section">
                          <input
                            list="work-sections"
                            value={item.section}
                            maxLength={5000}
                            placeholder="e.g. Civil works"
                            onChange={(e) =>
                              updateItem(item.id, { section: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Work item *">
                          <input
                            value={item.name}
                            maxLength={5000}
                            placeholder="e.g. Vitrified tile flooring"
                            onChange={(e) =>
                              updateItem(item.id, { name: e.target.value })
                            }
                          />
                        </Field>
                        <Button
                          variant="secondary"
                          onClick={() => saveTemplate(item)}
                        >
                          Save as firm template
                        </Button>
                        <ItemDetailEditor
                          item={item}
                          onChange={(patch) => updateItem(item.id, patch)}
                        />
                        <Field label="Overview / inclusions">
                          <textarea
                            rows={2}
                            value={item.description}
                            maxLength={5000}
                            placeholder="Material, brand / grade, dimensions, location, and whether labour and supply are included…"
                            onChange={(e) =>
                              updateItem(item.id, {
                                description: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <Field label="Unit">
                            <select
                              value={item.unit}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  unit: e.target.value as LineItem["unit"],
                                })
                              }
                            >
                              {units.map((unit) => (
                                <option key={unit}>{unit}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Quantity *">
                            <input
                              inputMode="decimal"
                              value={item.quantity}
                              placeholder="1"
                              onChange={(e) =>
                                setNumber(e.target.value, (quantity) =>
                                  updateItem(item.id, { quantity }),
                                )
                              }
                            />
                          </Field>
                          <Field
                            label={`Rate / ${item.unit} (${quote.currency}) *`}
                          >
                            <input
                              inputMode="decimal"
                              value={item.rate}
                              placeholder="0.00"
                              onChange={(e) =>
                                setNumber(e.target.value, (rate) =>
                                  updateItem(item.id, { rate }),
                                )
                              }
                            />
                          </Field>
                          <Field label="Tax (%)">
                            <input
                              inputMode="decimal"
                              value={item.tax}
                              placeholder="0"
                              onChange={(e) =>
                                setNumber(
                                  e.target.value,
                                  (tax) => updateItem(item.id, { tax }),
                                  true,
                                )
                              }
                            />
                          </Field>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-stone-600">
                              Amount
                            </span>
                            <div className="mt-1.5 py-2.5 text-sm font-semibold break-all tabular-nums">
                              {money(totals.rows[index].amount, quote.currency)}
                            </div>
                          </div>
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full border-dashed"
                    disabled={quote.items.length >= 100}
                    onClick={() =>
                      update({ items: [...quote.items, newItem()] })
                    }
                  >
                    + Add work item
                  </Button>
                  <div className="grid gap-4 border-t border-stone-200 pt-5 sm:grid-cols-2">
                    <Field
                      label={
                        quote.revision
                          ? "Final adjustment type"
                          : "Discount type"
                      }
                    >
                      <select
                        value={quote.discountType}
                        onChange={(e) =>
                          update({
                            discountType: e.target
                              .value as Quotation["discountType"],
                            discount: "0",
                          })
                        }
                      >
                        <option value="percent">Percentage (%)</option>
                        <option value="fixed">
                          Fixed amount ({quote.currency})
                        </option>
                      </select>
                    </Field>
                    <Field
                      label={`${quote.revision ? "Final adjustment" : "Discount"} (${quote.discountType === "percent" ? "%" : quote.currency})`}
                    >
                      <input
                        inputMode="decimal"
                        value={quote.discount}
                        onChange={(e) =>
                          setNumber(
                            e.target.value,
                            (discount) => update({ discount }),
                            quote.discountType === "percent",
                          )
                        }
                      />
                    </Field>
                    <Field
                      label={`Shipping / additional charges (${quote.currency})`}
                    >
                      <input
                        inputMode="decimal"
                        value={quote.shipping}
                        onChange={(e) =>
                          setNumber(e.target.value, (shipping) =>
                            update({ shipping }),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
                    {quote.revision
                      ? "The revision adjustment applies after all carried-forward and added amounts. "
                      : "Discounts apply proportionally before item tax. "}
                    Additional charges are added after tax and are not taxed.
                    Tax IDs are printed as entered; this app does not verify
                    them.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-4 text-emerald-900">
                    <span className="text-sm font-medium">
                      Quotation total{" "}
                      <span className="font-normal">({quote.currency})</span>
                    </span>
                    <span className="text-xl font-semibold break-all tabular-nums">
                      {money(totals.total, quote.currency)}
                    </span>
                  </div>
                </Section>
                <Section number="V" title="Rates for additional / changed work">
                  <p className="text-stone-500">
                    Record agreed rates for future additions, such as furniture
                    per sq ft or electrical work per point. These rates do not
                    add to the current total.
                  </p>
                  <div className="space-y-4">
                    {quote.variationRates.map((rate, index) => (
                      <fieldset
                        key={rate.id}
                        className="space-y-3 rounded-lg border border-stone-200 p-4"
                      >
                        <legend className="sr-only">
                          Variation rate {index + 1}
                        </legend>
                        <Field label="Work / rate description">
                          <input
                            value={rate.name}
                            maxLength={5000}
                            placeholder="e.g. Additional furniture"
                            onChange={(e) =>
                              update({
                                variationRates: quote.variationRates.map((r) =>
                                  r.id === rate.id
                                    ? { ...r, name: e.target.value }
                                    : r,
                                ),
                              })
                            }
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Unit">
                            <select
                              value={rate.unit}
                              onChange={(e) =>
                                update({
                                  variationRates: quote.variationRates.map(
                                    (r) =>
                                      r.id === rate.id
                                        ? {
                                            ...r,
                                            unit: e.target
                                              .value as LineItem["unit"],
                                          }
                                        : r,
                                  ),
                                })
                              }
                            >
                              {units.map((unit) => (
                                <option key={unit}>{unit}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label={`Rate (${quote.currency})`}>
                            <input
                              inputMode="decimal"
                              value={rate.rate}
                              placeholder="0.00"
                              onChange={(e) =>
                                setNumber(e.target.value, (value) =>
                                  update({
                                    variationRates: quote.variationRates.map(
                                      (r) =>
                                        r.id === rate.id
                                          ? { ...r, rate: value }
                                          : r,
                                    ),
                                  }),
                                )
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Conditions / inclusions">
                          <textarea
                            rows={2}
                            value={rate.notes}
                            maxLength={5000}
                            placeholder="What the rate covers, measurement basis, and approval requirements"
                            onChange={(e) =>
                              update({
                                variationRates: quote.variationRates.map((r) =>
                                  r.id === rate.id
                                    ? { ...r, notes: e.target.value }
                                    : r,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (
                              (rate.name || rate.rate || rate.notes) &&
                              !window.confirm("Remove this variation rate?")
                            )
                              return;
                            update({
                              variationRates: quote.variationRates.filter(
                                (r) => r.id !== rate.id,
                              ),
                            });
                          }}
                        >
                          Remove rate
                        </Button>
                      </fieldset>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={quote.variationRates.length >= 30}
                    onClick={() =>
                      update({
                        variationRates: [
                          ...quote.variationRates,
                          {
                            id: crypto.randomUUID(),
                            name: "",
                            unit: "sq ft",
                            rate: "",
                            notes: "",
                          },
                        ],
                      })
                    }
                  >
                    + Add variation rate
                  </Button>
                </Section>
                <Section number="04" title="Scope, exclusions & payment">
                  {field(
                    "scope",
                    "Scope of work",
                    "Areas covered, drawings referenced, materials and labour included, site supervision…",
                    true,
                  )}
                  {field(
                    "exclusions",
                    "Exclusions & client responsibilities",
                    "e.g. Approval fees, structural alterations, client-supplied fixtures, access and utilities…",
                    true,
                  )}
                  {field(
                    "paymentTerms",
                    "Payment milestones",
                    "Enter agreed milestones, amounts or percentages, and when each payment is due.",
                    true,
                  )}
                  <p className="text-xs text-stone-500">
                    Define the scope and payment schedule for this project. No
                    advance percentage or delivery commitment is assumed.
                  </p>
                </Section>
                <Section number="05" title="Branding & additional details">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-stone-600">
                        Business logo
                      </div>
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => logoInput.current?.click()}
                      >
                        {quote.logo ? "Replace logo" : "+ Upload your logo"}
                      </Button>
                      <input
                        ref={logoInput}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        aria-label="Upload business logo"
                        onChange={(e) => {
                          void uploadLogo(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      <span className="block text-[11px] text-stone-500">
                        PNG or JPEG, up to 500 KB.
                      </span>
                      {quote.logo && (
                        <Button
                          variant="ghost"
                          onClick={() => update({ logo: "" })}
                        >
                          Remove logo
                        </Button>
                      )}
                    </div>
                    <fieldset>
                      <legend className="mb-3 text-xs font-medium text-stone-600">
                        Document color
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(accents).map(([name, color]) => (
                          <label
                            key={name}
                            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-2 text-xs capitalize"
                          >
                            <input
                              type="radio"
                              name="accent"
                              value={name}
                              checked={quote.accent === name}
                              onChange={() =>
                                update({ accent: name as Quotation["accent"] })
                              }
                              className="h-4 w-4 accent-emerald-800"
                            />
                            <span
                              aria-hidden="true"
                              className="size-3 rounded-full"
                              style={{ background: color }}
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  {field(
                    "notes",
                    "Notes",
                    "A personal note for your client…",
                    true,
                  )}
                  {field(
                    "terms",
                    "Terms & conditions",
                    "Quotation validity, variation approvals, warranties, and any other agreed conditions…",
                    true,
                  )}
                </Section>
                <div className="flex flex-wrap justify-between gap-3">
                  <Button variant="danger" onClick={removeQuote}>
                    Delete quotation
                  </Button>
                  <Button variant="primary" onClick={() => setView("preview")}>
                    Preview quotation →
                  </Button>
                </div>
              </form>
            )}
            <div
              className={`print-shell min-w-0 ${view === "edit" ? "hidden 2xl:block" : ""}`}
            >
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
                This is the actual PDF, including its page breaks. Downloads use
                the same document.
              </p>
            </div>
            {view === "preview" && (
              <aside className="no-print space-y-5 rounded-xl border border-stone-200 bg-white p-5">
                <h2>Ready for your client?</h2>
                <p className="text-stone-500">
                  Review your details, then download a PDF or print your
                  quotation.
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
                    setErrors(issues);
                    if (issues.length) return;
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
