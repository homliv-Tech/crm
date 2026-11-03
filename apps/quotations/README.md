# Quotient

An architecture, renovation, and building-work quotation generator for individual homeowners and company clients in the CRM Turborepo, inspired by [Invoicely](https://github.com/legions-developer/invoicely) and [Refrens](https://www.refrens.com/free-online-quotation-generator). The implementation is original; no source code was copied from either reference.

## Run

From the repository root:

```bash
bun install
bun run dev:quotations
```

Open http://localhost:3001. `bun run dev` starts both CRM and Quotient, on ports 3000 and 3001 respectively. No environment variables, login, or database are required to make quotations. **Sign in with Homliv CRM** is optional.

```bash
bun run --filter @crm/quotations build
bun run start:quotations
```

## CRM connection

The quotation maker is public and works without an account: enter client details manually, save browser drafts, and export PDFs. **Continue without signing in** leaves all those features available.

Open **Settings → Homliv CRM** in the quotation sidebar. Select **Sign in with Homliv CRM** to open the CRM connection window. Complete CRM sign-in there; the current quotation stays in the maker, and its client/contact/project selectors and **Save to CRM** become available. The sign-in window closes automatically when the connection completes. Client lookups and saves continue in the maker, including after a refresh. **Disconnect CRM** revokes the connection and clears the client list while preserving quotation drafts. The connection expires after seven days, or earlier if your WorkOS session ends or workspace access is removed.

Local development defaults to CRM on `http://localhost:3000` and the public maker on `http://localhost:3001`. For deployment, set `HOMLIV_CRM_URL` in the quotation app before building and `QUOTATIONS_ORIGIN` to the maker's exact origin in the CRM environment (see each app's `.env.example`). Only that configured origin and the actual opener window can receive the short-lived sign-in code. The maker exchanges it once using PKCE, stores an opaque connection token in its own HttpOnly cookie, and calls CRM through its backend. The database stores only token/code hashes. WorkOS cookies and credentials stay on the CRM; every data operation checks the original WorkOS session and current membership. Pop-ups are only needed during sign-in, and guest quotations remain available if they are blocked.

The CRM's own `/quotations` route is also usable without sign-in; its sign-in option returns there after login. Signed-in CRM users can still use **client details → Quotations → Create quotation**. Run `bun run db:migrate` against the configured CRM database before saving quotations there.

Choose a CRM client, then a contact to prefill email/phone and a project to prefill title, site address and scope. Client notes are shown for context. Billing address and tax ID remain editable because CRM does not store those fields. Client selection clears previous recipient details; project and contact prefilling happens only on selection, preserving later manual edits.

**Save to CRM** stores the full quotation under that client. The client record lists its quotation numbers, statuses, totals, validity dates and recipient details; opening one returns to the generator for the full document and PDF. Changes remain local until saved again. Conflicting CRM saves are rejected; export a local backup, delete the local draft, then reopen the newer CRM copy to reconcile changes. If a newer local draft exists, reopening preserves it. Deleting a local draft leaves its CRM copy intact; deleting a CRM client deletes that client's saved quotations.

Signing in from the standalone maker connects its existing browser workspace directly; drafts do not need to move. If you switch between the standalone and CRM-hosted makers, their browser storage stays separate; use **Export backup** and **Import backup** to transfer drafts. Existing backups remain compatible.

## Features

- Individual/homeowner and company client types, with separate billing and project site addresses.
- Renovation, new build, interior fit-out, architectural design, or other project types; schedule, scope, exclusions, and editable payment milestones.
- Room/area grouping, item references, and structured specification sections (each with a heading and bullet lines) beneath each priced package. Agreed client changes have their own field.
- Built-in package templates for kitchens, wardrobes, beds, electrical/lighting and false ceilings. Save up to 50 custom firm templates with your specifications; prices and client changes reset when reused. Templates travel with workspace backups.
- Separate agreed variation rates (including per electrical point); these are reference rates, excluded from the quotation total.
- Linked revisions preserve the preceding quotation's final amount, currency, and scope snapshot. Add new work, then apply a final fixed/percentage adjustment. Source quotations remain separate, and later changes to them do not affect an existing snapshot.
- Indian digit grouping and totals in words (up to 99,99,99,999.99), plus repeated quotation/client/date footers in PDFs.
- Work sections (design, civil works, plumbing, electrical, flooring and more) and units: sq ft, sq m, running ft/m, cu m, nos, lump sum, day, and point. Rates apply to the selected unit; no measurement conversion is performed.
- Starter work lists for each supported project type. These replace existing work items only after confirmation and leave quantities and rates blank for project-specific measurements and pricing. Starter scopes are editable suggestions, not a complete specification or pre-priced estimate.
- Original generic backups remain compatible: missing project fields and unit/section fields receive defaults when loaded. Existing amounts and terms are preserved.

