import type { Dispatch, SetStateAction } from "react";
import {
  money,
  newItem,
  starterItems,
  units,
  type Quotation,
  type LineItem,
  type Workspace,
  type Totals,
} from "../../lib/quotation";
import {
  instantiateTemplate,
  packageItem,
  packageTemplates,
} from "../../lib/package-templates";
import Button from "../button";
import ItemDetailEditor from "../item-detail-editor";
import { Field, Section } from "./fields";
import type { EditorProps } from "./types";
import { setNumber } from "./number-input";
import VariationRates from "./variation-rates";

type Props = EditorProps & {
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace | null>>;
  totals: Totals;
  saveTemplate: (item: LineItem) => void;
};

export default function WorkPricingStep({
  quote,
  update,
  errors,
  workspace,
  setWorkspace,
  totals,
  saveTemplate,
}: Props) {
  function updateItem(id: string, patch: Partial<LineItem>) {
    update({
      items: quote.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <>
      {quote.revision && (
        <Section title={`Revision of ${quote.revision.sourceNumber}`}>
          <p>
            The original final total of{" "}
            {money(quote.revision.originalTotal, quote.currency)} is carried
            forward. Enter only additional work below. The final discount /
            adjustment applies after the original total, additional work tax,
            and charges.
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
              if (!e.target.value || quote.items.length >= 100) return;
              const saved = e.target.value.startsWith("saved:")
                ? workspace.templates?.find(
                    (item) => item.id === e.target.value.slice(6),
                  )
                : undefined;
              if (e.target.value.startsWith("saved:") && !saved) return;
              const item = saved
                ? instantiateTemplate(saved)
                : packageItem(e.target.value as keyof typeof packageTemplates);
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
            {Object.entries(packageTemplates).map(([key, template]) => (
              <option key={key} value={key}>
                {template.name}
              </option>
            ))}
          </select>
        </Field>
        {!!workspace.templates?.length && (
          <details className="rounded-lg border border-stone-200 p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Manage saved firm templates ({workspace.templates.length})
            </summary>
            <div className="mt-3 space-y-2">
              {workspace.templates.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs break-words">{item.name}</span>
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
            Start with a work list for {quote.projectType.toLowerCase()}, then
            enter your measured quantities, specifications, and rates. Starter
            lists do not include prices.
          </p>
          <Button
            variant="secondary"
            disabled={quote.projectType === "Other"}
            onClick={() => {
              if (
                quote.items.some(
                  (item) =>
                    item.name ||
                    item.rate ||
                    item.description ||
                    item.room ||
                    item.sku ||
                    item.changes ||
                    item.specifications.length > 0 ||
                    item.section !== "General" ||
                    item.unit !== "nos" ||
                    item.quantity !== "1" ||
                    item.tax !== "0",
                ) &&
                !window.confirm(
                  "Replace the current work items with a starter list? All existing item details, specifications, quantities and pricing will be removed.",
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
                  Work item {index + 1}
                </span>
                <Button
                  variant="ghost"
                  disabled={quote.items.length === 1}
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => {
                    if (
                      (item.name ||
                        item.rate ||
                        item.description ||
                        item.specifications.length ||
                        item.changes) &&
                      !window.confirm(
                        `Remove ${item.name || "this work item"}? Its pricing and specifications will be removed.`,
                      )
                    )
                      return;
                    update({
                      items: quote.items.filter((row) => row.id !== item.id),
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
              <Field
                label="Work item *"
                error={
                  errors.length && !item.name.trim()
                    ? "Enter a work item name."
                    : undefined
                }
              >
                <input
                  value={item.name}
                  maxLength={5000}
                  placeholder="e.g. Vitrified tile flooring"
                  onChange={(e) =>
                    updateItem(item.id, { name: e.target.value })
                  }
                />
              </Field>
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
                <Field
                  label="Quantity *"
                  error={
                    errors.length && Number(item.quantity) <= 0
                      ? "Enter a quantity greater than zero."
                      : undefined
                  }
                >
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
                  error={
                    errors.length && item.rate === ""
                      ? "Enter a rate. Use 0 for work included at no charge."
                      : undefined
                  }
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
              <details className="rounded-lg border border-stone-200 p-3">
                <summary className="min-h-8 cursor-pointer text-sm font-medium text-stone-700">
                  Specifications & optional details
                  {item.specifications.length
                    ? ` (${item.specifications.length} sections)`
                    : ""}
                </summary>
                <div className="mt-4 space-y-4">
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
                </div>
              </details>
            </fieldset>
          ))}
        </div>
        <Button
          variant="secondary"
          className="w-full border-dashed"
          disabled={quote.items.length >= 100}
          onClick={() => update({ items: [...quote.items, newItem()] })}
        >
          + Add work item
        </Button>
        <div className="grid gap-4 border-t border-stone-200 pt-5 sm:grid-cols-2">
          <Field
            label={quote.revision ? "Final adjustment type" : "Discount type"}
          >
            <select
              value={quote.discountType}
              onChange={(e) =>
                update({
                  discountType: e.target.value as Quotation["discountType"],
                  discount: "0",
                })
              }
            >
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed amount ({quote.currency})</option>
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
          <Field label={`Shipping / additional charges (${quote.currency})`}>
            <input
              inputMode="decimal"
              value={quote.shipping}
              onChange={(e) =>
                setNumber(e.target.value, (shipping) => update({ shipping }))
              }
            />
          </Field>
        </div>
        <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
          {quote.revision
            ? "The revision adjustment applies after all carried-forward and added amounts. "
            : "Discounts apply proportionally before item tax. "}
          Additional charges are added after tax and are not taxed. Tax IDs are
          printed as entered; this app does not verify them.
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
      <VariationRates quote={quote} update={update} />
    </>
  );
}
