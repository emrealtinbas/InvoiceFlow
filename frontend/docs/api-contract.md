# InvoiceFlow API contract

**Audited against:** InvoiceFlow API v1.0.0, commit `5919daf` and the working tree on 2026-11-13.
**Audience:** frontend phases 2–9.
**Source of truth:** the ASP.NET Core controllers, request/response DTOs, authentication setup, error
handling, persistence configuration, and integration tests in `src/` and `tests/`. Documentation was used
as a cross-check, not as the primary source.

The frontend does not change, wrap, or extend this contract. Fields and endpoints below exist in the
released backend. Nothing is proposed here.

---

## 1. Base URL and environment

| Environment                         | API base URL            | Notes                                                                                                         |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Docker Compose (repository default) | `http://localhost:8080` | Compose publishes only `127.0.0.1:8080`; PostgreSQL is not published.                                         |
| Local `dotnet run` launch profile   | `http://localhost:5188` | Swagger UI at `/swagger`, OpenAPI at `/openapi/v1.json` in Development.                                       |
| Production                          | Deployment-specific     | TLS terminates at a trusted reverse proxy or configured HTTPS listener. There is no committed production URL. |

- Endpoint paths already include `/api` (`/api/auth/login`, `/api/customers`, `/api/invoices`). There is
  no additional `/v1` path segment. The API release is `v1.0.0`; the wire paths are unversioned.
- The frontend reads `VITE_API_BASE_URL` and requires an absolute `http` or `https` URL without embedded
  credentials. Trailing slashes are normalized away.
- Vite embeds `VITE_*` values into the browser bundle. They are public. Never place a JWT signing key,
  database password, API secret, or refresh token in frontend configuration.
- The base URL is a build-time value for production bundles. Set it for the target environment before
  `npm run build`; changing it later requires a rebuild.
- `frontend/.env.example` is committed; `frontend/.env` is gitignored.

### CORS

- `Cors:AllowedOrigins` is an explicit allow-list and is **empty by default**. With the default, a browser
  frontend at `http://localhost:5173` cannot call the API.
- Configured origins allow any header and any method. Credentials are disabled, so the frontend must use
  the `Authorization: Bearer` header and must not rely on cookies.
- For local development against `dotnet run`, set an origin before starting the API:

  ```bash
  export Cors__AllowedOrigins__0=http://localhost:5173
  dotnet run --project src/InvoiceFlow.Api
  ```

- The base `docker-compose.yml` does not pass CORS settings through. This repository includes a local-only
  `docker-compose.override.yml` at the repository root that adds
  `Cors__AllowedOrigins__0: http://localhost:5173` to the API environment. Compose merges it automatically;
  deployments that do not use the override retain the empty allow-list.
- Do not add wildcard origins or enable credentials. The frontend sends `Authorization: Bearer` and
  `credentials: 'omit'`.
- This is a deployment/configuration limitation, not a backend defect. Phase 2 makes browser API calls, so
  local development requires either the override or the environment variable above.

### Health endpoints (anonymous, not used by Phase 1 UI)

| Endpoint           | Purpose                           | Success | Failure                          |
| ------------------ | --------------------------------- | ------- | -------------------------------- |
| `GET /health/live` | Process liveness, no dependencies | `200`   | —                                |
| `GET /health`      | Readiness including PostgreSQL    | `200`   | `503` with a health JSON payload |

Health responses are not ProblemDetails. They are operational probes, not dashboard data.

---

## 2. Serialization conventions

- JSON property names are camelCase.
- `InvoiceStatus` is serialized as a string: `"Draft"`, `"Sent"`, `"Paid"`, `"Cancelled"`.
- Calendar dates (`issueDate`, `dueDate`) are ISO 8601 `YYYY-MM-DD` values with no time or time zone.
- Audit timestamps (`createdAt`, `updatedAt`) are ISO 8601 UTC instants with a `Z` offset. They come from
  PostgreSQL `timestamp with time zone`.
- Monetary values and quantities are JSON numbers, not strings.
- Successful writes return the affected representation as JSON. Deletes return `204 No Content`.
- Unknown JSON properties sent by a client are ignored by the default ASP.NET Core serializer; the client
  must still send only documented fields.

### Decimal and financial precision

- The server stores and calculates in `decimal`; no binary floating point is used.
- Invoice monetary totals are `numeric(18,2)`. Quantities are `numeric(18,3)`. Tax rates are
  `numeric(5,2)` percentages.
- Each line subtotal and line tax is rounded to two decimals with `MidpointRounding.AwayFromZero`; invoice
  totals are the sums of those **rounded** line amounts. Clients must never send calculated amounts.
