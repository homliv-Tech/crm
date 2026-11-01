"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { useCompaniesStore } from "@/stores/companies-store";
import { useCrmEditor, selectClass } from "./crm-editor";
import type { Deal } from "@/lib/crm/types";
import { Forecast } from "./forecast";

import { money } from "@/lib/crm/format";
const stages: Deal["stage"][] = [
  "Discovery",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];

export default function CrmViews() {
  const state = useCompaniesStore();
  const edit = useCrmEditor();
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const tab = state.activeTab;
  const companyName = (id: string) =>
    state.companies.find((c) => c.id === id)?.name ?? "Unknown company";
  const match = (item: { companyId: string }, text: string) =>
    (!companyId || item.companyId === companyId) &&
    `${text} ${companyName(item.companyId)}`
      .toLowerCase()
      .includes(search.toLowerCase());
  if (tab === "forecast") return <Forecast />;
  const entity =
    tab === "deals"
      ? "deals"
      : tab === "contacts"
        ? "contacts"
        : tab === "tasks"
          ? "tasks"
          : "activities";
  const empty = state.companies.length === 0;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-2 text-sm">
          Search
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${entity}…`}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Company
          <select
            className={selectClass}
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">All companies</option>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={empty || state.saving || !state.canWrite}
          variant="primary"
          onClick={() => edit({ entity, companyId: companyId || undefined })}
        >
          {tab === "activities" ? "Log activity" : `New ${entity.slice(0, -1)}`}
        </Button>
      </div>
      {empty && (
        <p className="text-subtle mb-4 text-sm">
          Create a company first to add related records.
        </p>
      )}
      {tab === "deals" && (
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {stages.map((stage) => {
            const deals = state.deals.filter(
              (d) => d.stage === stage && match(d, d.title),
            );
            return (
              <section
                key={stage}
                className="border-border bg-muted/20 rounded-xl border p-3"
              >
                <h2 className="text-sm font-medium">
                  {stage} <span className="text-subtle">{deals.length}</span>
                </h2>
                <p className="text-subtle mt-1 mb-4 text-xs">
                  {money(deals.reduce((v, d) => v + Number(d.value), 0))}
                </p>
                <div className="flex flex-col gap-3">
                  {deals.map((deal) => (
                    <article
                      key={deal.id}
                      className="border-border bg-background rounded-lg border p-3"
                    >
                      <button
                        disabled={!state.canWrite}
                        className="mb-2 text-left text-sm font-medium hover:underline"
                        onClick={() =>
                          edit({ entity: "deals", record: { ...deal } })
                        }
                      >
                        {deal.title}
                      </button>
                      <p className="text-subtle text-xs">
                        {companyName(deal.companyId)}
                      </p>
                      <p className="my-3 text-sm">
                        {money(Number(deal.value))}
                      </p>
                      <p className="text-subtle mb-2 text-xs">
                        {deal.owner} · {deal.probability}%
                        {deal.closeDate && ` · ${deal.closeDate}`}
                      </p>
                      <select
                        aria-label={`Stage for ${deal.title}`}
                        className={selectClass}
                        disabled={state.saving || !state.canWrite}
                        value={deal.stage}
                        onChange={(e) =>
                          void state.mutate("deals", "PATCH", {
                            ...deal,
                            stage: e.target.value,
                          })
                        }
                      >
                        {stages.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </article>
                  ))}
                  {!deals.length && (
                    <p className="text-subtle py-4 text-xs">No deals</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {tab === "contacts" && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                {["Name", "Company", "Email", "Phone", "Role", ""].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.contacts
                .filter((c) => match(c, `${c.name} ${c.email} ${c.role}`))
                .map((c) => (
                  <tr key={c.id} className="border-border border-b">
                    <td className="p-3">{c.name}</td>
                    <td className="p-3">{companyName(c.companyId)}</td>
                    <td className="p-3">
                      {c.email ? (
                        <a className="underline" href={`mailto:${c.email}`}>
                          {c.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">{c.phone || "—"}</td>
                    <td className="p-3">{c.role || "—"}</td>
                    <td className="p-3">
                      <Button
                        disabled={!state.canWrite}
                        onClick={() =>
                          edit({ entity: "contacts", record: { ...c } })
                        }
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!state.contacts.some((c) =>
            match(c, `${c.name} ${c.email} ${c.role}`),
          ) && (
            <Empty text="No contacts found. Add a contact to keep your customer details together." />
          )}
        </div>
      )}
      {tab === "tasks" && (
        <>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show completed tasks
          </label>
          {state.tasks
            .filter(
              (t) =>
                (showCompleted || !t.completed) &&
                match(t, `${t.title} ${t.owner}`),
            )
            .map((t) => (
              <article
                key={t.id}
                className="border-border mb-3 flex items-center gap-3 rounded-xl border p-4"
              >
                <input
                  type="checkbox"
                  aria-label={`Complete ${t.title}`}
                  checked={t.completed}
                  disabled={state.saving || !state.canWrite}
                  onChange={(e) =>
                    void state.mutate("tasks", "PATCH", {
                      ...t,
                      completed: e.target.checked,
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className={t.completed ? "line-through" : ""}>{t.title}</p>
                  <p className="text-subtle mt-1 text-xs">
                    {companyName(t.companyId)} · {t.owner}
                  </p>
                  <p
                    className={`mt-1 text-xs ${!t.completed && t.dueDate < new Date().toISOString().slice(0, 10) ? "text-red-400" : "text-subtle"}`}
                  >
                    Due {t.dueDate}
                  </p>
                </div>
                <Button
                  disabled={!state.canWrite}
                  onClick={() => edit({ entity: "tasks", record: { ...t } })}
                >
                  Edit
                </Button>
              </article>
            ))}
          {!state.tasks.some(
            (t) =>
              (showCompleted || !t.completed) &&
              match(t, `${t.title} ${t.owner}`),
          ) && (
            <Empty text="No tasks found. Add a follow-up and give it a due date." />
          )}
        </>
      )}
      {tab === "activities" && (
        <>
          {state.activities
            .filter((a) => match(a, `${a.type} ${a.body}`))
            .map((a) => (
              <article
                key={a.id}
                className="border-border mb-3 rounded-xl border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {a.type} · {companyName(a.companyId)}
                  </span>
                  <Button
                    disabled={!state.canWrite}
                    onClick={() =>
                      edit({ entity: "activities", record: { ...a } })
                    }
                  >
                    Edit
                  </Button>
                </div>
                <p className="my-3 text-sm whitespace-pre-wrap">{a.body}</p>
                <p className="text-subtle text-xs">
                  {new Date(a.occurredAt).toLocaleString()}
                </p>
              </article>
            ))}
          {!state.activities.some((a) => match(a, `${a.type} ${a.body}`)) && (
            <Empty text="No activity found. Log a note, call, email, or meeting." />
          )}
        </>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-subtle py-12 text-center text-sm">{text}</p>;
}
