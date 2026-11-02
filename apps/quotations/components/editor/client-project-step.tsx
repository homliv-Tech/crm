import {
  currencies,
  projectTypes,
  quotationSchema,
  statuses,
  type Quotation,
} from "@/lib/quotation";
import { Field, Section, QuotationTextField } from "./fields";
import type { EditorProps } from "./types";

export default function ClientProjectStep({
  quote,
  update,
  errors,
}: EditorProps) {
  return (
    <>
      <Section number="01" title="The essentials">
        <div className="grid gap-4 sm:grid-cols-2">
          <QuotationTextField
            quote={quote}
            update={update}
            errors={errors}
            fieldKey="number"
            label="Quotation number *"
            placeholder="QT-0001"
          />
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
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="title"
          label="Project / quotation title"
          placeholder="e.g. Apartment renovation · Indiranagar"
        />
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
                  clientType: e.target.value as Quotation["clientType"],
                })
              }
            >
              <option value="Individual">Individual / homeowner</option>
              <option value="Company">Company / organization</option>
            </select>
          </Field>
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
          placeholder="e.g. 8–10 weeks from site handover, subject to approvals"
        />

        <div className="grid gap-6 sm:grid-cols-2">
          {(["from", "to"] as const).map((side) => (
            <div key={side} className="min-w-0 space-y-4">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${side === "from" ? "bg-emerald-700" : "bg-stone-400"}`}
                />
                <h3>
                  {side === "from" ? "From · Your firm" : "To · Your client"}
                </h3>
              </div>
              <Field
                error={
                  errors.length && !quote[side].name.trim()
                    ? side === "from"
                      ? "Enter your firm name."
                      : "Enter your client’s name."
                    : undefined
                }
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
                label={side === "from" ? "Firm address" : "Billing address"}
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
    </>
  );
}
