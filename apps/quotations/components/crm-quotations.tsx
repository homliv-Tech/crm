"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import {
  crmRequest,
  deleteCrmQuotation,
  openCrmQuotation,
  type CrmQuotationSummary,
} from "../lib/crm";
import type { Workspace } from "../lib/quotation";
import { resetQuotationCrmVersion } from "../lib/workspace";
import Button from "./button";
import { Field } from "./editor/fields";
import QuotationContextMenu from "./quotation-context-menu";
import type { CrmMutationRunner } from "../lib/crm-mutations";

export default function CrmQuotations({
  request,
  workspace,
  setWorkspace,
  canDelete = true,
  companyId,
  runMutation,
}: {
  request: typeof crmRequest;
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace | null>>;
  canDelete?: boolean;
  companyId?: string;
  runMutation: CrmMutationRunner;
}) {
  const [status, setStatus] = useState("active");
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<CrmQuotationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("");
  const latest = useRef(workspace);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    latest.current = workspace;
  }, [workspace]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    request(
      `/api/quotations?status=${status}&companyId=${encodeURIComponent(companyId)}`,
    )
      .then((result) => {
        if (active) setRows(result.quotations);
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load quotations.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, status, attempt, companyId]);

  async function open(id: string) {
    setOpening(true);
    setMessage("");
    try {
      const result = await request(
        `/api/quotations?id=${encodeURIComponent(id)}`,
      );
      if (!mounted.current) return;
      // Validate capacity and the document before entering the state updater.
      const selected = openCrmQuotation(latest.current, result.quotations[0]);
      // Commit before reporting the result, including any queued workspace edits.
      flushSync(() => {
        setWorkspace((previous) => {
          if (!previous) return previous;
          if (
            previous.quotes.length >= 100 &&
            !previous.quotes.some((q) => q.id === id)
          )
            return previous;
          return openCrmQuotation(previous, result.quotations[0]);
        });
      });
      if (!mounted.current) return;
      if (latest.current.activeId !== selected.activeId) {
        // Re-check committed capacity so a refused open reaches the error path.
        openCrmQuotation(latest.current, result.quotations[0]);
        throw new Error("Could not open quotation. Try again.");
      }
      setMessage("Quotation opened. Newer local edits are preserved.");
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof Error ? error.message : "Could not open quotation.",
        );
    } finally {
      if (mounted.current) setOpening(false);
    }
  }

  async function remove(row: CrmQuotationSummary) {
    await runMutation(async () => {
      if (
        !window.confirm(
          `Delete ${row.number || "this quotation"} from CRM? This cannot be undone. Any local draft in this browser will remain.`,
        )
      )
        return;
      setOpening(true);
      setMessage("");
      try {
        await deleteCrmQuotation(request, row.id);
        // The parent workspace survives this client-specific list unmounting.
        setWorkspace(
          (previous) => previous && resetQuotationCrmVersion(previous, row.id),
        );
        if (!mounted.current) return;
        setRows((previous) => previous.filter((q) => q.id !== row.id));
        setMessage(
          "Deleted from CRM. Any local draft remains in this browser.",
        );
      } catch (error) {
        if (mounted.current)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not delete quotation.",
          );
      } finally {
        if (mounted.current) setOpening(false);
      }
    });
  }

  return (
    <section className="space-y-3" aria-label="CRM quotations">
      <h3 className="text-sm font-medium">CRM quotations</h3>
      <Field label="Load quotations">
        <select
          value={status}
          disabled={opening || !companyId}
          onChange={(event) => {
            setStatus(event.target.value);
            setRows([]);
            setMessage("");
            setLoading(true);
          }}
        >
          <option value="active">Draft & sent</option>
          <option value="Accepted">Approved (Accepted)</option>
          <option value="Declined">Rejected (Declined)</option>
        </select>
      </Field>
      {!companyId ? (
        <p className="text-xs text-stone-600">
          Choose a CRM client to load their quotations.
        </p>
      ) : loading ? (
        <p role="status" className="text-xs text-stone-600">
          Loading quotations…
        </p>
      ) : (
        <>
          {!rows.length && !message && (
            <p className="text-xs text-stone-600">
              No quotations with this status for the selected client.
            </p>
          )}
          <ul
            className="max-h-72 space-y-2 overflow-y-auto"
            aria-label="Saved CRM quotations"
          >
            {rows.map((row) => (
              <li key={row.id}>
                <QuotationContextMenu
                  disabled={opening}
                  actions={[
                    {
                      label: "Delete from CRM",
                      disabled: !canDelete,
                      onSelect: () => void remove(row),
                    },
                  ]}
                >
                  <Button
                    variant="secondary"
                    className="w-full text-left text-xs whitespace-normal"
                    disabled={opening}
                    onClick={() => void open(row.id)}
                  >
                    <span className="block min-w-0 break-words">
                      <span className="block">
                        {row.number || "Unnumbered"} · {row.status}
                      </span>
                      <span className="block">
                        {row.client || "No client name"}
                        {row.title ? ` · ${row.title}` : ""}
                      </span>
                    </span>
                  </Button>
                </QuotationContextMenu>
              </li>
            ))}
          </ul>
        </>
      )}
      {message && (
        <p role="status" className="text-xs break-words text-stone-600">
          {message}
        </p>
      )}
      <Button
        variant="secondary"
        className="w-full text-xs"
        disabled={!companyId || loading || opening}
        onClick={() => {
          setLoading(true);
          setMessage("");
          setAttempt((value) => value + 1);
        }}
      >
        Refresh quotations
      </Button>
    </section>
  );
}
