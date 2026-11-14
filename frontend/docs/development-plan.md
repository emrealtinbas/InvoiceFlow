# InvoiceFlow Web development plan

Ten phases take the frontend from an empty repository to a portfolio release. Phase 1 builds the
foundation; later phases add one business capability at a time. Every phase ends with a working
application, not a half-integrated feature.

**Guiding constraints**

- The InvoiceFlow API v1.0.0 is authoritative and unchanged. Frontend work does not add, alter, or wrap
  endpoints.
- No invented data, metrics, or endpoints. Placeholders say what is missing and when it is planned.
- Phase 2 implements authentication. Later phases build on a verified in-memory session and must not imply
  capabilities the API does not provide, such as refresh tokens or server-side revocation.
- Each phase keeps `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` green.
- Accessibility, responsive behavior, and honest error states are phase requirements, not polish at the end.

**Status legend:** Complete · Verification pending · Planned

| #   | Phase                         | Status               |
| --- | ----------------------------- | -------------------- |
| 1   | Foundation & API Contract     | **Complete**         |
| 2   | Authentication & App Shell    | **Complete**         |
| 3   | Customer Management           | **Complete**         |
| 4   | Invoice Management            | **Complete**         |
| 5   | Invoice Editor & Calculations | **Complete**         |
| 6   | Invoice Lifecycle             | **Complete**         |
| 7   | Dashboard & Analytics         | **Complete**         |
| 8   | UX, Accessibility & Security  | **Complete**         |
| 9   | Integration Tests & Docker    | **Complete**         |
| 10  | Portfolio Release             | Verification pending |

---

## Phase 1 — Foundation & API Contract

**Objective:** Create a maintainable React application shell, a documented API contract, and the
infrastructure every later phase depends on.

**Delivered**

- Vite + React 19 + TypeScript (strict) project with npm lockfile and pinned compatible tooling.
- Tailwind CSS v4 design tokens and hand-authored shadcn/ui primitives: button, input, label, card, table,
  badge, dialog, separator, skeleton, and toaster.
- Responsive application shell: fixed sidebar on large screens, dialog navigation on small screens, skip
  link, sticky header, main content region, and footer.
- Routes `/` (redirect to `/dashboard`), `/dashboard`, `/customers`, `/invoices`, and `*` (not found).
  Customer and invoice pages are explicit "Coming in a later phase" placeholders listing the endpoints that
  already exist.
- Typed fetch client with injected access-token provider, query serialization, abort support, correlation
  IDs, ProblemDetails parsing, normalized `ApiError` / `NetworkError` / `ParseError`, and no retries.
- Zod-validated public environment (`VITE_API_BASE_URL`), rejected embedded credentials, and a visible
  configuration error page.
- TanStack Query provider with conservative retry defaults, React error boundary, route error page, and
  loading state.
- Vitest + React Testing Library + jsdom infrastructure with 39 tests across 7 files.
- Frontend documentation: [`api-contract.md`](api-contract.md), this plan, and the project README.

**Exit criteria**

- `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` pass.
- All required routes render and are reachable from the shell.
- API client behavior is covered by deterministic mocks; no backend is required for unit tests.
- No secrets, fake business data, dashboard metrics, or authentication claims exist in the UI.
- Backend Release build and all 284 backend tests still pass; Docker Compose configuration remains valid.

**Verification record**

| Check                       | Result                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| TypeScript (`tsc -b`)       | Pass, strict mode                                                   |
| ESLint (`--max-warnings=0`) | Pass, zero warnings                                                 |
| Vitest                      | 39 tests in 7 files pass                                            |
| Production build            | Pass; route-level chunks plus React/data/UI vendor chunks           |
| Backend                     | Unchanged; Release build and 284 tests re-verified                  |
| Docker Compose              | `docker compose config --quiet` passes with placeholder environment |

**Known constraints carried forward**

- The browser cannot call the API until `Cors:AllowedOrigins` includes the frontend origin. The base Compose
  file does not set it; the Phase 2 local override adds `http://localhost:5173`.
