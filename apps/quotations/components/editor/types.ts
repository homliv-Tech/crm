import type { Quotation } from "../../lib/quotation";

export type UpdateQuotation = (patch: Partial<Quotation>) => void;

export type EditorProps = {
  quote: Quotation;
  update: UpdateQuotation;
  errors: string[];
};
