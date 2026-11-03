import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import type { Quotation } from "../../lib/quotation";
import type { UpdateQuotation } from "./types";

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
};
export function Field({ label, children, hint, error }: FieldProps) {
  const errorId = useId();
  const control = isValidElement<{
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>(children)
    ? cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [error ? `${errorId}-error` : "", hint ? `${errorId}-hint` : ""]
            .filter(Boolean)
            .join(" ") || undefined,
      })
    : children;
  return (
    <label className="quote-field">
      <span className="quote-field-label">{label}</span>
      {control}
      {error && (
        <span
          id={`${errorId}-error`}
          className="block text-xs leading-5 text-red-700"
        >
          {error}
        </span>
      )}
      {hint && (
        <span id={`${errorId}-hint`} className="quote-field-hint">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="quote-form-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

type TextFieldKey =
  | "number"
  | "title"
  | "notes"
  | "terms"
  | "siteAddress"
  | "timeline"
  | "scope"
  | "exclusions"
  | "paymentTerms";

export function QuotationTextField({
  quote,
  update,
  errors,
  fieldKey: key,
  label,
  placeholder,
  multiline = false,
}: {
  quote: Quotation;
  update: UpdateQuotation;
  errors: string[];
  fieldKey: TextFieldKey;
  label: string;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <Field
      label={label}
      error={
        errors.length && key === "number" && !quote.number.trim()
          ? "Enter a quotation number."
          : undefined
      }
    >
      {multiline ? (
        <textarea
          rows={3}
          value={quote[key]}
          maxLength={5000}
          placeholder={placeholder}
          onChange={(e) => update({ [key]: e.target.value })}
        />
      ) : (
        <input
          value={quote[key]}
          maxLength={key === "number" ? 100 : 5000}
          placeholder={placeholder}
          onChange={(e) => update({ [key]: e.target.value })}
        />
      )}
    </Field>
  );
}