- Invoice list responses use `pageNumber`; customer lists use `page`. The client models both envelopes.
- There is no dashboard aggregation, refresh-token, or logout endpoint. Later phases must not pretend
  otherwise.

---

## Phase 2 — Authentication & App Shell

**Objective:** Add real registration, login, session visibility, and protected routing without implying
capabilities the API does not have.

**Status:** Complete.

**Delivered**

- `/login` and `/register` using React Hook Form and shared Zod schemas. Registration mirrors the ASP.NET Core
  Identity password rules and never signs the user in; success redirects to login with a success message.
- A single session controller with `anonymous`, `authenticating`, and `authenticated` states. The access token
  and identity from `GET /api/auth/me` are stored together in memory only.
- Conservative expiry based on `expiresIn`, with a 10% margin capped at 30 seconds, plus a visible local
  session-end time in the sidebar.
- Protected `/dashboard`, `/customers`, and `/invoices` routes with safe return-path restoration and no
  protected-content flash. Signed-in users are redirected away from auth pages.
- Authenticated shell with verified identity, desktop and mobile sign-out, accessible focus behavior, and an
  auth-only layout without the workspace sidebar.
- Token attachment for authenticated calls, explicit opt-out for login/registration, token-aware global `401`
  handling, and protection against stale `/me` responses or stale `401` responses.
- Sign-out, expiry, and unauthorized invalidation all cancel in-flight queries and clear the TanStack Query
  cache. Account switching is covered by cache-isolation tests.
- Local CORS configuration through `docker-compose.override.yml`, allowing only `http://localhost:5173`
  through the existing `Cors:AllowedOrigins` allow-list.
- 102 frontend tests across 13 files, including all Phase 2 acceptance behaviors.

**Scope**

- Login and registration pages using React Hook Form and Zod, sharing password and e-mail rules. Registration
  does not sign the user in; show a success path that leads to login.
- Auth session provider holding the access token **in memory** only. No `localStorage` persistence, no
  token in URLs, no logging. Session state exposes `authenticated`, `expiresAt`, and `user`.
- Authenticated shell: current user summary from `GET /api/auth/me`, explicit sign-out that clears memory and
  the query cache, and an expiry notice before the 30-minute token lifetime ends.
- Protected route wrapper that redirects unauthenticated users to login and preserves the intended path.
- Global `401` handling in the API client/query layer: clear the session, cancel in-flight queries, and
  redirect to login with a safe message.
- Cache isolation per authenticated user. No customer or invoice data may survive sign-out or a user change.
- Test coverage for redirects, token attachment, expiry handling, 401 invalidation, and sign-out.

**Explicit non-goals**

- No refresh-token flow, token rotation, "remember me", OAuth, password reset, or e-mail verification.
- No server-side logout or revocation call. Sign-out is local only; document that the stateless token remains
  valid until expiry.
- No client-side JWT signature verification and no role-based UI beyond what `/me` reports.

**Exit criteria**

- Anonymous visits to `/dashboard`, `/customers`, and `/invoices` redirect to login.
- A successful login reaches the originally requested route; sign-out clears all user-specific state.
- Expired tokens produce a single clear re-authentication path, not a retry loop.
- Tokens never appear in storage, logs, analytics, error messages, or rendered output.

**Dependencies and risks:** Phase 1 client token hook and environment provider. Login/register are rate
limited (10 and 5 requests per minute per IP); UI must explain `429` and honor `Retry-After` rather than
retrying automatically.

**Verification record**

| Check                       | Result                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`tsc -b`)       | Pass, strict mode                                                                                                             |
| ESLint (`--max-warnings=0`) | Pass, zero warnings                                                                                                           |
| Prettier (`format:check`)   | Pass                                                                                                                          |
| Vitest                      | 102 tests in 13 files pass                                                                                                    |
| Production build            | Pass; auth pages are route-level chunks                                                                                       |
| Backend                     | Unchanged; Release build and 284 tests re-verified                                                                            |
| Docker Compose              | Merged config sets only `Cors__AllowedOrigins__0=http://localhost:5173`                                                       |
| Live API                    | Register `201`, login `200`, `/me` `200` with `User` role, invalid token `401`                                                |
| Live CORS                   | Allowed preflight includes the Vite origin; a disallowed origin gets none                                                     |
| Headless browser            | Anonymous redirect, login plus `/me` identity, reload session loss, re-login, sign-out, and post-sign-out protection all pass |

