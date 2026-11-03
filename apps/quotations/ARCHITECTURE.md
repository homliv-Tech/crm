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

## CRM integration

The workspace package exports `@crm/quotations/app` and `@crm/quotations/quotation`. Internal imports use relative paths so both Next apps resolve the same components and schemas without relying on the consuming app's `@/` alias. The public CRM `/quotations` page enables `CrmConnection` for authenticated members and offers optional sign-in for guests. The standalone page renders `OptionalCrm`, which uses a CRM popup only to complete sign-in, without moving browser drafts.

`components/optional-crm.tsx` receives the authenticated popup’s short-lived code, exchanges it through the maker’s own `/api/crm/connect`, and closes the popup. `lib/crm-session.ts` owns the PKCE proof and opaque connection cookie; both are HttpOnly. Subsequent operations use the maker backend, so neither an open popup nor cross-site cookies are needed. Refresh restores the cookie connection. `lib/crm-bridge.ts` defines the validated operation allowlist and the strict origin/window checks used only for the sign-in handoff.

The CRM `/api/quotation-connection/[action]` handlers persist code and token hashes in `quotation_connections`. Exchange atomically consumes a two-minute code only with the correct PKCE verifier and configured maker origin. Connection tokens expire in seven days. Each data operation verifies the originating WorkOS session and current organization membership before calling the existing quotation handlers or snapshot loader. A viewer demotion prevents writes while retaining reads. Disconnect deletes the grant and maker cookie; expired/revoked membership clears the cookie and client list. Transport failures preserve the connection for retry. `HOMLIV_CRM_URL` and `QUOTATIONS_ORIGIN` must identify the two apps; their production settings have no localhost fallback.

`components/crm-connection.tsx` loads the authorized CRM snapshot, prefills selected records, and explicitly saves/opens documents through `/api/quotations`. `crmVersion` is a concurrency token, reset for duplicates and revisions. CRM `lib/crm/quotation-handlers.ts` validates documents and client/contact/project relationships, enforces permissions and origins, and saves using compare-and-update versions. `quotations.document` preserves the full document rather than altering project fees or delivery progress. Client details load saved quotations independently of the existing CRM snapshot.

The CRM route has scoped styles, Tailwind sources for this package, and local PDF fonts in its public directory. Keep those font copies consistent with this app when updating them.

## Editor UX

The editor uses a framed sheet around document tabs and a client-first form. `components/quotation-summary.tsx` renders a live ledger from the same calculation functions as PDF export; readiness actions navigate to missing fields. Draft creation and lookup live in the workspace sidebar, with CRM and backup controls under settings disclosures. On phones the workspace folds into one menu and the editing footer retains the live total.

`app/editor.css` owns scoped tokens and editor components. Both apps import it directly (`@crm/quotations/styles` in CRM) so styling stays consistent without duplicating a second stylesheet. PDF document styling remains in the existing PDF renderer. Hidden editor sections stay mounted; changing tabs must not reset values or disclosure state.

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