- Maximum money value: `9,999,999,999,999,999.99`. Maximum quantity: `999,999,999,999,999.999`.
- **Frontend limitation:** JSON numbers are parsed into JavaScript `number` values, which are IEEE-754
  doubles. Values above `Number.MAX_SAFE_INTEGER` (`~9.007e15`) cannot represent every cent in the API's
  maximum monetary range. Display formatting is safe for normal invoice amounts, but the Phase 5 editor
  must use integer minor units or a decimal library for entry and local totals. The server response remains
  authoritative; the frontend must not persist or submit its own totals.

### Dates and time zones

- `issueDate` and `dueDate` are calendar dates. Do not convert them through a time zone; pass and display
  them as `YYYY-MM-DD`.
- On create, an omitted `issueDate` defaults to the current **UTC** date on the server.
- On update, `issueDate` is required; it is not defaulted.
- Audit timestamps are true instants and should be formatted in the user's locale/time zone.

---

## 3. Authentication

All authentication endpoints are under `/api/auth`. `register` and `login` are anonymous and rate limited
by client IP. `/me` requires a bearer token.

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.test",
  "password": "a-strong-disposable-password"
}
```

| Field      | Required | Rules                                                                                                                                                 |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`    | yes      | Valid e-mail address, at most 320 characters; trimmed; Identity requires unique e-mail                                                                |
| `password` | yes      | 1–128 characters at the transport layer; Identity requires at least 12 characters with upper-case, lower-case, digit, and non-alphanumeric characters |

Success: `201 Created`, `Location: /api/auth/me`, body:

```json
{ "id": "<guid>", "email": "user@example.test", "role": "User" }
```