**Known constraints carried forward**

- Page reload ends the session because the token is memory-only. This is intentional.
- There is no refresh-token flow. Token expiry requires a new login.
- Sign-out is local only; the stateless JWT remains valid until its own expiry.
- A committed end-to-end browser suite is not part of this phase; Phase 2 was checked ad hoc with headless Chrome, and repeatable E2E coverage is planned for Phase 9.
- Invoices remain a placeholder until Phases 4–6.

---

## Phase 3 — Customer Management

**Objective:** Deliver complete, owner-safe customer CRUD against the existing endpoints.

**Scope**

- Paginated customer table using the customer envelope (`page`), page size 20 by default with a 1–100 limit,
  and accessible pagination controls.
- Server-side search across name, e-mail, and tax number, plus allow-listed sorting (`name`, `email`,
  `createdAt`, `updatedAt`) with `asc`/`desc`.
- Create and edit dialogs using React Hook Form + Zod that mirror backend rules: 2–200 character name,
  254-character e-mail, 30-character phone pattern, 500-character address, and 10/11-digit tax number.
- Server validation mapping from PascalCase `errors` keys to form fields, including focus management and an
  error summary.
- Duplicate e-mail `409` feedback tied to the form, not a generic toast.
- Delete confirmation with the `409` "customer has invoices" guard explained in place; no silent forced
  deletion and no fake success.
- Empty, loading, error, and no-results states. Updates are full replacements and last-write-wins; the UI must
  not imply concurrency protection for customers.

**Exit criteria**

- All five customer endpoints are used exactly as documented.
- Create, edit, delete, search, sort, and paginate flows work against the real API.
- Cross-owner/missing customers show a not-found state without suggesting the record exists elsewhere.
- Forms recover from server validation and conflict errors without losing user input.

**Dependencies and risks:** Phase 2 session and API client. Search should be debounced; every query must be
user-scoped and cancellable.

**Status: Complete (verified 2026-11-13).**

**Verification record**

| Check                       | Result                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`tsc -b`)       | Pass, strict mode                                                                                                             |
| ESLint (`--max-warnings=0`) | Pass, zero warnings                                                                                                           |
| Prettier (`format:check`)   | Pass                                                                                                                          |
| Vitest                      | 135 tests in 17 files pass; 102 existing tests plus 33 customer tests                                                         |
| Production build            | Pass; customer list/create/detail/edit pages remain route-level chunks                                                        |
| Backend                     | Release build passes with zero warnings; 284 tests pass (75 unit, 209 integration)                                            |
| Live API                    | Disposable-account CRUD, search, sort, pagination, validation, duplicate e-mail, ownership `404`, auth `401`, and delete pass |
| Headless browser            | Login, API list/search, detail, full PUT edit, dialog focus/cancel, delete, sign-out, cache/UI isolation, and no storage pass |

**Backend constraints carried forward**

- Customer edits are full replacements with last-write-wins semantics; there is no concurrency token.
- Customer e-mail uniqueness is case-insensitive and owner-scoped.
- Customers with invoices cannot be deleted; the API returns `409` and offers no force-delete operation.
- Missing and cross-owner records deliberately share the same `404` response.
- Administrators can see all customer records. The frontend does not add role-specific filtering or ownership
  transfer controls.
- A committed browser E2E suite is still deferred to Phase 9; this phase was verified with an ad hoc
  disposable-account headless-Chrome run.

---

## Phase 4 — Invoice Discovery & Read-Only Management

**Objective:** Make invoices discoverable and readable, with list-side operations only.

**Scope**

