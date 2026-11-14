# InvoiceFlow Web

React frontend for the [InvoiceFlow API](../README.md). Phase 1 established the application foundation,
Phase 2 added authentication and the protected shell, Phase 3 delivered owner-safe customer management,
Phases 4–5 added invoice discovery and editing, Phase 6 delivered guarded lifecycle management, Phase 7
added bounded analytics, Phase 8 hardened UX/accessibility/security, Phase 9 delivered container and browser
E2E infrastructure, and Phase 10 completes the portfolio release documentation and verification.

- [API contract](docs/api-contract.md) — the audited backend contract this frontend targets.
- [Development plan](docs/development-plan.md) — the ten frontend phases and their exit criteria.

## Current status

**Phase 10 local verification is complete; the release remains pending an authorized commit and remote CI.**

The protected workspace provides customer management, invoice discovery and editing, guarded lifecycle
actions, and a real API-backed dashboard. Phase 8 adds route focus management, fully associated invoice
validation, reduced-motion support, clearer required fields, and defense-in-depth API URL validation. The
full automated quality gate passes, including 216 Vitest tests, 209 PostgreSQL integration tests, the
production build, all three container images, the full Compose stack, restart persistence, and six Playwright
scenarios. The exact evidence and the checks that remain external are recorded in the
[release-readiness matrix](../docs/release-readiness.md).

## Technology stack

