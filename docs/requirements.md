# Requirements

This document captures the planned business requirements for InvoiceFlow API. Phase 2 implements the
persistence model described in sections 4 and 5, Phase 3 implements authentication and authorization,
Phase 4 implements customer management, Phase 5 implements Draft invoice CRUD and financial
calculations, and Phase 6 implements the guarded invoice lifecycle transitions. Phase 7 implements the API
quality, security, and observability requirements in sections 9 and 10. Phase 8 hardens the integration
suite and adds CI requirements in section 11. Phase 9 containerizes the API and adds deployment
requirements in section 12.
Phase 10 adds no business behavior; it packages the implemented system for accurate portfolio review,
reproducible demonstration, and release preparation.

## 1. Scope

InvoiceFlow API is a RESTful backend for small businesses to manage their customers and invoices.

In scope:

- user registration and JWT authentication,
- Admin and User roles,
- customer management,
- invoice and invoice-item management,
- invoice lifecycle (Draft, Sent, Paid, Cancelled),
- server-side tax and total calculations,
- search, filtering, and pagination,
- standardized API errors and validation.

Out of scope:

- real payment processing,
- external accounting or e-invoice integrations,
- e-mail delivery, PDF generation, and notifications,
- multi-currency support in the first version (TRY only),
- file attachments.

## 2. Authentication and roles

- Users register with an e-mail address and password. Passwords are hashed by ASP.NET Core Identity
  (PBKDF2) and are never stored or logged in plain text.
- Public registration creates **User** accounts only and does not sign the user in automatically. Admin
  accounts are provisioned through an explicit, opt-in command, never through the public API.
- Login returns a signed HS256 JWT bearer token carrying the user id, e-mail, and roles.
- JWT validation checks the signature, issuer, audience, lifetime, and algorithm. The signing key is read
  only from `Jwt__SigningKey`; it must be at least 32 bytes and is never committed.
- Password policy: at least 12 characters with upper-case, lower-case, digit, and non-alphanumeric
  characters.
- Accounts lock out for 15 minutes after 5 failed login attempts. The lockout is enabled for new users.
- Every endpoint except registration, login, and the health endpoint requires authentication.
- Two roles exist: **Admin** and **User**. The `AdminOnly` and `AuthenticatedUser` authorization policies
  are registered.
- Unauthenticated requests return `401 Unauthorized`; authenticated requests without the required role
  return `403 Forbidden`.
- Access tokens expire after 30 minutes by default (`Jwt:AccessTokenMinutes`). Refresh tokens, OAuth social
  login, e-mail verification, password reset, and two-factor authentication are out of scope for Phase 3.

## 3. Ownership and access restrictions

- A **User** owns the customers and invoices they create.
- A **User** can read and modify only their own customers and invoices. Requests for resources owned by
  another user must return `404 Not Found` rather than `403 Forbidden`, so the API does not reveal the
  existence of other users' data.
- An **Admin** can read and manage all customers and invoices, and can change invoice status as needed.
- Admin-only operations are explicitly marked and tested.

## 4. Customer fields and validation

| Field         | Type     | Required | Rules                                                        |
| ------------- | -------- | -------- | ------------------------------------------------------------ |
| `id`          | GUID     | system   | Primary key                                                  |
| `name`        | string   | yes      | 2–200 characters, trimmed                                   |
| `email`       | string   | no       | Valid e-mail address, stored lowercase; unique per owner when present (Phase 4) |
| `phone`       | string   | no       | Up to 30 characters, digits, spaces, `+`, `-`, parentheses   |
| `taxNumber`   | string   | no       | 10 or 11 digits (Turkish VKN/TCKN), validated when present   |
| `address`     | string   | no       | Up to 500 characters, free-form address                      |
| `createdAt`   | datetime | system   | UTC, set on creation                                        |
| `updatedAt`   | datetime | system   | UTC, updated on every change                                |

Deletion rules:

- A customer that has at least one invoice **cannot be deleted**; the API returns `409 Conflict`.
- Deleting a customer without invoices removes the record.

## 5. Invoice fields