- Invoice list using `pageNumber`, `pageSize`, `status`, `customerId`, `issueDateFrom`, `issueDateTo`,
  invoice-number `search`, and allow-listed sorting. Default sort is `issueDate` descending.
- Filter bar with clear/reset behavior, URL-synchronized filters, and accessible status badges
  (`Draft`, `Sent`, `Paid`, `Cancelled`).
- Invoice detail view showing header, customer reference, dates, status, currency, server-calculated totals,
  line items, and timestamps. Dates are rendered as calendar dates; timestamps in local time.
- Total/empty/error handling with correlation IDs available for support.

**Explicit non-goals:** No create, edit, delete, or lifecycle actions; no dashboard metrics, PDF generation,
currency conversion, client-invented invoice numbers, or client-side financial calculation.

**Exit criteria**

- List rows come from summaries and never assume `items` exists.
- Filters map to the documented parameter names, including `pageNumber` for invoices.
- Detail reads always display server totals; nothing is recalculated for display.
- No invoice mutation method or action is exposed by the Phase 4 frontend.

**Dependencies and risks:** Phase 3 customer selection and Phase 2 session. Pagination and filtering must
remain URL-driven so deep links and refreshes behave predictably.

**Status: Complete (verified 2026-11-13).**

**Verification record**

| Check                       | Result                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`tsc -b`)       | Pass, strict mode                                                                                                                 |
| ESLint (`--max-warnings=0`) | Pass, zero warnings                                                                                                               |
| Prettier (`format:check`)   | Pass                                                                                                                              |
| Vitest                      | 170 tests in 21 files pass; all 135 prior tests plus 35 invoice tests                                                             |
| Production build            | Pass; invoice list and detail remain route-level chunks                                                                           |
| Backend                     | Release build passes with zero warnings; 284 tests pass (75 unit, 209 integration)                                                |
| Live API                    | Disposable invoice list/detail, pagination, filters, sorting, money, dates, ownership, validation, auth, and cleanup pass         |
| Headless browser            | Login, list/search, detail, status/items/money/dates/customer, state restoration, read-only scope, sign-out, and storage all pass |

**Backend constraints carried forward**

- Summary rows contain `customerId`, not customer names. Phase 4 avoids N+1 decoration and resolves one
  customer only on the detail route.
- Search matches invoice numbers only. The API has no customer-name search, due-date filter, or general
  full-text search.
- Invoice decimals are JSON numbers. Values beyond JavaScript's exact two-decimal range cannot be recovered
  from the wire; the UI refuses to display an unsafe monetary value rather than silently rounding it.
- `updatedAt` is only the last-write timestamp. There are no sent, paid, or cancelled timestamps and no
  lifecycle history.
- Create/edit/delete move to Phase 5; send/mark-paid/cancel remain Phase 6. Phase 4 does not use the opaque
  concurrency token returned by read responses.
- A committed browser E2E suite remains deferred to Phase 9; verification used disposable records and an ad
  hoc headless-Chrome run.

---

## Phase 5 — Invoice Editor & Calculations

**Objective:** Build the multi-line Draft editor with local preview totals that agree with the server.

**Scope**

- Invoice editor for create and Draft update, with 1–100 line items: description, quantity, unit price, tax
  rate. Add, remove, and reorder lines with keyboard-accessible controls.
- Shared Zod schema mirroring backend limits: quantity > 0 with at most 3 decimals, unit price ≥ 0 with at
  most 2 decimals, tax rate 0–100 with at most 2 decimals, and a 1–500 character description.
- Deterministic local preview that reproduces server rules: round each line subtotal and line tax to two
  decimals with half-away-from-zero, then sum the rounded lines. The preview is labeled as an estimate; the
  server response replaces it.
- Money entry and arithmetic in integer minor units (or an equivalent decimal representation), never binary
  floating point, to avoid drift near `numeric(18,2)` limits. Formatting is centralized and currency-aware.
- Unsaved-change protection, explicit cancel, duplicate-line action, and accessible validation for indexed
  fields (`Items[0].Quantity` style server keys mapped to the correct row).
