import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import type { Quotation } from "@/lib/quotation";
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
        "aria-describedby": error ? errorId : undefined,
      })
    : children;
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-xs font-medium text-stone-600">{label}</span>
      {control}
      {error && (
        <span id={errorId} className="block text-xs leading-5 text-red-700">
          {error}
        </span>
      )}
      {hint && (
        <span className="block text-[11px] leading-5 text-stone-500">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-500">
          {number}
        </span>
        <h2>{title}</h2>
      </div>
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
