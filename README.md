# Sales CRM

A Next.js 16 CRM backed by **Neon Postgres** and **Drizzle ORM**. The existing company interface now reads and writes persistent records.

- Companies: create, edit, delete, search, filter, sort, and CSV export.
- Contacts: customer names, email, phone, and job title linked to a company.
- Deals: six pipeline stages, values in USD, win probabilities, owners, and close dates.
- Tasks: account follow-ups, owners, due dates, overdue indicators, and completion.
- Activities: notes, calls, emails, and meetings in each account's history.
- Forecast: open pipeline, weighted forecast, won revenue, and pipeline by stage.
- Private workspace: password sign-in, signed eight-hour sessions, and protected API routes.

## Run locally

Requires Node.js 20.19+ and a Neon project.

```bash
npm install
npm run setup
```

Open `.env.local`. Set `DATABASE_URL` to your Neon **primary read/write** connection string with `sslmode=require`. A read replica cannot run migrations or save CRM records. The database role must be allowed to create schemas, tables, indexes, and enum types.

`npm run setup` generates `CRM_PASSWORD` and `SESSION_SECRET` without printing them. Use the `CRM_PASSWORD` from `.env.local` to sign in. The file is gitignored. You may set your own password (12+ characters) and session secret (32+ random characters). `.env.example` documents the configuration.

```bash
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and sign in. Create a company, then open its details to add contacts, deals, follow-ups, and activity. The database starts empty; the app does not silently import the old mock dataset.

Optional sample data (adds one clearly marked demo account, removable by deleting that company):

```bash
npm run db:seed -- --demo
```

## Database changes

`lib/db/schema.ts` defines the schema. Checked-in SQL migrations and Drizzle metadata are in `drizzle/`.

```bash
npm run db:generate  # after editing the schema; review generated SQL
npm run db:migrate   # apply pending migrations
npm run db:studio    # inspect the configured database locally
```

All related records have indexed company foreign keys and cascade on company deletion. Money uses Postgres `numeric(14,2)`. Company creation and any initial opportunities run in one transaction through Neon HTTP batch. Company totals come from open deals; Won and Lost deals are excluded. Win probability is weighted by deal value. Activity history supplies each company's last interaction and 14-day trend. CSV export reflects the active company filters.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests apply the real Drizzle migrations to an isolated PGlite Postgres instance and cover foreign keys, money precision, constraints, cascade deletion, input validation, sessions, and pipeline summaries. They do not require a Neon connection.

To check the running app against Neon:

```bash
npm run start -- --port 3100
# In a separate terminal; creates and cleans up its own test account:
npm run test:integration
# Authentication and invalid-input checks without a migrated database:
npm run test:integration -- --auth-only
```

Set `TEST_BASE_URL` to test a different URL. The runner reads the workspace password from `.env.local` and does not print credentials.

## Deploy

Set `DATABASE_URL`, `CRM_PASSWORD`, `SESSION_SECRET`, and `NEXT_PUBLIC_SITE_URL` in your deployment environment. Apply migrations once before starting the new release. Run `npm run build` and `npm start`, or deploy the Next.js app to your hosting provider. Production requires HTTPS because session cookies are Secure.

This is one shared workspace: everyone with the workspace password can manage all records. Owners are editable labels, not separate login accounts. Login throttling is per server process; deployments with multiple instances should use a shared rate limiter or an identity provider when introducing individual accounts. Rotating `CRM_PASSWORD` or `SESSION_SECRET` invalidates existing sessions. The app has no outbound email delivery or automated email sequences.