- Update sends the latest `concurrencyToken`; a stale `409` re-reads the invoice, explains the conflict, and
  requires a deliberate retry. No automatic overwrite, merge, or retry.
- Issue/due date rules: due date on or after issue date; `issueDate` required on update and optional on create.

**Exit criteria**

- A multi-line invoice created in the UI produces exactly the totals shown by the API response.
- Local previews and server responses agree at boundary values, including rounding ties.
- No calculated amount (`subtotal`, `taxTotal`, `grandTotal`, line amounts) is ever sent.
- `409` conflicts never silently discard user input.

**Dependencies and risks:** Phases 3 and 4. Decimal precision is the main risk; add focused tests for
rounding ties, 3-decimal quantities, and large monetary values.

**Status: Implemented; final live verification pending (2026-11-14).**

**Implementation record**

- Added `/invoices/new` and `/invoices/:id/edit`, Draft-only edit affordances, real server-side customer
  search/pagination, dynamic stable line arrays, validation, pending states, and session-scoped mutations.
- Added `decimal.js` calculations matching backend per-line rounding and safe JSON-number serialization
  guards. Backend totals remain authoritative and no calculated amount is submitted.
- Added opaque-token PUT handling, preserved-input `409` feedback, confirmed reload, browser/in-app unsaved
  change protection, and no persistent draft storage.
- Added deterministic financial parity and editor tests; full quality-gate results are recorded only after
  backend and live browser verification complete.

---

## Phase 6 — Invoice Lifecycle

**Objective:** Add guarded state transitions with clear, safe recovery.

**Scope**

- Actions `send`, `mark-paid`, and `cancel`, each sending `{ concurrencyToken }` and replacing the cached
  invoice with the response.
- Confirmation dialogs that state prerequisites and consequences. Send requires a customer e-mail and at
  least one item; the API sends no e-mail, and the UI must say so.
- Status-aware controls derived from the API state machine: Draft → Sent → Paid; Draft/Sent → Cancelled.
  Paid and Cancelled are terminal with no edit, delete, or further transitions.
- `409` handling for invalid transitions, stale tokens, and send prerequisites. Stale tokens re-read the
  invoice; invalid transitions explain the current status instead of offering a retry.
- Optimistic UI is limited to pending states; no speculative status change before server confirmation.
- Audit display uses `updatedAt` as the last-write timestamp only; it is not a payment or sent date.

**Exit criteria**

- Only the documented transitions are offered, and terminal invoices expose no mutating controls.
- Every action uses the latest token and refreshes the detail, list, and relevant queries on success.
- Concurrent edits produce an understandable conflict path, never a silent overwrite.

**Dependencies and risks:** Phases 4 and 5. All three actions are non-idempotent; mutation retries stay
disabled.

**Implementation record — automated checks complete; authenticated live verification pending (2026-11-14)**

- Added status-aware Send, Mark Paid, Cancel, and Draft Delete controls with accessible confirmation,
  destructive styling, pending guards, trigger-focus restoration, and honest e-mail/payment copy.
- Added typed abortable mutations, exact opaque-token payload/query handling, authoritative cache replacement,
  list invalidation, list-state-preserving deletion navigation, and no automatic retries.
- Added ownership-safe `404` messaging and `409` recovery that keeps context, re-reads the invoice, and removes
  invalid actions after the authoritative status loads.
- Added 13 focused lifecycle tests; the complete Node 24/npm 11 quality gate passes 200 tests across 24 files.
- Live PostgreSQL/API verification passed Draft → Sent → Paid, Draft/Sent → Cancelled, Draft deletion, invalid
  transition and stale-token `409`, and cross-owner `404`. Browser verification passed action visibility,
  terminal-state read-only behavior, dialog copy, safe initial focus, cancellation, and focus restoration.

---

## Phase 7 — Dashboard & Analytics

**Objective:** Provide an honest operational overview using only existing endpoints.

**Scope**

