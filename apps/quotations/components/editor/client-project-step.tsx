import {
  currencies,
  projectTypes,
  quotationSchema,
  statuses,
  type Quotation,
} from "../../lib/quotation";
import { Field, Section, QuotationTextField } from "./fields";
import type { EditorProps } from "./types";

export default function ClientProjectStep({
  quote,
  update,
  errors,
}: EditorProps) {
  return (
    <>
      <Section title="Client & firm">
        <div className="grid gap-6 sm:grid-cols-2">
          {(["to", "from"] as const).map((side) => (
            <div key={side} className="quote-party min-w-0 space-y-4">
              <h4 className="text-sm font-medium text-stone-600">
                {side === "to" ? "Prepared for" : "Prepared by"}
              </h4>
              <Field
                label={side === "to" ? "Client name *" : "Firm name *"}
                error={
                  errors.length && !quote[side].name.trim()
                    ? side === "to"
                      ? "Enter your client's name."
                      : "Enter your firm name."
                    : undefined
                }
              >
                <input
                  value={quote[side].name}
                  maxLength={5000}
                  placeholder={
                    side === "to"
                      ? "Client or company name"
                      : "Your architecture / building firm"
                  }
                  onChange={(e) =>
                    update({ [side]: { ...quote[side], name: e.target.value } })
                  }
                  required
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={quote[side].email}
                  maxLength={5000}
                  placeholder={
                    side === "to"
                      ? "Client email address"
                      : "Your business email"
                  }
                  onChange={(e) =>
                    update({
                      [side]: { ...quote[side], email: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={quote[side].phone}
                  maxLength={5000}
                  placeholder="Include country code"
                  onChange={(e) =>
                    update({
                      [side]: { ...quote[side], phone: e.target.value },
                    })
                  }
                />
              </Field>
              <details className="quote-party-details">
                <summary>
                  Address & tax details <span aria-hidden="true">⌄</span>
                </summary>
                <div className="space-y-4">
                  <Field
                    label={side === "to" ? "Billing address" : "Firm address"}
                  >
                    <textarea
                      rows={3}
                      value={quote[side].address}
                      maxLength={5000}
                      placeholder="Street, city, state, postal code"
                      onChange={(e) =>
                        update({
                          [side]: { ...quote[side], address: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="GSTIN / tax ID">
                    <input
                      value={quote[side].taxId}
                      maxLength={5000}
                      placeholder="Tax registration number"
                      onChange={(e) =>
                        update({
                          [side]: { ...quote[side], taxId: e.target.value },
                        })
                      }
                    />
                  </Field>
                </div>
              </details>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Project details">
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="title"
          label="Project title"
          placeholder="e.g. Apartment renovation · Indiranagar"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project type">
            <select
              value={quote.projectType}
              onChange={(e) =>
                update({
                  projectType: e.target.value as Quotation["projectType"],
                })
              }
            >
              {projectTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Client type">
            <select
              value={quote.clientType}
              onChange={(e) =>
                update({
                  clientType: e.target.value as Quotation["clientType"],
                })
              }
            >
              <option value="Individual">Individual / homeowner</option>
              <option value="Company">Company / organization</option>
            </select>
          </Field>
        </div>
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="siteAddress"
          label="Project site address"
          placeholder="Site address, floor / unit, city and postal code"
          multiline
        />
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="timeline"
          label="Expected duration / schedule"
          placeholder="e.g. 8–10 weeks from site handover"
        />
      </Section>
      <Section title="Quotation details">
        <div className="grid gap-4 sm:grid-cols-2">
          <QuotationTextField
            quote={quote}
            update={update}
            errors={errors}
            fieldKey="number"
            label="Quotation number *"
            placeholder="QT-0001"
          />
          <Field
            label="Currency"
            hint={
              quote.revision
                ? "Revisions keep the original currency."
                : undefined
            }
          >
            <select
              disabled={!!quote.revision}
              value={quote.currency}
              onChange={(e) =>
                update({ currency: e.target.value as Quotation["currency"] })
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
                  quotationSchema.shape.issued.safeParse(e.target.value).success
                )
                  update({ issued: e.target.value });
              }}
              required
            />
          </Field>
          <Field
            label="Valid until *"
            error={
              errors.length && quote.validUntil < quote.issued
                ? "Choose a date on or after the quotation date."
                : undefined
            }
          >
            <input
              type="date"
              value={quote.validUntil}
              min={quote.issued}
              onChange={(e) => {
                if (
                  e.target.value &&
                  quotationSchema.shape.validUntil.safeParse(e.target.value)
                    .success
                )
                  update({ validUntil: e.target.value });
              }}
              required
            />
          </Field>
        </div>
        <Field
          label="Quotation status"
          hint="Update this as the client conversation progresses."
        >
          <select
            value={quote.status}
            onChange={(e) =>
              update({ status: e.target.value as Quotation["status"] })
            }
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </Field>
      </Section>
    </>
  );
}
