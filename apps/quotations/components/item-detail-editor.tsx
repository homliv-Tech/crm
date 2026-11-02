import Button from "./button";
import type { LineItem } from "@/lib/quotation";

export default function ItemDetailEditor({
  item,
  onChange,
}: {
  item: LineItem;
  onChange: (patch: Partial<LineItem>) => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-xs font-medium text-stone-600">
          Room / area
          <input
            value={item.room}
            maxLength={5000}
            placeholder="e.g. Master bedroom"
            onChange={(e) => onChange({ room: e.target.value })}
          />
        </label>
        <label className="block space-y-1.5 text-xs font-medium text-stone-600">
          Item reference / SKU
          <input
            value={item.sku}
            maxLength={5000}
            placeholder="Optional reference code"
            onChange={(e) => onChange({ sku: e.target.value })}
          />
        </label>
      </div>
      <div className="space-y-4">
        {item.specifications.map((spec, index) => (
          <fieldset
            key={spec.id}
            className="min-w-0 space-y-3 rounded-lg border border-stone-200 bg-white p-3"
          >
            <legend className="sr-only">Specification {index + 1}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-stone-600">
                Specification {index + 1}
              </span>
              <Button
                variant="ghost"
                aria-label={`Remove specification ${index + 1}`}
                onClick={() => {
                  if (
                    (spec.heading || spec.body) &&
                    !window.confirm(
                      `Remove ${spec.heading || "this specification"}?`,
                    )
                  )
                    return;
                  onChange({
                    specifications: item.specifications.filter(
                      (s) => s.id !== spec.id,
                    ),
                  });
                }}
              >
                Remove section
              </Button>
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-stone-600">
              Heading
              <input
                value={spec.heading}
                maxLength={200}
                placeholder="e.g. Material specification"
                onChange={(e) =>
                  onChange({
                    specifications: item.specifications.map((s) =>
                      s.id === spec.id ? { ...s, heading: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium text-stone-600">
              Details · one bullet per line
              <textarea
                rows={4}
                value={spec.body}
                maxLength={5000}
                placeholder={
                  "Carcass: specify plywood brand, grade and thickness\nShutters: specify material and finish\nHardware: specify brand and included fittings"
                }
                onChange={(e) =>
                  onChange({
                    specifications: item.specifications.map((s) =>
                      s.id === spec.id ? { ...s, body: e.target.value } : s,
                    ),
                  })
                }
              />
            </label>
          </fieldset>
        ))}
      </div>
      <Button
        variant="secondary"
        disabled={item.specifications.length >= 20}
        onClick={() =>
          onChange({
            specifications: [
              ...item.specifications,
              { id: crypto.randomUUID(), heading: "", body: "" },
            ],
          })
        }
      >
        + Add specification section
      </Button>
      <label className="block space-y-1.5 text-xs font-medium text-stone-600">
        Agreed changes / client clarifications
        <textarea
          rows={3}
          value={item.changes}
          maxLength={5000}
          placeholder="Record the final agreed selection, included additions, removed work, and any price or schedule implications."
          onChange={(e) => onChange({ changes: e.target.value })}
        />
      </label>
    </div>
  );
}