- Summary counts and recent invoices derived from `GET /api/customers` and `GET /api/invoices` with
  `pageSize=1` for counts and bounded pages for recent rows. Display the derivation and its limits.
- Status breakdown using the invoice `status` filter. No revenue, receivables aging, paid-date, or growth
  metric is fabricated.
- Any monetary aggregate is explicitly client-computed from listed rows, capped in scope, and labeled with
  the as-of time and coverage. Prefer omitting aggregates that would require unbounded page reads.
- Independent loading/error states per card so one failure does not blank the dashboard.
- Empty state for a new account with no customers or invoices.

**Explicit non-goals:** Creating a backend aggregation endpoint. If a real dashboard requires one, that is a
separately authorized backend phase with its own tests and release.

**Exit criteria**

- Every number is traceable to a documented API call.
- The dashboard states what it does not know (for example, no payment date or date-range revenue).
- No metric implies data the backend does not return.

**Dependencies and risks:** Phases 3, 4, and 6. Client aggregation cost grows with data volume; cache and
bounded queries are mandatory.

**Implementation record — automated checks complete; authenticated live verification pending (2026-11-14)**

- Added independent financial KPI, status distribution, recent invoice, customer summary, quick-action,
  onboarding, loading, partial-data, failure, and retry experiences at `/dashboard`.
- Status counts are exact filtered `totalCount` values. Recent invoices use server-side `createdAt desc`;
  customers use one bounded three-row query without N+1 decoration.
- Money KPIs aggregate every invoice only when the full data set fits within ten 100-row pages. Issued is
  Sent + Paid, Paid is Paid only, and Outstanding is Sent only. Draft and Cancelled are excluded. Larger,
  unsafe, unknown, failed, or inconsistent inputs show `Unavailable`, never a partial global total.
- Safe JSON numbers are summed with `decimal.js`; persisted totals remain authoritative. The UI documents the
  1,000-invoice coverage cap and the absence of payment dates, aging, trends, and snapshot consistency.
- Added 13 focused tests. The complete Node 24/npm 11 quality gate passes 213 tests across 26 files. Live API
  and browser verification covered the empty onboarding state, all four statuses, KPI definitions, recent
  ordering, customer summary, navigation, sign-out, and a clean re-login with user-scoped cache state. One
  empty disposable account remains because the API has no account-deletion endpoint.

---

## Phase 8 — UX, Accessibility & Security

**Objective:** Harden the application as a coherent product rather than a collection of screens.

**Scope**

- Accessibility pass: landmarks, heading order, focus management in dialogs and route changes, keyboard
  operability, visible focus, form error association, live-region announcements, reduced motion, and WCAG AA
  contrast. Manual screen-reader and keyboard testing.
- Responsive pass across phone, tablet, and desktop, including wide tables and long identifiers.
- Security pass: no secrets in the bundle, no token persistence, safe rendering of server text, no
  `dangerouslySetInnerHTML`, dependency audit, restrictive CSP/headers where hosting permits, correct
  `401`/`403`/`404`/`409`/`429` behavior, and correlation IDs shown without leaking internals.
- Consistency pass on spacing, typography, empty/error/loading states, destructive confirmations, and toast
  usage.
- Performance pass on route chunks, query caching, request cancellation, and unnecessary re-renders.
- Focused tests for the hardened behaviors; automated accessibility checks where they add signal.

**Exit criteria**

- Key flows are completable with keyboard only and announced coherently by a screen reader.
- No critical or serious automated accessibility findings remain.
- No token, credential, or signing material is reachable from the browser bundle or storage.
- Error, empty, and loading states are consistent across customers and invoices.

**Dependencies and risks:** All feature phases. This phase may reveal issues that require revisiting earlier
components; fixes stay within frontend scope.

**Implementation record — complete (2026-11-14)**

- Added route-change focus management, reduced-motion CSS, explicit required-field semantics, labelled
  customer search, stable invoice field/error relationships, and sensible focus for appended invoice lines.
