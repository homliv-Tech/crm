"use client";

import { toast } from "@crm/notifications/toast";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { clientPatch, crmRequest, type CrmData } from "../lib/crm";
import {
  createQuotation,
  quotationSchema,
  type Quotation,
  type Workspace,
} from "../lib/quotation";
import { Field } from "./editor/fields";
import Button from "./button";
import CrmQuotations from "./crm-quotations";

type Props = {
  request?: typeof crmRequest;
  external?: boolean;
  quote: Quotation;
  workspace: Workspace;
  update: (patch: Partial<Quotation>) => void;
  setWorkspace: Dispatch<SetStateAction<Workspace | null>>;
};

export default function CrmConnection({
  request = crmRequest,
  external = false,
  quote,
  workspace,
  update,
  setWorkspace,
}: Props) {
  const latestWorkspace = useRef(workspace);
  useEffect(() => {
    latestWorkspace.current = workspace;
  }, [workspace]);
  const [data, setData] = useState<CrmData | null>(null);
  const [message, setMessage] = useState("Loading CRM clients…");
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const snapshot: CrmData = await request("/api/crm");
        const params = new URLSearchParams(window.location.search);
        const id = params.get("quotationId");
        let loaded: Quotation | undefined;
        if (id) {
          const result = await request(
            `/api/quotations?id=${encodeURIComponent(id)}`,
          );
          loaded = quotationSchema.parse({
            ...result.quotations[0].document,
            crmVersion: result.quotations[0].version,
          });
        }
        if (!active) return;
        const initial = latestWorkspace.current;
        if (
          initial.quotes.length >= 100 &&
          ((loaded && !initial.quotes.some((q) => q.id === loaded!.id)) ||
            params.has("companyId"))
        )
          throw new Error(
            "Workspace is full. Remove a local draft, then retry opening this quotation or client.",
          );
        setData(snapshot);
        setWorkspace((previous) => {
          if (!previous) return previous;
          if (loaded) {
            const existing = previous.quotes.find((q) => q.id === loaded!.id);
            // Preserve a local draft if it contains edits newer than the saved document.
            const selected =
              existing && existing.updatedAt > loaded.updatedAt
                ? existing
                : loaded;
            if (!existing && previous.quotes.length >= 100) return previous;
            return {
              ...previous,
              activeId: selected.id,
              quotes: [
                selected,
                ...previous.quotes.filter((q) => q.id !== selected.id),
              ],
            };
          }
          const companyId = params.get("companyId");
          if (!companyId) return previous;
          // Start a separate draft so opening a client cannot overwrite another client's work.
          const fresh = createClientQuote(previous, snapshot, companyId);
          return fresh;
        });
        window.history.replaceState(null, "", window.location.pathname);
        setMessage(
          loaded
            ? "Quotation opened. Save to CRM after making changes."
            : "Choose a client to prefill details. Save to CRM when ready.",
        );
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Could not load CRM.",
          );
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [setWorkspace, attempt, request]);

  const link = quote.crm;
  const contacts =
    data?.contacts.filter((c) => c.companyId === link?.companyId) ?? [];
  const projects =
    data?.deals.filter((p) => p.companyId === link?.companyId) ?? [];
  async function save() {
    const toastId = `crm-save:${quote.id}`;
    setBusy(true);
    try {
      const result = await request("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: quote, version: quote.crmVersion }),
      });
      // Only update the saved draft, even if the user switched quotations during the request.
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            quotes: previous.quotes.map((q) =>
              q.id === quote.id
                ? { ...q, crmVersion: result.quotation.version }
                : q,
            ),
          },
      );
      toast.success(
        "Quotation saved to CRM",
        `${quote.number} · Further edits stay local until you save again.`,
        toastId,
      );
    } catch (error) {
      toast.error(
        `Could not save quotation ${quote.number} to CRM`,
        error instanceof Error ? error.message : "Try again.",
        toastId,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4" aria-label="CRM connection">
      {data && (
        <CrmQuotations
          key={link?.companyId ?? "unlinked"}
          companyId={link?.companyId}
          canDelete={data.role !== "viewer"}
          request={request}
          workspace={workspace}
          setWorkspace={setWorkspace}
        />
      )}
      {!external && (
        <Link
          href="/"
          className="inline-flex min-h-9 items-center text-xs text-emerald-800 underline underline-offset-4"
        >
          Open Homliv CRM →
        </Link>
      )}
      {data && (
        <div className="grid min-w-0 gap-4">
          <Field
            label="CRM client"
            hint="Fills the recipient name. Choose a contact for email and phone."
          >
            <select
              disabled={busy}
              value={link?.companyId ?? ""}
              onChange={(e) => update(clientPatch(data, e.target.value))}
            >
              <option value="">Unlinked quotation</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client contact">
            <select
              disabled={!link || busy}
              value={link?.contactId ?? ""}
              onChange={(e) => {
                if (!link) return;
                const contact = contacts.find((c) => c.id === e.target.value);
                update({
                  crm: { ...link, contactId: contact?.id ?? null },
                  to: {
                    ...quote.to,
                    email: contact?.email ?? "",
                    phone: contact?.phone ?? "",
                  },
                });
              }}
            >
              <option value="">Choose contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` · ${c.role}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="CRM project"
            hint="Fills the title, site address and scope."
          >
            <select
              disabled={!link || busy}
              value={link?.projectId ?? ""}
              onChange={(e) => {
                if (!link) return;
                const project = projects.find((p) => p.id === e.target.value);
                update({
                  crm: { ...link, projectId: project?.id ?? null },
                  ...(project
                    ? {
                        title: project.title,
                        siteAddress: project.siteAddress,
                        scope: project.brief,
                      }
                    : {}),
                });
              }}
            >
              <option value="">Choose project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {link &&
        data?.companies.find((c) => c.id === link.companyId)?.description && (
          <p className="text-xs break-words whitespace-pre-wrap text-stone-600">
            {data.companies.find((c) => c.id === link.companyId)?.description}
          </p>
        )}
      <Button
        variant="primary"
        className="w-full text-xs whitespace-normal"
        disabled={!link || busy || !data || data.role === "viewer"}
        onClick={() => void save()}
      >
        {busy ? "Connecting…" : "Save to CRM"}
      </Button>
      <p role="status" className="text-xs break-words text-stone-600">
        {message}
      </p>
      {!data && !busy && (
        <Button
          variant="secondary"
          className="w-full text-xs whitespace-normal"
          onClick={() => {
            setBusy(true);
            setAttempt((n) => n + 1);
          }}
        >
          Retry CRM connection
        </Button>
      )}
      {data?.role === "viewer" && (
        <p className="text-xs break-words text-stone-600">
          Your viewer role can open quotations. Saving to CRM requires a member
          or admin role.
        </p>
      )}
    </section>
  );
}

function createClientQuote(
  workspace: Workspace,
  data: CrmData,
  companyId: string,
): Workspace {
  if (
    !data.companies.some((c) => c.id === companyId) ||
    workspace.quotes.length >= 100
  )
    return workspace;
  const quote = {
    ...createQuotation(workspace.quotes),
    ...clientPatch(data, companyId),
  };
  return {
    ...workspace,
    activeId: quote.id,
    quotes: [quote, ...workspace.quotes],
  };
}