- Editable business/client details, quotation number, issue/validity dates, project title, and manual status.
- Up to 100 quotations with search, duplication, automatic unique numbers within the workspace, and confirmed deletion.
- Up to 100 items per quotation, descriptions, fractional quantities, per-item tax, fixed/percentage discount, and additional charges.
- INR, USD, EUR, GBP, AED, CAD, and AUD. Switching currency changes the label; it does not convert exchange rates.
- PNG/JPEG business logo (500 KB maximum), three document colors, notes, and payment terms.
- The preview displays the actual generated PDF. Preview, download, and the PDF opened for printing use the same renderer and cached document bytes, including the logo above the firm name, typography, project panels, specifications, totals, and page breaks. Rendering stays in the browser; documents are not uploaded. An embedded PDF viewer and a full-document link are provided.
- Browser-local autosave and validated JSON workspace backup/restore. Storage failures are reported, malformed stored drafts are preserved, and changes from other tabs pause saving to avoid silently overwriting their work.

## Working on the code

See [the maintenance guide](ARCHITECTURE.md) for file ownership, common change paths, and behavior to preserve.

## PDF rendering

`components/quotation-pdf.tsx` owns the entire document design in React PDF. `lib/pdf.ts` generates and caches up to two PDFs, serializes rendering jobs, and shares the generated Blob between the preview and download. `components/quotation-document.tsx` debounces edits and displays that Blob in the browser’s PDF viewer; it does not maintain a separate HTML approximation. The **Open PDF to print** action opens the same PDF, where the viewer’s Print action prints its actual pages. Pop-ups must be allowed for that action; downloading and printing from a PDF viewer also works. Native PDF viewer controls vary by browser.

## Calculation rules

Values accept up to nine whole digits and two decimal places. Decimal.js rounds each quantity × rate line to two decimal places, half up. The quotation discount is rounded to two decimals and capped at the subtotal. The app allocates it proportionally across lines using largest remainder allocation so the discount cents add up exactly. Each line's tax applies to its discounted amount and is rounded half up. Total is subtotal minus discount plus tax plus untaxed additional charges.

For a revision, the previous final total is already settled pricing and is not taxed again. New work is priced and taxed separately, and charges are added. The revision's final adjustment (fixed amount or percentage) applies **after tax** to this combined amount, capped at the combined total. For example, 14,69,000 original + 2,27,000 additions − 96,000 adjustment = 16,00,000. Original line rates shown in the reference scope are not added again. Use a fresh quotation or duplicate/edit the full scope when the original work itself must be repriced; the revision flow models additional work and agreed clarifications.

This is a quotation tool, not tax compliance software. Tax IDs are printed as entered; they are not verified. There is no automatic CGST/SGST/IGST split or currency conversion. The PDF embeds regular and bold Noto Sans locally for Latin text and currency symbols. Scripts outside this font’s coverage require a suitable bundled font.

## Storage and scope

Drafts and logos live in this origin's `localStorage`, under `crm-quotations-v1`. They are not sent to the CRM or a server. Anyone with access to this browser profile can access them. Browser storage quotas vary; export JSON backups to keep durable copies or move between devices. Imports replace the entire workspace after confirmation. A backup includes business/client details and logos, so keep it private.

Email delivery, public share links, online acceptance, CRM synchronization, server persistence, and conversion to invoices are outside this version. Status changes are manual and local. PDF and printed output deliberately say "quotation", not "tax invoice".

## Checks

```bash
bun run --filter @crm/quotations test
bun run --filter @crm/quotations typecheck
bun run --filter @crm/quotations lint
bun run --filter @crm/quotations build
```

Tests cover decimal arithmetic, discount allocation, mixed tax rates, dates, required export fields, backup validation, and pagination for a long PDF. Browser interactions and print-dialog behavior require manual verification.