- Preserved Radix focus trapping/restoration and safe initial focus for destructive dialogs. Anonymous-shell
  browser checks covered 320, 375, 768, 1024, and 1440 px without page-level horizontal overflow.
- Hardened the low-level API client to reject embedded URL credentials. Re-audited memory-only tokens,
  token-aware `401`, stale-response protection, cache isolation, safe redirects, React text escaping, and
  external-origin request construction; no regression was found.
- Reconfirmed string-backed decimal editing, `decimal.js`, backend-authoritative totals, unsafe-value guards,
  Draft-only editing, opaque concurrency tokens, route chunks, cancellation, debounce, and bounded dashboard
  requests. No backend, financial rule, or dependency changed.
- The Node 24/npm 11 quality gate passes 216 tests across 26 files. Authenticated browser verification now
  covers dashboard analytics, route-change focus, customer search, invoice filtering and badges, invoice
  detail, accessible validation, dialog initial/restore focus, mobile navigation, logout clearing private
  content, and the absence of browser storage. This closes the earlier anonymous-shell-only gap.

---

## Phase 9 — Integration Tests & Docker

**Objective:** Prove the frontend works against the real API and can be delivered reproducibly.

**Scope**

- Integration tests with deterministic API mocking for cross-feature flows: login, customer CRUD, invoice
  create/edit, lifecycle, conflict recovery, expiry, and cache isolation.
- A thin end-to-end suite against a disposable backend (Compose or Testcontainers-style environment) covering
  the critical path. Tests must not depend on developer data or fixed invoice numbers.
- Frontend production container: multi-stage build producing static assets served by a non-root runtime, with
  SPA fallback and sensible cache headers. No secrets baked into the image.
- Compose integration that preserves the existing `postgres`, `migrator`, and `api` services, adds the web
  service, and configures CORS for the web origin through an explicit, documented override or environment
  value.
- CI job for frontend typecheck, lint, unit tests, build, and image build, without disturbing existing backend
  jobs. Cache npm downloads with the lockfile.
- Documentation for local, Compose, and production-base-URL workflows.

**Exit criteria**

- The full stack starts from a clean checkout with documented commands.
- Critical-path end-to-end tests pass against the real API.
- Existing backend tests and Docker configuration remain valid.
- The production image serves deep links correctly and exposes no development tooling.

**Dependencies and risks:** All prior phases. Docker networking must not widen CORS beyond the documented
origin, and the migrator must remain a separate one-off service.

**Implementation record — complete (2026-11-14)**

- Added a Node 24 multi-stage build and unprivileged Nginx runtime with SPA fallback, same-origin API/health
  proxying, no-store private responses, immutable hashed assets, a health check, and defensive headers.
- Added an opt-in Compose `web` profile on loopback port 8081. Existing API-only startup remains unchanged;
  PostgreSQL stays private and its named volume is never deleted by normal commands.
- Added runtime `same-origin` configuration so browser JavaScript contains neither Docker service names nor
  secrets. Production dependencies report zero npm audit vulnerabilities; seven moderate advisories remain
  confined to the TypeScript ESLint development toolchain, with only a breaking forced fix offered.
- Added six isolated Playwright scenarios across desktop/mobile Chromium for auth, memory-only reload,
  ownership, customer CRUD, financial parity, concurrency, lifecycle, deletion, dashboard, and mobile logout.
  Browser artifacts are retained only on failure.
- Extended CI with cached Node 24 frontend quality, web-image build, isolated full-stack startup, readiness,
  E2E, failure artifacts, and always-run cleanup. Existing .NET and API-image jobs remain intact.
- Verified locally: all three images build, the full stack reports healthy, Nginx proxy/headers/SPA/caching
  behave as documented, persisted disposable records survive a service restart, and all six Playwright
  scenarios pass. The suite now creates accounts through the UI, raises test-only rate limits, keeps
  authenticated navigation client-side for the memory-only session, waits for state instead of sleeping, and
  asserts money values order-independently because line-item order is not part of the API contract.

---

## Phase 10 — Portfolio Release

