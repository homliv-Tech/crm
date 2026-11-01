"use client";

import Button from "@/components/_ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/_ui/sheet";
import { useCompaniesStore } from "@/stores/companies-store";
import { useCrmEditor } from "../crm-editor";
import { money } from "@/lib/crm/format";

export default function CompanyDetail() {
  const state = useCompaniesStore();
  const editor = useCrmEditor();
  const company = state.companies.find((c) => c.id === state.detailId);
  const contacts = state.contacts.filter((c) => c.companyId === company?.id);
  const deals = state.deals.filter((d) => d.companyId === company?.id);
  const tasks = state.tasks.filter((t) => t.companyId === company?.id);
  const activities = state.activities.filter(
    (a) => a.companyId === company?.id,
  );
  return (
    <Sheet
      open={state.detailOpen && !!company}
      onOpenChange={(open) => {
        if (!open) state.closeDetail();
      }}
    >
      <SheetContent side="right" className="sm:w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <div>
            <SheetTitle>{company?.name ?? "Company details"}</SheetTitle>
            <SheetDescription>
              Account, contacts, deals, and activity
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button aria-label="Close company details">Close</Button>
          </SheetClose>
        </SheetHeader>
        {company && (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base">Account</h2>
                <Button
                  onClick={() =>
                    editor({ entity: "companies", record: { ...company } })
                  }
                >
                  Edit company
                </Button>
              </div>
              <p className="text-subtle text-sm">
                {company.owner} · {company.tags.join(" · ")}
              </p>
              {company.website && (
                <a
                  className="mt-2 block text-sm underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={company.website}
                >
                  {company.website}
                </a>
              )}
              {company.description && (
                <p className="mt-3 text-sm whitespace-pre-wrap">
                  {company.description}
                </p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="border-border rounded-lg border p-3">
                  <p className="text-subtle">Pipeline</p>
                  <p className="mt-2">{money(company.pipelineValue)}</p>
                </div>
                <div className="border-border rounded-lg border p-3">
                  <p className="text-subtle">Open deals</p>
                  <p className="mt-2">{company.openDeals}</p>
                </div>
                <div className="border-border rounded-lg border p-3">
                  <p className="text-subtle">Win probability</p>
                  <p className="mt-2">{company.winProbability}%</p>
                </div>
              </div>
            </section>
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base">Contacts</h2>
                <Button
                  onClick={() =>
                    editor({ entity: "contacts", companyId: company.id })
                  }
                >
                  Add contact
                </Button>
              </div>
              {contacts.map((c) => (
                <div
                  className="border-border mb-2 flex items-center justify-between gap-3 rounded-lg border p-3"
                  key={c.id}
                >
                  <div>
                    <p className="text-sm">{c.name}</p>
                    <p className="text-subtle mt-1 text-xs">
                      {c.role}
                      {c.email && (
                        <>
                          {" "}
                          ·{" "}
                          <a className="underline" href={`mailto:${c.email}`}>
                            {c.email}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      editor({ entity: "contacts", record: { ...c } })
                    }
                  >
                    Edit
                  </Button>
                </div>
              ))}
              {!contacts.length && (
                <p className="text-subtle text-sm">No contacts yet.</p>
              )}
            </section>
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base">Deals</h2>
                <Button
                  onClick={() =>
                    editor({ entity: "deals", companyId: company.id })
                  }
                >
                  Add deal
                </Button>
              </div>
              {deals.map((d) => (
                <button
                  className="border-border hover:bg-muted mb-2 block w-full rounded-lg border p-3 text-left"
                  key={d.id}
                  onClick={() => editor({ entity: "deals", record: { ...d } })}
                >
                  <p className="text-sm">{d.title}</p>
                  <p className="text-subtle mt-1 text-xs">
                    {d.stage} · {money(Number(d.value))} · {d.probability}%
                  </p>
                </button>
              ))}
              {!deals.length && (
                <p className="text-subtle text-sm">No deals yet.</p>
              )}
            </section>
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base">Tasks</h2>
                <Button
                  onClick={() =>
                    editor({ entity: "tasks", companyId: company.id })
                  }
                >
                  Add task
                </Button>
              </div>
              {tasks.map((t) => (
                <div
                  className="border-border mb-2 flex items-center gap-3 rounded-lg border p-3"
                  key={t.id}
                >
                  <input
                    aria-label={`Complete ${t.title}`}
                    type="checkbox"
                    checked={t.completed}
                    disabled={state.saving}
                    onChange={(e) =>
                      void state.mutate("tasks", "PATCH", {
                        ...t,
                        completed: e.target.checked,
                      })
                    }
                  />
                  <button
                    className="flex-1 text-left text-sm"
                    onClick={() =>
                      editor({ entity: "tasks", record: { ...t } })
                    }
                  >
                    <span className={t.completed ? "line-through" : ""}>
                      {t.title}
                    </span>
                    <span className="text-subtle mt-1 block text-xs">
                      Due {t.dueDate} · {t.owner}
                    </span>
                  </button>
                </div>
              ))}
              {!tasks.length && (
                <p className="text-subtle text-sm">No tasks yet.</p>
              )}
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base">Activity</h2>
                <Button
                  onClick={() =>
                    editor({ entity: "activities", companyId: company.id })
                  }
                >
                  Log activity
                </Button>
              </div>
              {activities.map((a) => (
                <button
                  className="border-border hover:bg-muted mb-2 block w-full rounded-lg border p-3 text-left"
                  key={a.id}
                  onClick={() =>
                    editor({ entity: "activities", record: { ...a } })
                  }
                >
                  <p className="text-subtle text-xs">
                    {a.type} · {new Date(a.occurredAt).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{a.body}</p>
                </button>
              ))}
              {!activities.length && (
                <p className="text-subtle text-sm">No activity logged yet.</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
