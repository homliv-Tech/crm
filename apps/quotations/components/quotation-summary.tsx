import {
  calculate,
  money,
  summaryRows,
  type Quotation,
} from "../lib/quotation";
import Button from "./button";

type Props = {
  quote: Quotation;
  issues: string[];
  onFix: (issue: string) => void;
  onReview: () => void;
};
export default function QuotationSummary({
  quote,
  issues,
  onFix,
  onReview,
}: Props) {
  const totals = calculate(quote);
  return (
    <aside className="quote-ledger no-print" aria-label="Quotation summary">
      <div className="quote-ledger-heading">
        <h2>Quotation summary</h2>
        <span>{quote.currency}</span>
      </div>
      <p className="quote-ledger-client">
        {quote.to.name || "Client not added"}
      </p>
      <dl className="quote-ledger-rows">
        {summaryRows(quote).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="quote-ledger-total">
        <span>Quotation total</span>
        <strong>{money(totals.total, quote.currency)}</strong>
        <span>
          {quote.items.length}{" "}
          {quote.items.length === 1 ? "work item" : "work items"} · Includes
          applicable taxes
        </span>
      </div>
      <section className="quote-readiness" aria-label="Download readiness">
        <h3>{issues.length ? "Still to complete" : "Ready for your client"}</h3>
        {issues.length ? (
          <ul>
            {issues.map((issue) => (
              <li key={issue}>
                <button type="button" onClick={() => onFix(issue)}>
                  <span aria-hidden="true">↗</span>
                  {issue}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            All required details are filled in. Review the PDF before sharing.
          </p>
        )}
      </section>
      <Button variant="secondary" className="w-full" onClick={onReview}>
        Preview quotation <span aria-hidden="true">↗</span>
      </Button>
      <p className="quote-local-note">
        Drafts save in this browser. CRM saves are managed in sidebar settings.
      </p>
    </aside>
  );
}