**Objective:** Ship a documented, reviewed, tagged frontend release suitable for demonstration.

**Scope**

- Final copy and content review: no placeholder text on completed screens, no fake data, no overstated
  authentication or analytics claims.
- Documentation: README quick start, architecture notes, screenshots or a short demo walkthrough, API
  contract link, limitations, environment matrix, and troubleshooting.
- Quality gate: full frontend suite, backend suite, production build, container build, Compose validation,
  and a clean-console smoke test.
- Release hygiene: changelog entry, version bump, annotated tag (for example `web-v1.0.0`), and preserved
  backend `v1.0.0` tag. No history rewrite and no forced push.
- Retrospective: record follow-up work such as a backend dashboard endpoint, refresh tokens, or PDF support as
  explicitly out of scope rather than hidden debt.

**Exit criteria**

- A new contributor can run the frontend and backend from the README alone.
- All required checks pass on the release commit.
- The demo uses only data created through the application and clearly labels every limitation.
- The release tag and repository documentation agree on scope.

**Implementation record — local verification complete; remote CI pending (2026-11-14)**

- Reworked the root and frontend READMEs and architecture documentation for a full-stack portfolio audience.
- Added an evidence-based release matrix, exact external verification commands, screenshot checklist,
  security review, limitations, proposed release notes, and publication procedure.
- Re-ran the complete local gate: solution restore/build with zero warnings, 75 unit tests, 209 PostgreSQL
  integration tests, frontend typecheck/lint/format, 216 Vitest tests, production build, Compose
  configuration/build/startup, Nginx proxy and caching behavior, restart persistence, six Playwright
  scenarios, and the authenticated Phase 8 browser checks all pass. Six real screenshots were captured from
  the running stack in `docs/screenshots/`.
- Fixed defects found by the gate rather than relaxing assertions: dashboard queries now invalidate after
  customer/invoice mutations, the mobile Playwright project explicitly runs Chromium, authenticated E2E
  navigation stays client-side for the memory-only session, Playwright selectors are exact where labels were
  ambiguous, and the dashboard budget test no longer assumes a comma grouping separator on every host locale.
- No tag, release, commit, or push was created. Remote GitHub Actions and candidate-commit authorization are
  still required before the release can move from pending to complete.

---

## Cross-phase standards

**Code organization**

- Feature code lives under `src/features/<feature>`; shared primitives live under `src/components`.
- API access goes through `src/lib/api/client.ts` and feature endpoint modules. Components do not call
  `fetch` directly.
- Query keys are centralized per feature and include the authenticated user scope.
- Server state belongs to TanStack Query; form state belongs to React Hook Form. No duplicated derived money
  state in multiple stores.

**Contracts**

- Types mirror the documented wire shapes. Do not "fix" `page` versus `pageNumber` in a shared type; map at
  the feature boundary.
- Treat invoice `concurrencyToken` as opaque. Never decode, synthesize, or reuse it across invoices.
- Never send server-calculated fields.

**Errors**

- `400` maps to field errors when `errors` exists; otherwise show `detail`.
- `401` ends the session and routes to login; `403` shows a permission message; `404` is a neutral not-found
  state; `409` requires an explicit recovery action; `429` surfaces `Retry-After`; `5xx` shows a generic
  message with the correlation ID.
- Network, abort, and parse failures remain distinct from API validation failures.
- No automatic retries for non-idempotent requests. Read retries stay limited and never retry `4xx`.

**Quality gates per phase**

- Strict TypeScript, zero ESLint warnings, Prettier check, unit tests, production build.
- New behavior has meaningful tests; no snapshot-only coverage.
- No new dependency without a clear need, a maintained release, and compatible peer requirements.
- Backend behavior, migrations, financial rules, tests, and Compose topology remain untouched unless a
  separately authorized backend phase says otherwise.

**Definition of done**

A phase is done when its user-visible flows work against the real contract, its failure states are explicit,
its tests are deterministic, its documentation matches reality, and the required frontend and backend checks
pass without suppressions.
