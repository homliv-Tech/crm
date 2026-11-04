# Landing enquiry integration

## CRM deployment

Apply the migration with `bun run db:migrate` from the CRM repository root using
the deployment's `DATABASE_URL`. Set server-only `LANDING_ENQUIRY_SECRET` to a
random secret of at least 32 characters in the deployment's secret manager.
Use the identical secret for `CRM_ENQUIRY_SECRET` on the landing server.
Never expose these through `NEXT_PUBLIC_` variables. An unset or short CRM secret
disables imports with HTTP 503. Deploy the CRM before enabling landing delivery.

No production migration or credential configuration was performed by this change.

## Contract

`POST /api/integrations/enquiries` uses `Authorization: Bearer <shared-secret>`
and `Content-Type: application/json`. No WorkOS user session is required.

```json
{
  "id": "9dfc9ef7-9216-4938-bba7-cf2f7f9b6457",
  "name": "Ananya Sharma",
  "email": "ananya@example.com",
  "phone": "+91 98765 43210",
  "address": "12 Garden Road",
  "apartmentType": "3-bhk",
  "budget": "10-20-lakh",
  "message": "A kitchen renovation.",
  "createdAt": "2026-11-04T08:00:00.000Z"
}
```

The UUID and creation time come from the original saved enquiry and must survive
retries. Validation matches the current landing form: trimmed name (2–200), email
(up to 254), phone (up to 50, supported punctuation and 8–15 digits), required
address (up to 500), message (up to 5,000, defaults to empty). `createdAt` is an ISO
datetime with timezone; `id` is a UUID.

Apartment codes: `1-bhk`, `2-bhk`, `3-bhk`, `4-bhk`, `5-bhk-plus`, `villa`,
`independent-home`.

Budget codes: `under-5-lakh`, `5-10-lakh`, `10-20-lakh`, `20-35-lakh`,
`35-50-lakh`, `50-lakh-plus`, `not-sure`.

An atomic transaction creates a client (`companies`) with `Residential` and
`Enquiry` tags and an `Unassigned` owner; a contact with name, email and phone;
a Note activity; and a `landing_enquiries` receipt preserving every form field.
The client description and Note include the address, readable apartment and
budget labels, message, source and original submission time. No project or fee
is inferred from a budget range.

Responses:

- 201: `{id, companyId, duplicate: false}`.
- 200: identical retry, original IDs and `duplicate: true`.
- 400: invalid JSON or fields (`fields` contains validation errors when available).
- 401: missing or incorrect credential.
- 409: same enquiry UUID with different normalized data.
- 413: body exceeds 16 KiB.
- 415: content type is not JSON.
- 503: integration unconfigured or import failed.

Responses are `no-store`. Concurrent retries cannot create partial or duplicate
clients. Different UUIDs create separate clients even with matching contact
details. Client deletion cascades to its enquiry receipt; deliberately replaying
a deleted enquiry can create another client, so successful deliveries must be
excluded from routine retries. Other CRM endpoints retain their existing auth.

## Prompt for the landing-site project

Copy this prompt into the agent working in `/home/himmel/projects/landing-site`:

```text
Implement reliable delivery of saved enquiries to the CRM. Work only in this
landing-site project. Read AGENTS.md and the installed Next.js guides first.
Inspect app/api/enquiries/route.ts, lib/enquiry.ts, lib/schema.ts, lib/sheets.ts,
and the existing tests and migration setup before editing.

The CRM endpoint is ready:
POST ${CRM_ENQUIRY_URL}
Authorization: Bearer ${CRM_ENQUIRY_SECRET}
Content-Type: application/json

Both environment variables are server-only; add placeholders to .env.example.
The URL includes /api/integrations/enquiries. The secret matches CRM's
LANDING_ENQUIRY_SECRET and must have at least 32 characters. Never expose or print
it. Do not give this project CRM database credentials or weaken authentication.

Send JSON with the saved enquiry's id, name, email, phone, address, apartmentType,
budget, message and createdAt (ISO timestamp from the saved row). Preserve the
original UUID, creation time and field values across every retry. Apartment and
budget codes match lib/enquiry-options.ts. Do not forward the honeypot
companyWebsite or Sheets metadata. Legacy incomplete rows must be reported and
skipped for correction, never populated with invented data.

CRM returns 201 for a new import or 200 for an identical retry, with JSON
{id, companyId, duplicate}. Validate returned identifiers before marking success.
409 means that UUID exists with different data: flag it, never generate a new
UUID to bypass the conflict. 400/413/415 need data or implementation correction;
401 needs credential correction. Retry network failures, timeouts, 429 and 5xx
with bounded exponential backoff and jitter; honor Retry-After when present.
Set a fetch timeout and disable redirects to avoid forwarding credentials.

Keep local enquiry storage as the durable source of truth. Add migration-backed
CRM delivery state (successful timestamp/client UUID, attempts, next attempt,
and safe diagnostic state). Saved unsynced rows must stay discoverable if the
process stops before its initial send. After the existing save succeeds, attempt
delivery with Next.js after(), preserving the current Google Sheets backup.
CRM failures must not make a locally saved submission appear failed to the user.
Keep honeypot behavior, validation, rate limits and browser response shape intact.

Add a bounded server-side retry/backfill command, a package script, and deployment
instructions for scheduling it. Handle overlapping workers safely and rely on
CRM idempotency for uncertain deliveries. Never routinely resend successful rows.
Provide a controlled option to backfill valid existing enquiries. Keep database
connections and secrets out of browser bundles. Log no personal enquiry data or
credentials. Do not run an actual backfill or production migration.

Test successful imports, duplicate acknowledgements, durable pending state after
outages/timeouts, retry classifications, overlapping delivery attempts, legacy
incomplete rows, and unchanged form/Sheets behavior. Run relevant tests, type
checks and lint. Document environment variables, migrations, scheduling and an
end-to-end smoke test. Report changes and deployment steps.
```