| Field         | Type     | Required | Rules                                                    |
| ------------- | -------- | -------- | -------------------------------------------------------- |
| `id`          | GUID     | system   | Primary key                                              |
| `invoiceNumber` | string | system   | Globally unique `INV-YYYY-NNNNNN`, generated by the server |
| `customerId`  | GUID     | yes      | Must reference a customer owned by the current user      |
| `issueDate`   | date     | yes      | Defaults to today (UTC)                                  |
| `dueDate`     | date     | yes      | Must be on or after `issueDate`                          |
| `status`      | enum     | system   | `Draft`, `Sent`, `Paid`, `Cancelled`; starts as `Draft`  |
| `currency`    | string   | system   | `TRY` in the first version                               |
| `subtotal`    | decimal  | system   | Sum of line net amounts, calculated server-side          |
| `taxTotal`    | decimal  | system   | Sum of line tax amounts, calculated server-side          |
| `grandTotal`  | decimal  | system   | `subtotal + taxTotal`, calculated server-side            |
| `items`       | array    | yes      | Between 1 and 100 items                                  |
| `createdAt`   | datetime | system   | UTC                                                      |
| `updatedAt`   | datetime | system   | UTC                                                      |

### Invoice item fields

| Field         | Type     | Required | Rules                                                     |
| ------------- | -------- | -------- | --------------------------------------------------------- |
| `id`          | GUID     | system   | Primary key                                               |
| `description` | string   | yes      | 1–500 characters                                          |
| `quantity`    | decimal  | yes      | Greater than 0; up to 3 decimal places (`numeric(18,3)`)   |
| `unitPrice`   | decimal  | yes      | Greater than or equal to 0; `numeric(18,2)`                |
| `taxRate`     | decimal  | yes      | Percentage between 0 and 100; `numeric(5,2)`               |
| `lineSubtotal`| decimal  | system   | `quantity × unitPrice`, rounded, calculated server-side    |
| `lineTax`     | decimal  | system   | `lineSubtotal × taxRate / 100`, rounded, calculated server-side |
| `lineTotal`   | decimal  | system   | `lineSubtotal + lineTax`, calculated server-side           |

Clients never send totals; any client-supplied totals are ignored.

Invoice numbers use one global PostgreSQL sequence. The year component comes from `issueDate`; the numeric
suffix is globally increasing and does not reset each year. Concurrent requests cannot receive the same
number. Sequence gaps are accepted when a transaction fails or is rolled back.

Draft invoice update and deletion require the opaque `concurrencyToken` returned by invoice responses.
Update sends it in the JSON body; delete sends it as the `concurrencyToken` query parameter. A stale token
returns `409 Conflict`. The token format is intentionally opaque and does not expose PostgreSQL details.
Lifecycle actions also require the latest token in a JSON request body and return a fresh token on success.

## 6. Invoice status transitions

```text
Draft ──send──▶ Sent ──pay──▶ Paid
  │               │
  └──cancel──▶ Cancelled ◀──cancel──┘
```

- `Draft → Sent` via `POST /api/invoices/{id}/send`.
- `Draft → Cancelled` and `Sent → Cancelled` via `POST /api/invoices/{id}/cancel`.
- `Sent → Paid` via `POST /api/invoices/{id}/mark-paid`.
- `Paid` and `Cancelled` are terminal; no transition leaves them.
- Any other transition returns `409 Conflict` with a ProblemDetails body.
- Every action requires the latest opaque concurrency token in `{ "concurrencyToken": "..." }`. Missing
  or malformed tokens return `400`; stale or concurrently used tokens return `409`.
- Only **Draft** invoices can be edited (header or items). Editing a `Sent`, `Paid`, or `Cancelled`
  invoice returns `409 Conflict`.
- Sending an invoice requires at least one item and a customer with an e-mail address.
- Marking an invoice Paid is a manual status change only; it does not represent payment processing.

## 7. Financial calculation rules

- All monetary values use `decimal`; binary floating point is never used for money.
- Rounding policy: `MidpointRounding.AwayFromZero` to **two decimal places**, applied per line and then
  summed:
  1. `lineSubtotal = round(quantity × unitPrice, 2)`
  2. `lineTax = round(lineSubtotal × taxRate / 100, 2)`
  3. `lineTotal = lineSubtotal + lineTax`
  4. `subtotal = Σ lineSubtotal`, `taxTotal = Σ lineTax`, `grandTotal = subtotal + taxTotal`
- Rounding happens per line so that the printed invoice and its stored totals always add up.
- The same rules are applied on every create and update; totals are never accepted from the client.
- The first version supports **TRY only**; no currency conversion is performed.

## 8. Pagination and filtering