| Area                 | Choice                                                |
| -------------------- | ----------------------------------------------------- |
| Runtime              | Node.js 24 LTS (see [prerequisites](#prerequisites))  |
| UI                   | React 19, React DOM 19                                |
| Language             | TypeScript 6 in strict mode                           |
| Build                | Vite 8 with Rolldown                                  |
| Styling              | Tailwind CSS 4 with OKLCH design tokens               |
| Components           | shadcn/ui primitives (New York style) on Radix UI     |
| Routing              | React Router 7                                        |
| Server state         | TanStack Query 5                                      |
| Forms and validation | React Hook Form 7, Zod 4                              |
| HTTP                 | Small typed `fetch` client (no Axios)                 |
| Icons and toasts     | Lucide React, Sonner                                  |
| Testing              | Vitest 5, React Testing Library 16, jsdom 31          |
| Browser E2E          | Playwright with desktop and mobile Chromium           |
| Quality              | ESLint 9 (flat config), Prettier 3, TypeScript strict |

The dependency set is pinned in `package.json` and `package-lock.json`. Optional peer dependencies are not
installed; the client does not use Axios, OpenAPI generation, or a component CSS framework.

## Prerequisites

- **Node.js `^22.22.2`, `^24.15.0`, or `>=26.0.0`.** Node 24 LTS is recommended. Vite, Vitest, and jsdom no
  longer support odd-numbered or older releases; Node 23.10 in particular is unsupported by Vitest 5 and
  jsdom 31.
- **npm 11** recommended. The repository lockfile was produced with npm 11; npm 10.9.2 can fail during
  dependency resolution (see [Troubleshooting](#troubleshooting)).
- A running InvoiceFlow API for login, registration, and identity loading. The application shell still
  starts without a backend, but authentication requests fail with a user-safe network error.

## Installation

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `.env` if the API is not at the default address. The file is gitignored.

## Environment variables

| Variable            | Required | Purpose                                                |
| ------------------- | -------- | ------------------------------------------------------ |
| `VITE_API_BASE_URL` | Yes      | Absolute API URL, or `same-origin` in the Nginx image. |

Values are validated with Zod when the application starts. A missing, relative, non-HTTP, or
credential-bearing URL renders a configuration error page instead of issuing requests to an unintended host.
The `same-origin` sentinel resolves to `window.location.origin` at runtime and is reserved for the production
container, where Nginx proxies `/api` and `/health` to the private API service.

```dotenv
# Docker Compose backend (repository default)
VITE_API_BASE_URL=http://localhost:8080

# Or, when running the API with `dotnet run`
# VITE_API_BASE_URL=http://localhost:5188
```

Vite embeds `VITE_*` values into the browser bundle. They are **public**. Never put a JWT signing key,
database password, API secret, or refresh token in `.env` or any frontend file. The API's only authentication
secret stays on the server.

## Backend dependency and CORS

The frontend targets InvoiceFlow API v1.0.0. Paths already include `/api`; there is no `/v1` segment.

Start the backend with Docker Compose, from the repository root:

```bash
cp .env.example .env   # once; set POSTGRES_PASSWORD and Jwt__SigningKey
docker compose up -d --build --wait
curl http://localhost:8080/health
```

The API allows **no cross-origin requests by default**. A browser at `http://localhost:5173` is blocked until
its origin is configured. This repository includes a local-only `docker-compose.override.yml` that Compose
merges automatically:

```yaml
services:
  api:
    environment:
      Cors__AllowedOrigins__0: http://localhost:5173
```

The exact environment-variable array syntax matters: `Cors__AllowedOrigins__0` is the first element of
`Cors:AllowedOrigins`. Do not use a wildcard origin and do not enable credentials; the frontend sends
`Authorization: Bearer` with `credentials: 'omit'`, never cookies. The base `docker-compose.yml` is unchanged,
so deployments that do not opt into the override keep the secure empty allow-list.

When running the API directly instead of Compose, set the same value before starting it:

```bash
Cors__AllowedOrigins__0=http://localhost:5173 \
  dotnet run --project src/InvoiceFlow.Api
```

Vite is intentionally bound to `http://localhost:5173` with `strictPort: true`, so the allowed origin stays
predictable during development.

## Full-stack container and same-origin routing

From the repository root:

```bash
cp .env.example .env
# Replace POSTGRES_PASSWORD and Jwt__SigningKey with strong local values.
docker compose --profile web up -d --build --wait
curl http://localhost:8081/health
```

Open `http://localhost:8081`. The `web` profile builds the frontend with
`VITE_API_BASE_URL=same-origin`; the browser never sees `api:8080`. The unprivileged Nginx runtime serves the
SPA, caches fingerprinted `/assets` for one year, disables caching for HTML/API responses, and proxies
`/api/*`, `/health`, and `/health/live` to the API on the private Compose network. Authorization and
correlation headers are forwarded; request bodies and methods are preserved. The public `Origin` header is
removed only on this private same-origin hop, while direct API clients remain governed by the backend's
explicit CORS allow-list.

The profile publishes only loopback ports (`8081` for web and the existing `8080` API diagnostic endpoint).
PostgreSQL remains private and persists in `invoiceflow_postgres-data`. `docker compose down` preserves it;
never add `--volumes` unless intentionally deleting local sample data. Override the web host port with
`WEB_PORT`, for example `WEB_PORT=8090 docker compose --profile web up -d`.

The image adds CSP, clickjacking, MIME-sniffing, referrer, and permissions headers. Scripts are restricted to
same origin; inline styles remain allowed because Radix/Sonner use runtime style attributes. Local Compose is
HTTP, so it intentionally does not emit HSTS. Production still requires TLS termination, HSTS, external
secret management, backup/restore, and an environment-specific deployment review.

## Development commands

Run from `frontend/`:

| Command                    | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `npm run dev`              | Start Vite at `http://localhost:5173` with strict port binding. |
| `npm run build`            | Type-check and produce a production bundle in `dist/`.          |
| `npm run preview`          | Serve the production bundle at `http://localhost:4173`.         |
| `npm run typecheck`        | Run `tsc -b` across the app and tooling projects.               |
| `npm run lint`             | ESLint with `--max-warnings=0`.                                 |
| `npm run test`             | Run Vitest once.                                                |
| `npm run test:watch`       | Run Vitest in watch mode.                                       |
| `npm run test:e2e`         | Run Playwright against `E2E_BASE_URL` (default `:8081`).        |
| `npm run test:e2e:install` | Install the local Chromium browser used by Playwright.          |
| `npm run format`           | Format with Prettier, including Tailwind class sorting.         |
| `npm run format:check`     | Verify formatting without writing.                              |

## Project structure

```text
frontend/
  docs/
    api-contract.md          Audited API surface, DTOs, errors, and limitations
    development-plan.md      Ten phases with scope and exit criteria
  public/
    favicon.svg
  src/
    app/
      layouts/               Responsive shell and sidebar
      pages/                 Not found, route error, configuration error
      providers/             Error boundary, query client, app providers
      router/                Route tree and navigation metadata
      app.tsx
    components/
      shared/                Logo, page header, loading, placeholders
      ui/                    shadcn/ui primitives
    features/
      auth/
        api/                 Auth DTOs, Zod-validated endpoint calls, contract errors
        components/          Form fields, alerts, route guards, loading screen
        lib/                 Login and registration error mapping
        pages/               Login and registration pages
        schemas/             Shared e-mail and password validation
        session/             Session controller, expiry, safe return paths
      customers/
        api/                 Customer contracts, DTOs, and user-scoped query keys
        components/          Shared form, not-found state, and delete confirmation
        hooks/               TanStack Query reads and mutations
        pages/               List, create, detail, and edit routes
        schemas/             Customer form validation and full PUT conversion
        utils/               URL state, errors, and date formatting
      dashboard/             Bounded analytics queries, exact decimal aggregation, and dashboard UI
      invoices/
        api/                 Validated summary/detail contracts and user-scoped keys
        components/          Status badge and list navigation
        hooks/               Cancellable list and detail queries
        pages/               Read-only list and detail routes
        utils/               URL state, errors, status, money, and date formatting
    lib/
      api/                   Typed client, errors, ProblemDetails, endpoints
      config/                Zod environment validation and React context
      utils/                 Tailwind class merging
    styles/
      index.css              Tailwind entry point and design tokens
    test/                    Setup, render helper, and tests
    main.tsx
  .env.example
  components.json            shadcn/ui configuration
  eslint.config.js
  index.html
  package.json
  tsconfig*.json
  vite.config.ts
```

Feature-specific code stays inside its feature. Shared UI primitives do not import feature code. API access
goes through `src/lib/api`, not ad hoc `fetch` calls.

## Design system

- Tokens live in `src/styles/index.css` and use OKLCH color values with a light administration theme.
- shadcn/ui primitives are committed source, not a runtime component library. They can be adjusted in place.
- Typography uses a system sans stack with a compact scale for metadata and larger, tighter page headings.
- Components cover button, input, label, card, table, badge, dialog, separator, skeleton, and toast.
- Motion is limited to short fade/dialog transitions. `prefers-reduced-motion: reduce` disables smooth
  scrolling and reduces animations and transitions to effectively instantaneous behavior.
- Dark mode is not implemented as of Phase 3; adding it later requires a theme provider and a token audit.

## Authentication and session lifecycle

Authentication is centralized under `src/features/auth`:

- `api/contracts.ts` calls the three released endpoints and validates successful payloads with Zod. A
  malformed response becomes `AuthContractError` instead of a partially trusted session.
- `schemas/auth-schemas.ts` mirrors the transport limits and the ASP.NET Core Identity password rules:
  12–128 characters with uppercase, lowercase, digit, and non-alphanumeric characters.
- `session/auth-provider.tsx` owns a single discriminated state: `anonymous`, `authenticating`, or
  `authenticated`. The access token and verified user identity are published together in one session object.
- `components/require-auth.tsx` blocks protected content until identity is confirmed. `public-only-route.tsx`
  keeps signed-in users away from login and registration.
- `session/return-path.ts` accepts only same-origin application paths. Absolute URLs, protocol-relative
  URLs, backslashes, control characters, and the auth pages themselves are rejected.

### Login and registration

Login performs two requests in order:

1. `POST /api/auth/login` with no bearer token.
2. `GET /api/auth/me` with the newly issued token, using an explicit `Authorization` header and opting out
   of the global authenticated-401 handler.

The session is established only after `/me` returns a verified identity. Registration calls only
`POST /api/auth/register`; it never receives a token, never auto-authenticates, and redirects to login with a
success message. Both forms handle `400`, `401`, `409`, `429`, network failures, malformed responses, and
unexpected server errors without rendering raw exception text. `Retry-After` is shown for rate limits, and
no request is retried automatically.

### Token storage and expiry

- The access token is held in memory only: no `localStorage`, `sessionStorage`, cookies, URLs, or logging.
- The frontend does not decode the JWT as an identity source. `/me` is authoritative.
- Expiry is derived from the login `expiresIn` duration, not the client clock's absolute correctness. A
  conservative margin of 10% (capped at 30 seconds) is subtracted so the local session ends before the server
  would reject the token. The default 30-minute lifetime therefore expires locally after about 29.5 minutes.
- Page reload intentionally ends the session because the token is not persisted. This is a Phase 2 UX
  limitation, not a bug.

### Sign-out and invalidation

Sign-out invalidates the session immediately, clears the token and identity, cancels in-flight queries,
clears the TanStack Query cache, and redirects to `/login`. A genuine authenticated `401` and local expiry use
the same invalidation path with a specific message. A delayed `401` from an older token is ignored because
the API client reports the token that was attached, and the provider compares it with the current token.

There is **no server-side logout or revocation endpoint**. Sign-out only discards the client-held token; the
stateless JWT remains technically valid until it expires. The UI says this explicitly.

### Cache isolation

Every sign-in and sign-out clears the query cache, which prevents one account's data from being shown to the
next account. In-flight queries are cancelled as part of invalidation. Late responses from a removed query do
not repopulate the cache for a newer session. Customer and invoice keys both include the authenticated user id
as defense in depth.

## Customer management

- The list state is URL-driven. Invalid values are normalized before requests are made; defaults are omitted
  from canonical URLs. Browser back/forward restores page, page size, search, and sorting.
- Search is trimmed, debounced by 300 ms, performed by the server, and resets to page 1. Obsolete list
  requests consume TanStack Query's abort signal and are explicitly cancelled when the list key changes.
- Lists use `page` (not `pageNumber`), default to 20 rows, and allow at most 100. Sorting is restricted to
  `name`, `email`, `createdAt`, and `updatedAt`.
- Create and edit share React Hook Form + Zod validation. Optional blanks become `null`; edits send all five
  mutable fields because the API uses full PUT replacement and has no concurrency token.
- Delete is never optimistic. A confirmation dialog focuses Cancel first, restores trigger focus, remains open
  on failure, and explains the invoice-backed `409` restriction.
- Missing and cross-owner details render the same generic not-found state. The UI never reveals whether an
  inaccessible record exists.

## Invoice discovery and lifecycle management

- Invoice list state is URL-driven and uses `pageNumber`, not the customer `page` convention. Invalid and
  unsupported values are removed before requests; browser back/forward restores filters, sorting, and paging.
- Implemented server filters are `customerId`, `status`, `issueDateFrom`, `issueDateTo`, and invoice-number
  `search`. The API has no due-date filter, customer-name search, or general full-text search.
- Search is debounced by 300 ms. Filter, sort, and page-size changes reset to page 1, and obsolete list
  requests are cancelled through TanStack Query abort signals.
- List summaries expose `customerId` but not the customer name. The list links the identifier without issuing
  N+1 customer requests; a detail view performs one bounded customer read and falls back safely to the id.
- Status badges render `Draft`, `Sent`, `Paid`, and `Cancelled` with text and semantic styling. Unknown future
  values use an accessible `Unknown` fallback.
- `issueDate` and `dueDate` are formatted as calendar dates in UTC to prevent timezone shifts. Audit
  timestamps are formatted as instants in the browser locale.
- TRY values are formatted with `tr-TR`, and all totals remain authoritative API values. Since the API
  serializes decimals as JSON numbers, values whose cents are outside JavaScript's safe integer range display
  `Amount unavailable` rather than a silently rounded amount.
- Detail pages show all returned line and summary amounts. Lifecycle mutations never recalculate totals.
- Draft exposes Edit, Send, Cancel, and Delete; Sent exposes Mark Paid and Cancel; Paid and Cancelled are
  terminal read-only states. Every action requires an accessible confirmation dialog with the safe action
  focused first.
- Lifecycle POST bodies contain only `{ concurrencyToken }`; Draft deletion safely URL-encodes the token as
  a query parameter. Mutations never retry or update status optimistically.
- A `409` preserves server state, explains the conflict, and offers a fresh detail read before another action.
  `404` responses use the same ownership-safe unavailable wording.

## API client

`src/lib/api/client.ts` provides:

- Typed `get`, `post`, `put`, and `delete` helpers plus a generic `request`.
- Query serialization with omitted `null`/`undefined` values and repeated array parameters.
- `AbortSignal` forwarding; aborts are rethrown rather than converted to network errors.
- JSON bodies and `Accept: application/json`, with caller headers preserved.
- `X-Correlation-ID` generated per request or preserved from the caller.
- Injected `getAccessToken` hook connected to the in-memory session. The client does not store, refresh, or
  log tokens.
- Anonymous endpoints opt out with `auth: false`, so login and registration never receive a token.
- `onUnauthorized` reports the token attached to an authenticated `401`; the session controller ignores stale
  tokens from older sessions.
- ProblemDetails parsing and normalized `ApiError`, `NetworkError`, and `ParseError` classes.
- Absolute HTTP(S) base URLs are required and embedded URL credentials are rejected at both environment and
  low-level client boundaries before a bearer-authenticated request can be constructed.
- `Retry-After` parsing for rate-limited responses.
- **No automatic retries.** Query-level retries apply only to reads and never to `4xx`; mutations never retry.

Feature code obtains the configured client through `useApiClient()`; it must not call `fetch` directly. Unit
tests inject fetch and require no backend.

## Testing

```bash
npm run test
```

Phases 1–10 have 216 Vitest tests across 26 files. Phase 9 added production same-origin configuration coverage;
six Playwright scenarios remain separate from `npm run test`.
Coverage includes:

- application rendering, route navigation, skip link, active navigation, API target display, and mobile
  navigation;
- login validation, successful login with `/me` identity loading, invalid credentials, `429`, network
  failure, malformed responses, and the rule that login is incomplete until `/me` succeeds;
- registration validation, password-rule mirroring, confirmation matching, duplicate e-mail mapping,
  Identity error mapping, success redirect, and the absence of an automatic session;
- protected-route redirects, safe return-path restoration, external redirect rejection, public-only
  redirects, and preserved not-found behavior;
- bearer-token attachment, token omission from public auth requests, token-aware global `401` handling,
  stale-`401` protection, session expiry, explicit sign-out, cache clearing, account-switching isolation,
  late-response protection, and absence of duplicate `/me` calls;
- mobile-navigation sign-out accessibility;
- error boundary, environment validation, ProblemDetails parsing, and the original API-client suite;
- customer loading, empty, no-results, error, responsive-table, URL normalization, back/forward, debounce,
  cancellation, sorting, and pagination behavior;
- customer create/detail/edit validation, full PUT payloads, server field errors, duplicate e-mail conflicts,
  pending-submission guards, query invalidation, and generic cross-owner `404` handling;
- delete confirmation, cancellation, trigger focus restoration, `404`/`409` handling, pending guards, cache
  removal, list invalidation, and last-item page correction;
- authenticated bearer attachment, customer `401` invalidation, sign-out cleanup, and account-switch isolation.
- invoice loading, empty/no-results/error/retry states, server pagination with `pageNumber`, supported-filter
  inclusion, unsupported-filter exclusion, sorting, URL normalization, back navigation, cancellation, and
  responsive/keyboard behavior;
- read-only invoice details, line items, authoritative financial summaries, customer navigation, status
  fallback, zero and unsafe money values, date-only and timestamp formatting, malformed responses, and generic
  missing/cross-owner `404` handling;
- invoice bearer attachment, global `401` invalidation, expiry coverage, logout cleanup, and account-switch
  cache isolation.
- Draft/Sent action availability, Paid/Cancelled terminal states, exact send/mark-paid/cancel payloads,
  encoded delete tokens, fresh-token cache replacement, confirmation cancellation, keyboard/focus behavior,
  duplicate-submit prevention, list invalidation, ownership-safe errors, and explicit `409` reload recovery.
- dashboard loading/empty/error states, exact status counts, customer summary, recent-created ordering,
  financial classification, unsafe-value rejection, multi-page aggregation, and the 1,000-row limit.

Tests use jsdom, deterministic mocks, injected fetch, and fake timers for expiry. No test needs a running API.

### Full-stack Playwright E2E

Start the `web` profile, then install Chromium once and run the dedicated suite:

```bash
cd ..
LOGIN_PERMIT_LIMIT=100 REGISTER_PERMIT_LIMIT=100 \
  docker compose --profile web up -d --build --wait
cd frontend
npm run test:e2e:install
E2E_BASE_URL=http://127.0.0.1:8081 npm run test:e2e
```

Desktop Chromium covers registration/login/logout/reload, ownership isolation, customer CRUD, multi-line
invoice financial parity (`614.97 + 121.49 = 736.46`), stale-token recovery, Paid and Cancelled terminal
states, Draft deletion, and dashboard results. A mobile Chromium project covers navigation and private-data
removal. Tests use unique accounts and explicit UI/API-state waits; there are no arbitrary sleeps or fixed
invoice numbers. Traces, screenshots, and videos are retained only on failure.

Local terminal-state records cannot be deleted and accounts have no deletion endpoint. Prefer an isolated
Compose project for repeated runs. GitHub Actions creates its own database volume and removes only those CI
resources after the suite.

If your shell's default Node is not supported, run commands under Node 24 without changing the system
installation:

```bash
NODE24="$(npx --yes node@24 -p process.execPath)"
PATH="$(dirname "$NODE24"):$PATH" npm test
```

## Phase 5 scope

Included: invoice creation, full Draft editing, searchable/paginated customer selection, 1–100 dynamic line
items, backend-compatible decimal previews, indexed server validation, optimistic-concurrency conflict
recovery, and unsaved-change protection.

Editable decimal values remain strings. `decimal.js` performs per-line `ROUND_HALF_UP` calculations, which
matches the backend's `MidpointRounding.AwayFromZero` because all accepted invoice inputs are nonnegative.
Each line subtotal and tax is rounded to two decimals before invoice totals are summed. The API recalculates
all values and its saved response remains authoritative.

## Phase 6 scope

Invoice details expose only transitions valid for the authoritative status. Send changes status only and
does not deliver e-mail; Mark Paid is manual and does not process payment. Cancel is terminal. Draft deletion
removes the invoice and its items only after confirmation; the customer remains.

Mutation responses replace the cached detail with the returned status and fresh token, then invalidate
invoice lists. `409` responses are never retried automatically: the dialog preserves context and offers
Reload Latest Invoice. Mutation requests carry abort signals so an unmounted or replaced session cannot
publish a delayed result.

The backend accepts JSON numbers and has a wider `decimal` range than JavaScript can serialize exactly.
InvoiceFlow therefore validates scaled values against the safe-integer boundary and verifies decimal
round-tripping before submission. Backend-valid but unsafe browser values are blocked with a field error
instead of being silently rounded. Calculated totals are never sent.

## Phase 7 dashboard metrics

- **Issued** is the sum of authoritative `grandTotal` values for `Sent` and `Paid` invoices.
- **Paid** is the sum for invoices whose current status is `Paid`. It represents a manual lifecycle status,
  not verified payment processing.
- **Outstanding** is the sum for `Sent` invoices only. Draft and Cancelled invoices are excluded.
- **Draft count** and the Draft/Sent/Paid/Cancelled distribution come from four filtered invoice-list
  requests with `pageSize=1`, using each response's `totalCount`.

Financial values are complete only when every visible invoice fits within ten 100-row pages (1,000 invoices).
Pages are aggregated with `decimal.js` after the parsed JSON number passes the existing exact two-decimal
safety check. Above that limit, or when a value/status cannot be classified safely, all three money KPIs show
`Unavailable`; the UI never labels a first-page subtotal as global. Recent invoices use
`sortBy=createdAt&sortDirection=desc&pageSize=5`; the customer summary reads only the three most recently
created customers. Each widget has its own loading, error, and retry state.

Because the API has no analytics endpoint, paginated reads are not a transactionally consistent snapshot and
there is no paid date, aging, revenue trend, or historical series. An API-side aggregate would be needed for
larger installations and snapshot-consistent reporting.

## Phase 8 hardening

- Client-side route changes move focus to the existing `main` landmark without stealing focus on first load;
  the skip link continues to target the same focusable region.
- Required invoice fields have visible markers and native required semantics. Customer search has an explicit
  accessible name and search role. Date and line-item errors use stable `aria-describedby` relationships and
  alert semantics; adding a line moves focus to its description field.
- Radix dialogs retain focus trapping/restoration. Destructive customer and invoice confirmations continue
  to focus their safe action first. Wide tables remain intentionally scrollable inside their own container.
- No financial rules changed. Decimal input remains string-backed, `decimal.js` calculations remain exact,
  unsafe response values remain unavailable, and persisted API totals remain authoritative.
- Existing lazy routes, query cancellation, 300 ms search debounce, user-scoped caches, and the bounded
  dashboard workload were retained; the production build did not reveal a concrete new performance
  bottleneck or justify another dependency.

## Security notes

- No secrets belong in the frontend. Only the public API base URL is configured.
- Access tokens are memory-only and are never written to storage, cookies, URLs, logs, or rendered output.
- The client sends explicit `Authorization` headers and never relies on cookies (`credentials: 'omit'`).
- Tokens are attached only to requests to the configured API base URL. Login and registration opt out.
- A stale `401` cannot invalidate a newer session, and a late `/me` response cannot resurrect a signed-out one.
- Sign-out clears user-specific query data; the stateless JWT is not revoked server-side.
- Return paths are restricted to same-origin application routes to prevent open redirects.
- Error messages are fixed or come from validated ProblemDetails; stack traces and raw exceptions are never
  rendered. Correlation IDs remain available for support.
- The API returns `404` for cross-owner resources by design; the frontend must not infer their existence.
- Frontend guards are UX controls only. The API remains responsible for authentication, ownership, roles,
  validation, and concurrency.
- Production hosting must enforce HTTPS and add deployment-level CSP (`default-src`, `script-src`,
  `style-src`, `connect-src`, `img-src`, `font-src`, `frame-ancestors`), HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, and an appropriate `Permissions-Policy`. These cannot be guaranteed by the Vite bundle.

## Troubleshooting

**`npm install` crashes with `Cannot read properties of null (reading 'edgesOut')`**

Use npm 11:

```bash
npx --yes npm@11.21.2 install
```

**`EBADENGINE` warnings or Vitest/jsdom failures**

Switch to Node 24 LTS, or use the `npx node@24` PATH workaround above. Node 23 is not supported.

**Browser requests fail with a CORS error**

Configure `Cors:AllowedOrigins` (or `Cors__AllowedOrigins__0`) for the exact Vite origin, then restart the
API. The included `docker-compose.override.yml` does this for `http://localhost:5173`. Check that
`VITE_API_BASE_URL` points to the same API instance and scheme/host/port.

**The app shows a configuration error page**

`VITE_API_BASE_URL` is missing or invalid. Copy `.env.example` to `.env`, set an absolute `http(s)` URL, and
restart `npm run dev`; Vite reads environment files at startup.

**A deep link returns 404 under `npm run preview`**

Vite preview handles SPA fallback. If you serve `dist/` with another static server, configure a fallback to
`index.html`. Production hosting is provided by the Nginx web image and Compose `web` profile.

## Related documentation

- [InvoiceFlow API README](../README.md)
- [API examples](../docs/api-examples.md)
- [Backend architecture](../docs/architecture.md)
- [Frontend API contract](docs/api-contract.md)
- [Frontend development plan](docs/development-plan.md)