- Registration does **not** return a token and does not sign the user in.
- Public registration always creates the `User` role. It cannot create an Admin.
- Duplicate e-mail: `409 Conflict` ProblemDetails.
- Identity rule failures: `400` `ValidationProblemDetails` with `errors`.
- Rate limit: 5 requests per minute per IP; `429` ProblemDetails with `Retry-After`.
- Account creation failure: `500` ProblemDetails with no internal detail.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.test", "password": "a-strong-disposable-password" }
```

Success: `200 OK`

```json
{ "accessToken": "<jwt>", "tokenType": "Bearer", "expiresIn": 1800 }
```

- `expiresIn` is the token lifetime in seconds (`Jwt:AccessTokenMinutes` × 60; default 30 minutes).
- Invalid e-mail **or** password returns the same generic `401 Unauthorized` ProblemDetails; the response
  does not reveal whether the account exists.
- Five failed attempts trigger the ASP.NET Core Identity lockout (15 minutes by default). The login response
  remains generic.
- Rate limit: 10 requests per minute per IP; `429` ProblemDetails with `Retry-After`.

### Current user

```http
GET /api/auth/me
Authorization: Bearer <jwt>
```

Success: `200 OK`

```json
{ "id": "<guid>", "email": "user@example.test", "roles": ["User"] }
```

- Returns `401` when the token is missing, invalid, or expired.
- Also returns `401` when the token is valid but the account no longer exists. This is the only endpoint that
  checks current account existence.

### JWT behavior and logout limitations

- Tokens are HS256 JWTs. Default issuer `InvoiceFlow`, audience `InvoiceFlow.Api`; both are configuration
  values, not frontend validation inputs. The frontend does not verify signatures.
- Claims include `sub` (user id), `email`, `jti`, `iat`, and one `role` claim per role. The API maps the
  role claim explicitly.
- Validation checks signature, issuer, audience, lifetime, expiration presence, signed-token requirement,
  and the HS256 algorithm. Clock skew is 5 seconds.
- **There is no refresh-token endpoint.** When the token expires, the only recovery is a new login.
- **There is no server-side logout endpoint.** Logout can only discard the client-held token.
- Tokens are stateless and are not revocable. A deleted, locked, or role-changed user keeps the token's
  claims until expiry. Only `/api/auth/me` re-checks account existence.
- Do not invent `/refresh`, `/logout`, or `/revoke` calls.

### Authentication and authorization errors

| Status | Meaning                                                                | Body                                       |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------ |
| `401`  | Missing, malformed, expired, or otherwise invalid token; invalid login | ProblemDetails, `application/problem+json` |
| `403`  | Authenticated but missing the required role                            | ProblemDetails                             |
| `429`  | Login/register rate limit exceeded                                     | ProblemDetails plus `Retry-After`          |

The API does not use cookies for authentication. Send `Authorization: Bearer <token>` and omit browser
credentials.

### Phase 2 frontend integration

- Login calls `POST /api/auth/login` without a bearer token, then immediately verifies the issued token with
  `GET /api/auth/me` using an explicit `Authorization` header. No session is published until `/me` succeeds.
- Registration calls only `POST /api/auth/register`. The returned `id`, `email`, and `role` are validated, but
  no session is created and no token is expected.
- Successful auth payloads are validated at runtime. Missing fields, an unexpected `tokenType`, a non-positive
  `expiresIn`, or a malformed `/me` body produce a user-safe contract error rather than a partial session.
- The access token lives in memory only. It is never written to `localStorage`, `sessionStorage`, cookies,
  the URL, logs, or rendered output. A page reload therefore ends the session.
- The frontend derives a conservative local expiry from `expiresIn` and clears the session before the server
  deadline. It does not decode the JWT for identity or expiry.
- An authenticated `401` clears the current session only when it belongs to the token currently in memory.
  Delayed responses from an earlier session are ignored.
- `401` from login is displayed as invalid credentials. `429` is displayed with the parsed `Retry-After`
  value. Neither request is retried automatically.
- Sign-out is local: it discards the token and identity and clears cached query data. The stateless JWT is not
  revoked server-side and remains valid until its own expiry.
- There is no refresh-token flow. Once the token expires, the user must sign in again.

---

## 4. Customer endpoints

Every customer endpoint requires a valid bearer token. Ownership is derived from the JWT and is never
accepted from the request body or query string. Administrators may access all customers but cannot transfer
ownership.

### Customer representation

```json
{
  "id": "<guid>",
  "name": "Northwind Demo Studio",
  "email": "billing@example.test",
  "phone": "+90 555 000 00 00",
  "address": "Istanbul, Türkiye",
  "taxNumber": "1234567890",
  "createdAt": "2026-11-13T12:34:56.789Z",
  "updatedAt": null
}
```

Optional fields may be `null`. `ownerId` and Identity data are never exposed.

### Endpoints

| Method   | Path                  | Success            | Purpose                               |
| -------- | --------------------- | ------------------ | ------------------------------------- |
| `POST`   | `/api/customers`      | `201` + `Location` | Create a customer                     |
| `GET`    | `/api/customers/{id}` | `200`              | Read one visible customer             |
| `GET`    | `/api/customers`      | `200`              | List with search, sorting, pagination |
| `PUT`    | `/api/customers/{id}` | `200`              | Full replacement of mutable fields    |
| `DELETE` | `/api/customers/{id}` | `204`              | Delete a customer with no invoices    |

### Write fields (create and update are identical)

```json
{
  "name": "Northwind Demo Studio",
  "email": "billing@example.test",
  "phone": "+90 555 000 00 00",
  "address": "Istanbul, Türkiye",
  "taxNumber": "1234567890"
}
```

| Field       | Required | Validation                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------ |
| `name`      | yes      | Trimmed; 2–200 characters; must not be blank                                         |
| `email`     | no       | Valid e-mail; at most 254 characters; blank becomes `null`; stored lowercase         |
| `phone`     | no       | At most 30 characters; only digits, spaces, `+`, `-`, `(`, `)`; blank becomes `null` |
| `address`   | no       | At most 500 characters; blank becomes `null`                                         |
| `taxNumber` | no       | Exactly 10 or 11 digits; blank becomes `null`                                        |

- E-mail uniqueness is case-insensitive and **per owner**. A duplicate for the same owner returns
  `409 Conflict` with detail `A customer with this e-mail address already exists.`
- Invalid fields return `400` `ValidationProblemDetails`; keys reflect server property names.
- Create/update do not accept `id`, `ownerId`, or timestamps.
- Update is a full replacement, not a patch. Omitted optional fields become `null`.
- Customer updates have **no concurrency token**. The last successful write wins.
- Deleting a customer that has at least one invoice returns `409 Conflict` with detail
  `The customer cannot be deleted because it has invoices.`
- Missing or cross-owner customers return `404` with detail `The customer was not found.`

### List query

```http
GET /api/customers?page=1&pageSize=20&search=acme&sortBy=name&sortDirection=asc
```

| Parameter       | Default | Contract                                                                               |
| --------------- | ------- | -------------------------------------------------------------------------------------- |
| `page`          | `1`     | Integer ≥ 1. Customer lists use `page`, not `pageNumber`.                              |
| `pageSize`      | `20`    | Integer 1–100                                                                          |
| `search`        | —       | Case-insensitive `ILIKE` match on name, e-mail, or tax number; `%` and `_` are escaped |
| `sortBy`        | `name`  | `name`, `email`, `createdAt`, or `updatedAt`                                           |
| `sortDirection` | `asc`   | `asc` or `desc`; invalid values return `400`                                           |

Response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalCount": 0,
  "totalPages": 0
}
```

Sorting is deterministic with `id` as a tie-breaker. Invalid pagination, sort field, or sort direction returns
`400` `ValidationProblemDetails`.

### Phase 3 frontend integration notes

- Implemented routes are `/customers`, `/customers/new`, `/customers/:id`, and
  `/customers/:id/edit`; all remain behind the Phase 2 authentication guard.
- List requests always send `page`, `pageSize`, `sortBy`, and `sortDirection`; `search` is omitted when empty.
  URL defaults are canonicalized away, and unsupported URL values are normalized before reaching the API.
- Search is server-side and debounced by 300 ms. Changing search, sorting, or page size resets `page` to 1.
  Obsolete requests receive an abort signal.
