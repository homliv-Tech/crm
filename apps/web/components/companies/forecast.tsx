"use client";
import { useCompaniesStore } from "@/stores/companies-store";
import { money } from "@/lib/crm/format";

export function Forecast() {
  const deals = useCompaniesStore((s) => s.deals);
  const tasks = useCompaniesStore((s) => s.tasks);
  const open = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
  const pipeline = open.reduce((v, d) => v + Number(d.value), 0);
  const weighted = open.reduce(
    (v, d) => v + (Number(d.value) * d.probability) / 100,
    0,
  );
  const won = deals
    .filter((d) => d.stage === "Won")
    .reduce((v, d) => v + Number(d.value), 0);
  const stages = ["Discovery", "Qualified", "Proposal", "Negotiation"];
  const values = stages.map((s) =>
    open.filter((d) => d.stage === s).reduce((v, d) => v + Number(d.value), 0),
  );
  const max = Math.max(...values, 1);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <p className="text-subtle mb-6 text-sm">
        Current pipeline across all expected close dates. Weighted forecast is
        deal value × win probability.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Open pipeline", money(pipeline)],
          ["Weighted forecast", money(weighted)],
          ["Won revenue", money(won)],
          [
            "Overdue tasks",
            tasks.filter(
              (t) =>
                !t.completed &&
                t.dueDate < new Date().toISOString().slice(0, 10),
            ).length,
          ],
        ].map(([label, value]) => (
          <div className="border-border rounded-xl border p-5" key={label}>
            <p className="text-subtle mb-3 text-sm">{label}</p>
            <p className="text-2xl font-medium tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="border-border mt-6 rounded-xl border p-5">
        <h2 className="mb-6 text-base">Pipeline by stage</h2>
        <div
          role="img"
          aria-label={stages
            .map((s, i) => `${s}: ${money(values[i])}`)
            .join(", ")}
          className="flex flex-col gap-5"
        >
          {stages.map((s, i) => (
            <div key={s}>
              <div className="mb-2 flex justify-between gap-2 text-sm">
                <span>{s}</span>
                <span>{money(values[i])}</span>
              </div>
              <div className="bg-muted h-5 overflow-hidden rounded">
                <div
                  className="bg-primary h-full rounded"
                  style={{ width: `${(values[i] / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      {!deals.length && (
        <p className="text-subtle mt-6 text-sm">
          Add your first deal to start forecasting.
        </p>
      )}
    </div>
  );
}
