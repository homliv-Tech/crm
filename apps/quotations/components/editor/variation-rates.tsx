import { units, type LineItem } from "@/lib/quotation";
import Button from "../button";
import { Field, Section } from "./fields";
import type { EditorProps } from "./types";
import { setNumber } from "./number-input";

export default function VariationRates({
  quote,
  update,
}: Omit<EditorProps, "errors">) {
  return (
    <Section number="V" title="Rates for additional / changed work">
      <p className="text-stone-500">
        Record agreed rates for future additions, such as furniture per sq ft or
        electrical work per point. These rates do not add to the current total.
      </p>
      <div className="space-y-4">
        {quote.variationRates.map((rate, index) => (
          <fieldset
            key={rate.id}
            className="space-y-3 rounded-lg border border-stone-200 p-4"
          >
            <legend className="sr-only">Variation rate {index + 1}</legend>
            <Field label="Work / rate description">
              <input
                value={rate.name}
                maxLength={5000}
                placeholder="e.g. Additional furniture"
                onChange={(e) =>
                  update({
                    variationRates: quote.variationRates.map((r) =>
                      r.id === rate.id ? { ...r, name: e.target.value } : r,
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
                      variationRates: quote.variationRates.map((r) =>
                        r.id === rate.id
                          ? {
                              ...r,
                              unit: e.target.value as LineItem["unit"],
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
                        variationRates: quote.variationRates.map((r) =>
                          r.id === rate.id ? { ...r, rate: value } : r,
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
                      r.id === rate.id ? { ...r, notes: e.target.value } : r,
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
  );
}