- Query keys contain the verified `/me` user id in addition to list/detail parameters. Sign-in, sign-out,
  expiry, and current-token `401` handling continue to clear the global query cache.
- Create and update payloads always contain every mutable write field. Blank optional form values are sent as
  `null`; the frontend does not emulate PATCH or invent a concurrency token.
- Mutations are never retried. Successful create/update invalidate customer lists; successful delete removes
  the detail cache and invalidates lists. Delete waits for `204` before navigating or changing visible data.
- The same generic not-found UI is used for missing and cross-owner `404` responses. Duplicate e-mail and
  invoice-backed delete conflicts are shown in their respective form/dialog without rendering raw exceptions.

Live verification on 2026-11-13 confirmed `201` create, `200` list/search/detail/update, `204` delete,
owner-isolated `404` for read/update/delete, `409` duplicate e-mail, `400` invalid paging/sorting, wildcard
escaping, empty-list `totalPages: 0`, and unauthenticated `401`.

---

## 5. Invoice endpoints

Every invoice endpoint requires a valid bearer token. Ownership comes from the JWT; administrative users
may access invoices across owners but cannot create an invoice under another owner's customer or transfer
ownership.

### Status model

```text
Draft ──send──▶ Sent ──mark-paid──▶ Paid
  │               │
  └──cancel──▶ Cancelled ◀──cancel──┘
```

| Transition          | Action                              | Allowed from |
| ------------------- | ----------------------------------- | ------------ |
| `Draft → Sent`      | `POST /api/invoices/{id}/send`      | Draft        |
| `Sent → Paid`       | `POST /api/invoices/{id}/mark-paid` | Sent         |
| `Draft → Cancelled` | `POST /api/invoices/{id}/cancel`    | Draft        |
| `Sent → Cancelled`  | `POST /api/invoices/{id}/cancel`    | Sent         |

- `Paid` and `Cancelled` are terminal. No update, delete, or further transition is allowed.
- Any other pair, including repeated actions, returns `409 Conflict`.
- "Send" and "mark paid" are status transitions only. No e-mail is sent and no payment is processed.
- Sending requires a customer with a non-empty e-mail address. (An invoice always has at least one item.)

### Create

```http
POST /api/invoices
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "customerId": "<guid>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "items": [
    { "description": "API implementation", "quantity": 2.5, "unitPrice": 1200.0, "taxRate": 20.0 }
  ]
}
```

| Field                 | Required | Rules                                                     |
| --------------------- | -------- | --------------------------------------------------------- |
| `customerId`          | yes      | Non-empty GUID; must be a customer owned by the caller    |
| `issueDate`           | no       | `YYYY-MM-DD`; defaults to the current UTC date            |
| `dueDate`             | yes      | `YYYY-MM-DD`; on or after `issueDate`                     |
| `items`               | yes      | 1–100 items                                               |
| `items[].description` | yes      | Trimmed; 1–500 characters; not blank                      |
| `items[].quantity`    | yes      | > 0 and ≤ `999999999999999.999`; at most 3 decimal places |
| `items[].unitPrice`   | yes      | 0 to `9999999999999999.99`; at most 2 decimal places      |
| `items[].taxRate`     | yes      | 0–100 percent; at most 2 decimal places                   |

The server generates `invoiceNumber` (`INV-YYYY-NNNNNN`) and fixes `currency` to `TRY`. Clients must not send
`invoiceNumber`, `currency`, `status`, `subtotal`, `taxTotal`, `grandTotal`, line amounts, `ownerId`, or
timestamps.

Success: `201 Created` with a full invoice and a `Location` header.

```json
{
  "id": "<guid>",
  "invoiceNumber": "INV-2026-000001",
  "customerId": "<guid>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "status": "Draft",
  "currency": "TRY",
  "subtotal": 4350.0,
  "taxTotal": 735.0,
  "grandTotal": 5085.0,
  "createdAt": "2026-11-13T12:34:56.789Z",
  "updatedAt": null,
  "concurrencyToken": "<opaque-base64>",
  "items": [
    {
      "id": "<guid>",
      "description": "API implementation",
      "quantity": 2.5,
      "unitPrice": 1200.0,
      "taxRate": 20.0,
      "lineSubtotal": 3000.0,
      "lineTax": 600.0,
      "lineTotal": 3600.0
    }
  ]
}
```

- A non-existent or other-owner customer returns `404` with detail `The customer was not found.`
- Date, item, decimal-scale, and financial-range failures return `400` `ValidationProblemDetails`.
- `201` responses include the first concurrency token.

### Read and list

`GET /api/invoices/{id}` returns the same full shape, including items and the latest `concurrencyToken`, or
`404` if not visible.

`GET /api/invoices` returns **summaries** (no `items`) with this envelope:

```json
{
  "items": [
    {
      "id": "<guid>",
      "invoiceNumber": "INV-2026-000001",
      "customerId": "<guid>",
      "issueDate": "2026-11-13",
      "dueDate": "2026-11-27",
      "status": "Draft",
      "currency": "TRY",
      "subtotal": 4350.0,
      "taxTotal": 735.0,
      "grandTotal": 5085.0,
      "createdAt": "2026-11-13T12:34:56.789Z",
      "updatedAt": null,
      "concurrencyToken": "<opaque-base64>"
    }
  ],
  "pageNumber": 1,
  "pageSize": 20,
  "totalCount": 1,
  "totalPages": 1
}
```

List query:

| Parameter       | Default     | Contract                                                                    |
| --------------- | ----------- | --------------------------------------------------------------------------- |
| `pageNumber`    | `1`         | Integer ≥ 1. Invoice lists use `pageNumber`.                                |
| `pageSize`      | `20`        | Integer 1–100                                                               |
| `customerId`    | —           | GUID filter                                                                 |
| `status`        | —           | Case-insensitive name: `Draft`, `Sent`, `Paid`, `Cancelled`                 |
| `issueDateFrom` | —           | Inclusive `YYYY-MM-DD` lower bound                                          |
| `issueDateTo`   | —           | Inclusive `YYYY-MM-DD` upper bound; must be on or after `issueDateFrom`     |
| `search`        | —           | Case-insensitive `ILIKE` match on invoice number only                       |
| `sortBy`        | `issueDate` | `invoiceNumber`, `issueDate`, `dueDate`, `grandTotal`, or `createdAt`       |
| `sortDirection` | `desc`      | `asc` or `desc`; **invoices default to descending, customers to ascending** |

Invalid filters return `400` `ValidationProblemDetails`. Sorting is deterministic with `id` as a tie-breaker.

### Phase 4 frontend integration notes

- Implemented routes are `/invoices` and `/invoices/:id`; both remain protected by the shared authentication
  guard. The frontend calls only the two `GET` invoice endpoints in Phase 4.
- List requests always send `pageNumber`, `pageSize`, `sortBy`, and `sortDirection`. Empty optional filters are
  omitted. URL state supports `customerId`, `status`, `issueDateFrom`, `issueDateTo`, and `search`; arbitrary
  parameters and invalid values are normalized away before reaching the API.
- Search is debounced by 300 ms and matches invoice number only. Filter, sort, and page-size changes reset
  `pageNumber` to 1. Obsolete requests consume an abort signal.
- The list DTO has no customer name. List rows show and link `customerId` without global customer prefetching
  or N+1 requests. The detail route performs one customer detail query and falls back to the identifier when
  that record is unavailable.
- Known statuses use accessible text badges; an unknown response string renders a safe `Unknown` state rather
  than causing a route failure. No status is inferred from dates or totals.
- Calendar dates are parsed from their `YYYY-MM-DD` components and formatted with a UTC timezone, so local
  timezone offsets cannot change the day. `createdAt` and `updatedAt` remain UTC instants formatted in the
  browser locale.
- All financial values displayed are returned by the API. The frontend does not recalculate line or invoice
  totals. TRY uses `tr-TR` currency formatting, including zero values.
- JSON decimals arrive as JavaScript numbers. When a monetary value's cents are not safely representable, the
  UI displays `Amount unavailable`; the exact original decimal lexeme is already unavailable after JSON
  parsing. This is preferable to silently displaying a rounded authoritative total.
- Invoice query keys include the verified user id and all list parameters. Sign-in/sign-out/expiry/current
  token `401` protections continue to clear private cached data.

Live verification on 2026-11-13 confirmed `200` list/detail, `pageNumber` pagination, all four supported filter
types, invoice-number search with wildcard escaping, allow-listed sorting, string `Draft` status, TRY totals,
date-only serialization, customer linkage, invalid-filter `400`, missing/cross-owner `404`, unauthenticated
`401`, and disposable-record cleanup.

### Update (Draft only)

```http
PUT /api/invoices/{id}
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "customerId": "<guid>",
  "issueDate": "2026-11-13",
  "dueDate": "2026-11-27",
  "concurrencyToken": "<latest-token>",
  "items": [
    { "description": "API implementation", "quantity": 2.5, "unitPrice": 1200.0, "taxRate": 20.0 }
  ]
}
```

- Full replacement of header dates, customer, and all items. There is no patch endpoint.
- `issueDate` is required on update.
- Only `Draft` invoices can be updated. `Sent`, `Paid`, and `Cancelled` return `409` with detail
  `Only Draft invoices can be updated.`
- A malformed token returns `400` with a `ConcurrencyToken` validation error.
- A stale token returns `409` with detail
  `The concurrency token is stale. Retrieve the invoice again and retry with the latest token.`
- A race detected during persistence returns `409` with a concurrent-change detail. If a concurrent write is
  detected, item replacement and totals are rolled back atomically.
- Success returns `200` with the fresh full invoice and a new concurrency token.
- Sending an invoice does not change items or financial totals; it changes status, `updatedAt`, and the
  token.