- All collection endpoints are paginated.
- Customer `page` and invoice `pageNumber` are 1-based; `pageSize` defaults to 20 and is capped at 100.
- Responses use an envelope: `items`, `page`, `pageSize`, `totalCount`, `totalPages`.
- Invalid pagination values return `400 Bad Request`.
- Customers can be filtered by a `search` term matching name, e-mail, or tax number (case-insensitive).
- Invoices can be filtered by `status`, `customerId`, `issueDateFrom`, `issueDateTo`, and a `search` term
  matching the invoice number.
- Sorting is explicit and limited to documented fields (for example `issueDate`, `grandTotal`, `createdAt`).

## 9. API error handling

- Errors use [RFC 9457 ProblemDetails](https://www.rfc-editor.org/rfc/rfc9457) with `type`, `title`,
  `status`, `detail`, `instance`, and the request-specific `traceId` and `correlationId` extensions.
- Every error response uses the `application/problem+json` media type.
- Validation failures, malformed JSON, and invalid model binding return `400` with an `errors` object keyed
  by field name.
- `401 Unauthorized` for missing or invalid credentials/tokens; `403 Forbidden` for role violations.
- `404 Not Found` for missing resources, resources owned by another user, and unknown routes.
- `409 Conflict` for business-rule violations (invalid status transition, deleting a customer with
  invoices, duplicate e-mail, stale concurrency token).
- `429 Too Many Requests` when a credential-endpoint rate limit is exceeded, with `Retry-After` when
  available.
- Unhandled exceptions return `500` without leaking stack traces, exception types, connection strings,
  SQL details, or internal identifiers.
- Error responses never include sensitive data such as password hashes, tokens, or signing keys.

## 10. API quality, security, and observability

### Correlation IDs

- Clients may supply `X-Correlation-ID`.
- A valid value is preserved; a missing, overlong, multi-valued, or unsafe value is replaced with a
  generated identifier.
- Valid values are limited to 128 printable ASCII characters from a safe set; control characters and
  arbitrary header content are rejected.
- The resolved identifier is echoed in the response header, used as the request trace identifier, added to
  the logging scope, and included in error diagnostics.

### Structured logging

- Development uses human-readable console logs; non-Development uses structured JSON console logs.
- Each request produces one completion log with method, path without query values, status code, duration,
  and correlation ID.
- Authorization headers, JWTs, passwords, connection strings, signing keys, credential request bodies, and
  full sensitive customer data are never logged.
- Exception details are available to internal diagnostics without exposing them to clients.

### Rate limiting

- `POST /api/auth/login` is limited to 10 requests per minute per client by default.
- `POST /api/auth/register` is limited to 5 requests per minute per client by default.
- The partition key is the direct client address; a safe fallback is used when it is unavailable.
- `X-Forwarded-For` is not trusted unless the request comes from a proxy explicitly configured as trusted.
- Rate limiting is in memory and per application instance; it is a defensive control, not a distributed
  security boundary. Redis or another distributed limiter is out of scope.

### CORS

- Allowed origins are read from configuration; the default is no cross-origin access.
- Origins are matched exactly; wildcard origins are not used.
- Credentials are not enabled, so wildcard origins and credentials are never combined.
- Production must configure only trusted origins; there is no permissive fallback.

### Health checks

- `GET /health/live` is liveness and does not depend on PostgreSQL.
- `GET /health` is readiness and reports `Healthy` only when PostgreSQL is reachable.
- Both endpoints are anonymous, return the same JSON contract, expose no secrets, and are suitable for
  container probes.
- Migrations are never applied automatically at startup.

### Production security

- Swagger UI and the OpenAPI document are exposed only in Development.
- HTTPS redirection and HSTS are enabled outside Development.
- The API expects a TLS-terminating reverse proxy or direct HTTPS listener in Production; trusted proxies
  must be configured explicitly when forwarded headers are used.
- Authentication runs before authorization, and both run after CORS and rate limiting.
- No secrets are committed to configuration.

### Stateless JWT limitation

- JWT validation covers signature, issuer, audience, lifetime, algorithm, and role claims.
- A token remains valid until expiry even if the user is deleted, locked out, or loses a role; only
  `/api/auth/me` checks that the account still exists.
- Refresh tokens, token revocation, and blacklists are out of scope. Short token lifetimes are the
  mitigation.

## 11. Test and CI requirements

- Unit tests run without external dependencies.
- Integration tests use a real PostgreSQL 17 instance provisioned by Testcontainers; no manually started
  database, local service, or developer-specific path is required.
- One container is shared per test collection. All database-backed tests join that collection and run
  serially, so database resets cannot race with another database test.
- Every database test starts from a predictable state: application tables are truncated and the invoice
  number sequence is restarted.
- Tests do not depend on execution order, shared mutable state, or a developer's local database.
- Tests use test-only JWT values and container-generated credentials. No production secrets or user
  secrets are required.
- Non-database tests may run in parallel; global parallelization is not disabled.
- End-to-end tests cover the complete user, cancellation, authorization, and concurrency journeys.
- CI runs on GitHub Actions for pushes and pull requests to the primary branch, and supports manual
  dispatch. It installs the SDK from `global.json`, restores, builds in Release, runs unit and integration
  tests separately, and publishes test results as artifacts.
- CI uses minimal permissions (`contents: read`) and does not require repository secrets.
- Test failures must be diagnosable from test names, assertion messages, and TRX artifacts without
  exposing secrets.
- Coverage may be collected with the existing `coverlet.collector` package; no arbitrary percentage
  threshold is enforced.

## 12. Deployment and container requirements

- The API is packaged as a multi-stage Docker image using the official .NET 10 SDK and ASP.NET Core runtime
  images. The runtime image contains only published output and runs as a non-root user.
- The container listens on port `8080`. The API runtime image must not contain the SDK, source, tests, or
  local environment files.
- Docker Compose runs the API and PostgreSQL 17. PostgreSQL uses a named persistent volume, a `pg_isready`
  health check, and is not published to the host by default.
- The API is published only on the loopback interface (`127.0.0.1:8080`) for local use and depends on a
  healthy PostgreSQL service.
- Configuration is supplied through environment variables using the existing keys:
  `ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_HTTP_PORTS`, `ConnectionStrings__DefaultConnection`,
  `Jwt__SigningKey`, `Jwt__Issuer`, `Jwt__Audience`, `Jwt__AccessTokenMinutes`, and the PostgreSQL
  credentials. No competing configuration keys are introduced.
- `.env.example` contains placeholders only; `.env` is gitignored. Images must not embed secrets,
  connection strings, or JWT signing keys.
- Migrations are isolated from normal API startup code. The Compose migrator service runs an EF Core
  migration bundle after PostgreSQL becomes healthy; the API starts only after that service succeeds. The
  migrator fails on errors, does not reset data, and does not require the SDK in the API runtime container.
- Container health checks use `/health/live` semantics for liveness and `/health` for readiness. They must
  work without `curl` or `wget`, and readiness must fail when PostgreSQL is unavailable.
- Production Swagger/OpenAPI remain disabled. TLS termination at a trusted reverse proxy and the
  corresponding `ReverseProxy__KnownProxies` configuration are deployment responsibilities.
- CI verifies that the API and migrator images build and that the Compose file is valid. CI does not
  publish images or require registry credentials.

## 13. Decisions

1. A User owns the customers and invoices they create.
2. Admin has administrative access to all resources; normal users can access only their own resources.
3. Public registration can create only User accounts.
4. Invoice totals are calculated server-side and never trusted from the client.
5. Invoice items use decimal quantities, prices, and tax rates.
6. Monetary amounts are rounded to two decimal places using `MidpointRounding.AwayFromZero`, per line, as
   described in section 7.
7. The first version supports TRY only.
8. Only Draft invoices can be edited.
9. Draft and Sent invoices can be cancelled.
10. Paid and Cancelled invoices are terminal states.
11. Customers with existing invoices cannot be deleted.
12. No real payment processing or external accounting integrations are included.
13. Persistence uses PostgreSQL with EF Core 10 and the Npgsql provider; the schema is created only by
    committed EF Core migrations.
14. Invoice numbers are globally unique.
15. An invoice's owner must match the owner of its customer. This is enforced by a composite foreign key
    on `(CustomerId, OwnerId)`.
16. Monetary values are stored as `numeric(18,2)`, quantities as `numeric(18,3)`, and tax rates as
    `numeric(5,2)` percentages (for example `20.00` for 20%).
17. Invoice status is stored as a stable string value (`Draft`, `Sent`, `Paid`, `Cancelled`).
18. Customers are stored with a single free-form `Address` field, and e-mail is optional at the
    persistence level. The API may require an e-mail before an invoice is sent.
19. Invoice concurrency uses PostgreSQL's `xmin` system column through a `uint` row-version property.
20. Authentication uses ASP.NET Core Identity for users and password hashing; the API issues JWT bearer
    tokens.
21. Public registration assigns only the User role and does not return a token.
22. Login failures return a generic `401` response that does not reveal whether the e-mail exists.
23. The JWT signing key is read only from `Jwt__SigningKey`, must be at least 32 bytes, and is validated at
    startup.
24. Admin provisioning is an explicit command, disabled by default; it is idempotent, never overwrites a
    password, and never promotes an existing normal user.
25. Authentication errors use ProblemDetails; production responses never include stack traces.
26. Invoice numbers use a global PostgreSQL sequence formatted as `INV-YYYY-NNNNNN`; the suffix does not
    reset annually and gaps are acceptable.
27. Draft invoices are hard-deleted in Phase 5; their items are cascade-deleted and the customer remains.
28. Invoice update and deletion use an opaque API concurrency token backed by PostgreSQL `xmin`.
29. Invoice notes are not included; Phase 6 resolves cancellation metadata by storing no reason/history.
30. Lifecycle actions mutate only `Status`, `UpdatedAt`, and PostgreSQL's row version; all invoice business
    and financial data remains unchanged.
31. Phase 6 stores no cancellation reason/history and publishes no lifecycle events.
32. Every error response uses ProblemDetails with a safe request trace/correlation identifier.
33. Correlation IDs are accepted only when they are bounded, printable, and composed of a safe character
    set; otherwise the API generates one.
34. HTTP logging is structured and emits one completion record per request without query values,
    credentials, or sensitive payloads.
35. Login and registration use native ASP.NET Core in-memory rate limiting per client address; the limits
    are per instance and are not a distributed security boundary.
36. CORS is opt-in through configuration; the default allows no cross-origin access, wildcards are not
    used, and credentials are never enabled.
37. `/health` remains the PostgreSQL readiness probe and `/health/live` is a dependency-free liveness
    probe; neither requires authentication.
38. JWTs are stateless: deleted users and changed roles remain effective until the current token expires.
    Refresh tokens, revocation, and blacklists are out of scope.
39. Integration tests use one Testcontainers PostgreSQL container per xUnit collection, not one container
    per test and not a manually managed database.
40. All database-backed tests join a single collection, which serializes them; database resets are
    truncation-based and restart the invoice number sequence.
41. Test factories that do not require PostgreSQL use an unreachable connection string so they cannot
    modify a local development database.
42. End-to-end workflow tests are added for complete user, cancellation, authorization, and concurrency
    journeys; per-behavior tests remain the primary regression suite.
43. CI uses GitHub Actions with the SDK pinned by `global.json`, a Release build, Docker-backed
    Testcontainers, separate unit/integration test runs, and TRX artifact upload.
44. CI permissions are limited to `contents: read`; no repository secrets are required for the test suite.
45. The API ships as a multi-stage container image running as the built-in non-root `app` user on port 8080.
46. Docker Compose runs PostgreSQL 17 with a named volume and no published database port; only the API is
    exposed on the host loopback interface.
47. Configuration reuses the existing environment-variable keys; no container-specific configuration keys
    are introduced.
48. Migrations are applied by a one-off Compose migrator service built from an EF Core migration bundle;
    the API waits for it to succeed, while the API runtime image contains no SDK and never migrates itself.
49. Container health checks use bash `/dev/tcp` against the existing health endpoints to avoid adding
    `curl` or `wget` to the runtime image.
50. CI builds the API and migrator images and validates the Compose file without publishing images or
    requiring secrets.

## 14. Open decisions

The following points are intentionally left open until the relevant phase; they are not to be invented
during implementation without a decision here.

- **Soft delete for customers**: whether customers are soft-deleted for history.
- **Multiple tax rates per line**: whether a line can carry more than one tax component (for example
  VAT + withholding).
- **Structured customer address**: the current schema stores one free-form address field; split fields
  (street, city, postal code, country) may be introduced later.
- **Invoice notes**: a free-form notes field is not part of Phase 5; decide whether to add it later.
- **Cancellation metadata**: Phase 6 stores no reason/history; reconsider only if audit requirements change.
- **Admin account provisioning**: resolved in Phase 3 with the explicit `--provision-admin` command
  (`AdminProvisioning__Enabled`, `AdminProvisioning__Email`, `AdminProvisioning__Password`).
- **Token lifetime and refresh tokens**: access tokens default to 30 minutes. Refresh tokens remain out of
  scope; decide whether to add them in a later phase.
- **E-mail verification and password reset**: not implemented in Phase 3; decide whether they are required
  before production use.
- **Search behavior**: simple `ILIKE` search vs. PostgreSQL full-text search.
