# Sales CRM

A Next.js 16 CRM backed by **Neon Postgres** and **Drizzle ORM**. The existing company interface now reads and writes persistent records.

- Companies: create, edit, delete, search, filter, sort, and CSV export.
- Contacts: customer names, email, phone, and job title linked to a company.
- Deals: six pipeline stages, values in USD, win probabilities, owners, and close dates.
- Tasks: account follow-ups, owners, due dates, overdue indicators, and completion.
- Activities: notes, calls, emails, and meetings in each account's history.
- Forecast: open pipeline, weighted forecast, won revenue, and pipeline by stage.
- Custom email-code sign-in powered by WorkOS, with individual accounts, organization membership, and server-enforced roles.
- Admin console: invite teammates, change roles, suspend/restore access, and revoke pending invitations.

## Run locally

Requires Bun, Node.js 20.19+ (used by the project scripts), and a Neon project.

```bash
bun install
bun run setup
```

Open `.env.local`. Set `DATABASE_URL` to your Neon **primary read/write** connection string with `sslmode=require`. A read replica cannot run migrations or save CRM records. The database role must be allowed to create schemas, tables, indexes, and enum types.

`bun run setup` creates a private `.env.local` and generates `WORKOS_COOKIE_PASSWORD` without printing it. Fill in the WorkOS values from `.env.example` before signing in. No shared workspace password is accepted.

### Configure WorkOS

1. Create a WorkOS environment and copy its API key and client ID into `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`.
2. Create one organization for this CRM and set `WORKOS_ORGANIZATION_ID` to its ID. The app deliberately uses **one shared CRM database and one allowed organization**, rather than exposing the same data to multiple organizations.
3. In WorkOS roles, create the exact slugs `admin`, `member`, and `viewer`. Set `viewer` as the default role; assign greater access explicitly. This application maps these slugs to the permissions below. Unknown roles receive no access.
4. Enable **Magic Auth** in WorkOS Authentication settings and keep WorkOS Magic Auth email delivery enabled. Sign-in happens inside the CRM: enter an email, then the six-digit code. Codes expire after 10 minutes. Set the application's **User invitation URL** to `http://localhost:3000/login` so invitation links use this form and pass their `invitation_token` to WorkOS. Keep `http://localhost:3000/callback` as an allowed redirect URI and set `NEXT_PUBLIC_WORKOS_REDIRECT_URI` to that URL. Set the default sign-out URI to `http://localhost:3000/login`. Use your deployment's HTTPS URLs in production.
5. Bootstrap the first administrator in the **WorkOS dashboard**: create/invite your account into the configured organization and assign its membership the `admin` role. Signing up alone does not grant CRM access. Do not configure automatic organization membership for untrusted domains.
6. Sign in and open **Users and access** in the CRM header (or `/admin`) to manage your team. WorkOS sends the invitations, which expire after seven days.

See the official [Magic Auth guide](https://workos.com/docs/authkit/magic-auth), [custom invitation URLs](https://workos.com/docs/authkit/custom-emails), [AuthKit Next.js setup](https://workos.com/docs/sdks/authkit-nextjs) and [organization membership API](https://workos.com/docs/reference/authkit/organization-membership).

| Role   | CRM records                        | Users and access                                          |
| ------ | ---------------------------------- | --------------------------------------------------------- |
| Admin  | Read, export, create, edit, delete | Invite, assign roles, suspend/restore, revoke invitations |
| Member | Read, export, create, edit, delete | No access                                                 |
| Viewer | Read and export                    | No access                                                 |

The custom login supports email verification codes for existing workspace members and invited teammates. Unknown or suspended accounts receive the same code-request response without being sent a code. Only a verified WorkOS authentication response followed by an active, recognized organization membership creates a session. Codes and tokens never reach the client response or application logs. WorkOS enforces its authentication/email limits; the app also caps requests per recipient and server process. Organization policies requiring SSO or MFA remain enforced; this email-only form asks those users to contact their administrator rather than bypassing those policies.

Every CRM/admin request checks current WorkOS membership, so a role change or suspension applies on the next request even if an older session token still contains a previous role. Failed provider checks deny access. Administrators cannot change their own role or suspend themselves through the CRM; another administrator can make those changes. WorkOS remains the source of truth for identities, roles, and memberships; no user migration or additional CRM tables are needed.

```bash
bun run db:migrate
bun run dev
```

Open http://localhost:3000 and sign in with WorkOS. Create a company, then open its details to add contacts, deals, follow-ups, and activity. The database starts empty; the app does not silently import the old mock dataset.

Optional sample data (adds one clearly marked demo account, removable by deleting that company):

```bash
bun run db:seed --demo
```

## Database changes

`lib/db/schema.ts` defines the schema. Checked-in SQL migrations and Drizzle metadata are in `drizzle/`.

```bash
bun run db:generate  # after editing the schema; review generated SQL
bun run db:migrate   # apply pending migrations
bun run db:studio    # inspect the configured database locally
```

All related records have indexed company foreign keys and cascade on company deletion. Money uses Postgres `numeric(14,2)`. Company creation and any initial opportunities run in one transaction through Neon HTTP batch. Company totals come from open deals; Won and Lost deals are excluded. Win probability is weighted by deal value. Activity history supplies each company's last interaction and 14-day trend. CSV export reflects the active company filters.

## Checks

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Tests apply the real Drizzle migrations to an isolated PGlite Postgres instance and cover foreign keys, money precision, constraints, cascade deletion, input validation, role permissions, admin authorization, organization isolation, invitations, self-lockout prevention, and pipeline summaries. They do not require a Neon connection.

To check a configured running app:

```bash
bun run start --port 3100
# In a separate terminal: unauthenticated API checks without a database:
bun run test:integration --auth-only
# Full CRM CRUD: provide a private file containing a valid WorkOS Cookie header
# from a member/admin browser session. Use a test environment; creates/cleans a test account.
TEST_COOKIE_FILE=/path/to/private-cookie-file bun run test:integration
```

Set `TEST_BASE_URL` to test a different URL. The runner never prints the cookie. Real WorkOS sign-in, invitation delivery, and session refresh require configured WorkOS credentials and a browser session; the automated unit tests use provider stubs.

## Deploy

Set `DATABASE_URL`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_ORGANIZATION_ID`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, and `NEXT_PUBLIC_SITE_URL` in your deployment environment. Set the public redirect URI before building, because Next.js embeds `NEXT_PUBLIC_*` variables at build time. Apply existing database migrations before starting the release. Run `bun run build` and `bun run start`, or deploy to your Next.js hosting provider. Production requires HTTPS. Keep the API key and cookie password private; rotating the cookie password invalidates existing sessions.

Owners on CRM records remain editable sales labels, separate from login accounts. All allowed organization members share the same records according to their role. CRM email sequences are not implemented; WorkOS handles authentication and invitation email.