### Delete (Draft only)

```http
DELETE /api/invoices/{id}?concurrencyToken=<latest-token>
Authorization: Bearer <jwt>
```

- The token is a **required query parameter** for delete, unlike update/lifecycle where it is in the body.
- Only Draft invoices can be deleted. Others return `409`.
- Missing/malformed token returns `400`; stale token returns `409`.
- Success returns `204 No Content`; invoice items are cascade-deleted and the customer is retained.

### Concurrency token

- The token is an opaque Base64 encoding of the PostgreSQL `xmin` row version: a big-endian 32-bit unsigned
  integer, typically 8 Base64 characters including padding.
- Treat it as opaque. Do not decode, compare, cache across invoices, or synthesize it.
- Every invoice write (update, lifecycle, delete) requires the latest token. Every successful write returns a
  fresh token in the response.
- `409 Conflict` means the client must re-read the invoice, present the new state, and retry deliberately.
  There is no `ETag`/`If-Match` support and no server-side merge.
- The summary rows in invoice lists also carry a token, but reading one invoice before a write is the safest
  way to obtain the current state.

### Lifecycle actions

All three actions use the same request body and return the full invoice:

```http
POST /api/invoices/{id}/send
POST /api/invoices/{id}/mark-paid
POST /api/invoices/{id}/cancel

{ "concurrencyToken": "<latest-token>" }
```

| Action      | Success                                | Failure cases                                                                                               |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `send`      | `200`, status `Sent`, fresh token      | `400` bad token, `404` invisible invoice, `409` invalid transition, stale token, or missing customer e-mail |
| `mark-paid` | `200`, status `Paid`, fresh token      | `400`, `404`, `409` invalid transition or stale token                                                       |
| `cancel`    | `200`, status `Cancelled`, fresh token | `400`, `404`, `409` invalid transition or stale token                                                       |

Send prerequisites (`409` detail `Sending requires at least one invoice item and a customer e-mail address.`):
at least one item and a customer whose e-mail is not blank. Financial data is unchanged. Lifecycle actions
do not record cancellation reasons or history.

### Phase 6 frontend lifecycle integration

- Draft shows Edit, Send, Cancel, and Delete. Sent shows Mark Paid and Cancel. Paid and Cancelled are
  terminal and expose no mutation controls.
- Every action opens a keyboard-accessible confirmation dialog naming the invoice and consequence. The safe
  Cancel action receives initial focus; closing restores focus to the trigger. Cancel/delete use destructive
  styling. Pending dialogs cannot close or submit twice.
- Send copy states that the operation does not deliver e-mail. Mark Paid states that it is not payment
  processing. No lifecycle timestamp is invented; `updatedAt` remains labeled Last updated.
- Send, Mark Paid, and Cancel send exactly `{ concurrencyToken }`. Delete sends the same opaque token as a
  safely encoded query parameter. Mutations do not retry and totals are not recalculated.
- Successful lifecycle responses replace the scoped detail cache with the authoritative response and fresh
  token, then invalidate invoice lists. Successful deletion removes detail cache and returns to the previous
  list URL when available.
- `409` keeps the dialog open and offers Reload Latest Invoice. Reload performs a fresh GET before the next
  action so invalid controls disappear with the new status. `404` never distinguishes missing from
  inaccessible invoices.
- Mutation fetches carry an abort signal. User-scoped query keys, session cache clearing, and abort-on-unmount
  prevent an old session response from populating a newer account's UI.

---

### Phase 5 editor precision and concurrency behavior

- Create sends only `customerId`, `issueDate`, `dueDate`, and input line fields. Update sends the same full
  replacement plus the latest opaque `concurrencyToken`. Item IDs and all calculated values are omitted.
- Editable decimal fields remain strings until validation and request mapping. `decimal.js` calculates line
  subtotal, line tax, and totals with per-line half-up rounding. Since the API rejects negative quantities,
  prices, and tax rates, this is equivalent to the backend's away-from-zero midpoint behavior.
- The JSON-number wire contract is narrower than PostgreSQL `numeric`. Before converting a validated string
  to a JavaScript number, the editor checks its scaled integer against `Number.MAX_SAFE_INTEGER` and verifies
  that converting back produces the identical decimal. Unsafe values are rejected locally rather than
  truncated or silently rounded.
- A `409` update never triggers an automatic retry. The editor preserves dirty fields, explains the conflict,
  and requires explicit confirmation before reloading the latest invoice and discarding edits.
- Successful create/update responses replace preview assumptions with the backend representation and fresh
  concurrency token. Draft forms are not stored in browser storage.

## 6. Error contract

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) ProblemDetails with
`Content-Type: application/problem+json`.

```json
{
  "type": "<problem-type-uri>",
  "title": "Conflict",
  "status": 409,
  "detail": "The concurrency token is stale. Retrieve the invoice again and retry with the latest token.",
  "instance": "/api/invoices/<id>",
  "traceId": "<correlation-id>",
  "correlationId": "<correlation-id>"
}
```

