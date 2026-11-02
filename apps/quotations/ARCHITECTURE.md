# Maintaining Quotient

Start with the responsibility you want to change. Paths below are relative to `apps/quotations`.

| Change | File |
| --- | --- |
| Step navigation, quotation actions, validation summary, PDF actions | `components/quotation-app.tsx` |
| Saved quotation list, search, mobile workspace panel, backup controls | `components/workspace-sidebar.tsx` |
| Browser storage, autosave, cross-tab conflicts, backup import/export | `hooks/use-workspace.ts` |
| Client, firm, dates, project details | `components/editor/client-project-step.tsx` |
| Work items, package selection, discounts, additional charges | `components/editor/work-pricing-step.tsx` |
| Reference rates for future changes | `components/editor/variation-rates.tsx` |
| Scope, terms, logo upload, document color | `components/editor/terms-branding-step.tsx` |
| Form labels, errors, section containers, repeated text inputs | `components/editor/fields.tsx` |
| Numeric input restrictions | `components/editor/number-input.ts` |
| Shared editor prop types | `components/editor/types.ts` |
| Data schemas, defaults, calculations, formatting, revisions | `lib/quotation.ts` |
| Built-in and saved package templates | `lib/package-templates.ts` |
| PDF layout | `components/quotation-pdf.tsx` |
| PDF generation, cache, download and print | `lib/pdf.ts` |
| Debounced PDF preview | `components/quotation-document.tsx` |
| App-wide visual styles | `app/globals.css` |

## Data flow

`app/page.tsx` renders the client entry point, `QuotationApp`. The `useWorkspace` hook owns browser persistence and exposes the workspace and its setter. The app selects the active quotation, calculates totals, and passes data and explicit callbacks to the sidebar and editor screens. Screens own their form controls; quotation changes flow through the app's `update` function, which clears validation errors and updates the quotation timestamp.

The sidebar owns search and expanded/collapsed state. The branding screen owns its file input and image validation. Avoid passing the whole app state to a new component or introducing context for values needed by only one screen.

## Adding or changing a field

1. Update the schema and defaults in `lib/quotation.ts`. Supply defaults for new optional data so older backups still load.
2. Add the control to the relevant editor screen. Use `Field` for labels and validation messages, or `QuotationTextField` for supported quotation text fields. Use `setNumber` for numeric entry.
3. Update the PDF layout if the field belongs in client documents. Keep arithmetic in `calculate`; controls and PDF components consume its results.
4. Extend the relevant tests when data, calculations, backup compatibility, or PDF behavior changes.

## Behavior to preserve

- Editor steps stay mounted inside hidden wrappers while editing, so switching steps preserves input and disclosure state. Keep `quotation-form` and field error attributes intact: issue navigation uses them to focus invalid controls.
- Browser storage keeps the existing `crm-quotations-v1` key and versioned workspace format. Malformed data is preserved; changes from another tab pause saving. Backup import validates and writes storage before replacing the visible workspace. These safeguards belong in `useWorkspace`.
- Logo reads capture the target quotation ID before asynchronous work, so switching quotations during a read cannot attach the logo to another quotation.
- Preview, download, and print share the PDF renderer and cached bytes. Do not implement a separate document layout for preview.
- Revision snapshots are independent of later source edits. Reference variation rates are excluded from totals.

## Verification

From the repository root:

```bash
bun run --filter @crm/quotations test
bun run --filter @crm/quotations typecheck
bun run --filter @crm/quotations lint
bun run --filter @crm/quotations build
```

The tests exercise pricing, backup validation and compatibility, revisions, templates, and PDF rendering. They do not automate browser interactions. For editor or persistence changes, manually check step navigation, saved quotation switching, backup round trips, logo upload, and conflicts between two tabs.