- `traceId` and `correlationId` currently carry the same request correlation value.
- `status` is an integer and matches the HTTP status.
- `type`, `title`, `detail`, `instance`, and extensions are strings when present.
- Validation failures add `errors`:

  ```json
  {
    "title": "One or more validation errors occurred.",
    "status": 400,
    "detail": "The request could not be validated. See the errors property for details.",
    "instance": "/api/customers",
    "errors": {
      "Email": ["The Email field is not a valid e-mail address."]
    }
  }
  ```

- Error keys use ASP.NET Core field names, normally PascalCase (for example `Name`, `Email`,
  `ConcurrencyToken`, and indexed item fields). Frontend form fields are camelCase; map them
  case-insensitively where possible.
- Malformed JSON and model-binding failures also return `400` with this shape.
- Unknown routes return `404` ProblemDetails; unhandled exceptions return `500` with a generic detail. Stack
  traces, exception types, SQL, connection strings, and tokens are never returned.
- Cross-owner resources return `404`, not `403`. `403` is reserved for role authorization failures.
- Errors never include password hashes, access tokens, or signing keys.

### Correlation IDs

- Every response includes `X-Correlation-ID`.
- A client may send `X-Correlation-ID`; the API preserves it when it is a single value of at most 128
  printable ASCII letters, digits, `-`, `_`, `.`, or `:`. Missing or unsafe values are replaced.
- The frontend API client generates a correlation ID per request and preserves a caller-supplied one.
- This is the only correlation value the frontend should display to users for support.

### Error matrix

| Status | Typical causes                                                                                           | Frontend behavior                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `400`  | Validation errors, malformed JSON, bad sort/filter, malformed concurrency token                          | Show field errors where `errors` exists; otherwise show the detail                |
| `401`  | Missing/expired/invalid token, bad credentials                                                           | Clear the session and return to login (Phase 2)                                   |
| `403`  | Missing required role                                                                                    | Show a permission message; do not retry                                           |
| `404`  | Missing resource, cross-owner resource, unknown route                                                    | Treat as not found/inaccessible; never infer existence                            |
| `409`  | Duplicate customer e-mail, customer has invoices, non-Draft edit/delete, invalid transition, stale token | Show the detail and an explicit recovery action; re-read on concurrency conflicts |
| `429`  | Login/register rate limit                                                                                | Show `Retry-After` guidance; do not retry automatically                           |
| `500`  | Unhandled server failure                                                                                 | Show a generic error with the correlation ID                                      |

Network failures (no HTTP response), aborts, and response parse failures are handled separately by the
frontend client. They are not API validation errors.

---

## 7. Ownership isolation

- Ownership comes only from the validated JWT `sub` claim.
- A normal user's reads and writes are filtered to their own customers and invoices. Another user's
  resource returns `404` with a generic "not found" detail.
- Administrators can read, update, delete, and transition existing resources across owners. They cannot
  create an invoice under another owner's customer, and no endpoint changes ownership.
- A composite database foreign key also requires an invoice and its customer to share an owner.
- The frontend must scope caches by authenticated user and must not reuse data across sessions.

---

## 8. Pagination and sorting summary

| Aspect            | Customers                                               | Invoices                                                           |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Page parameter    | `page`                                                  | `pageNumber`                                                       |
| Page size         | `pageSize`, default 20, max 100                         | `pageSize`, default 20, max 100                                    |
| Response envelope | `items`, `page`, `pageSize`, `totalCount`, `totalPages` | `items`, `pageNumber`, `pageSize`, `totalCount`, `totalPages`      |
| Default sort      | `name` ascending                                        | `issueDate` descending                                             |
| Allowed sorts     | `name`, `email`, `createdAt`, `updatedAt`               | `invoiceNumber`, `issueDate`, `dueDate`, `grandTotal`, `createdAt` |
| Search            | name, e-mail, tax number                                | invoice number                                                     |
| Filters           | —                                                       | `customerId`, `status`, `issueDateFrom`, `issueDateTo`             |

- Page numbers are 1-based.
- `totalPages` is `0` when `totalCount` is `0`.
- Requesting a page beyond the end returns an empty `items` array, not an error.
- The list envelopes are **not** interchangeable. TypeScript models both explicitly in
  `src/lib/api/pagination.ts`.

---

## 9. Dashboard and analytics

**The API has no dashboard aggregation endpoint.** There is no endpoint for revenue, receivables, aging,
counts by status, recent activity, or customer invoice counts.

Consequences for frontend Phase 7:

- `GET /api/invoices?pageSize=1` exposes only `totalCount` for the filtered set.
- Summing `grandTotal` requires reading pages (maximum 100 rows per request). This is a client-side
  aggregation with real cost and race caveats, not an API guarantee.
- No date-range revenue endpoint and no paid-date field exist. `updatedAt` reflects the last write, not a
  payment date.
- A backend aggregation endpoint would require explicit authorization and a backend phase; Phase 1 does not
  create one.

### Phase 7 request and metric contract

- Exact status counts use four independent requests (`status=Draft|Sent|Paid|Cancelled`, `pageSize=1`) and
  read `totalCount`; invoice rows are not downloaded for the distribution.
- Recent activity requests five rows sorted by `createdAt desc`. It is therefore recent creation activity,
  not recent issue dates or lifecycle history.
- Customer summary requests three rows sorted by `createdAt desc` and uses the customer envelope's
  `totalCount`; it never decorates invoices with N+1 customer reads.
- Financial aggregation reads all invoice summary pages at 100 rows per page only when `totalPages <= 10`
  and `totalCount <= 1,000`. The first response establishes the workload. If it exceeds either bound, no
  further financial pages are fetched and the money KPIs are unavailable.
- `Issued = Sent + Paid`, `Paid = Paid`, and `Outstanding = Sent`. Draft and Cancelled values do not enter
  these sums. Paid is an application status, not evidence of payment settlement.
- Parsed monetary numbers must round-trip through the frontend's exact two-decimal safe-number check before
  conversion to `decimal.js`. One unsafe amount, unknown status, failed page, or inconsistent page result
  makes the aggregate unavailable; no partial total is displayed.

The bounded pages are separate HTTP requests, not a database snapshot. Concurrent writes can make their
combined view temporarily inconsistent. The UI labels the coverage and does not offer revenue trends,
date-range revenue, receivables aging, or payment-date analytics because the contract cannot support them.

Do not fabricate dashboard values or imply that a metric endpoint exists.

---

## 10. Frontend security boundary and deployment requirements

- Browser route guards, hidden controls, and cache isolation improve UX but do not authorize requests. JWT
  validation, ownership filtering, role checks, input validation, and concurrency enforcement remain API
  responsibilities.
- The access token is memory-only and sent solely as a bearer header to the validated API base URL. The URL
  must be absolute HTTP(S) and cannot contain embedded credentials. Anonymous auth calls explicitly suppress
  token attachment; fetch uses `credentials: 'omit'`.
- Production must use HTTPS for both frontend and API. Plain HTTP is supported only for local development;
  the static bundle cannot enforce transport security.
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, clickjacking protection, SPA
  fallback, and static-asset cache headers belong to the Phase 9 web server/reverse proxy. A CSP must allow
  only the deployed API origin in `connect-src`; do not add broad wildcards or inline-script exceptions.
- React text rendering is used for customer/server content; no `dangerouslySetInnerHTML` path exists. Safe
  return-path validation prevents absolute, protocol-relative, backslash, control-character, and auth-loop
  redirects.
- Local sign-out cannot revoke the stateless JWT, and reload loses the memory-only session. Refresh tokens,
  revocation, password reset, MFA, and persistent login require backend support and remain unavailable.

---

## 11. Documented discrepancies and limitations

These were found by comparing the implementation with committed documentation. The frontend follows the
implementation. No backend changes were made.

1. **Invoice pagination property name.** `docs/requirements.md` says responses use an envelope with `page`
   for both resources. The invoice controller returns `InvoicePagedResponse` with **`pageNumber`**; customers
   return `PagedResponse` with **`page`**. This is an actual wire-format difference.
2. **Customer updates have no concurrency control.** Documentation discusses invoice concurrency only; this
   contract states explicitly that customer updates are last-write-wins.
3. **No dashboard aggregation endpoint.** The API documentation does not claim one, but the frontend plan
   must account for its absence rather than assume a metrics API.
4. **CORS has no default origin and Compose does not configure one.** A browser client needs explicit
   `Cors:AllowedOrigins` configuration. The API is correct; the local setup is incomplete for browser use.
5. **The API examples omit several endpoints.** `docs/api-examples.md` demonstrates register, login, me,
   customer create/read, invoice create/read/update/send/mark-paid, and terminal-state rejection. It does not
   demonstrate cancel, customer list/update/delete, invoice list/delete, or all error shapes. This document
   records those from code and tests; there is no behavioral conflict.
6. **README scope was outdated.** The released README said the project excludes a frontend. Phase 1 added a
   separate `frontend/` application and corrected the scope wording; the backend remains unchanged.
7. **Invoice JSON decimals are numbers, not strings.** At the API's maximum monetary range, a JavaScript
   `number` cannot represent every two-decimal value exactly. This is a frontend precision risk, not a
   backend calculation error.
8. **JWT expiry has no refresh path.** The documented 30-minute lifetime and absent refresh/revocation are
   consistent between requirements and code, but they constrain Phase 2 session design.
9. **`PATCH` is not supported.** Customer and invoice updates are full replacements via `PUT`.
10. **Rate limits are per API process and per IP.** They are defensive, not a distributed guarantee, and do
    not apply to authenticated CRUD endpoints.
