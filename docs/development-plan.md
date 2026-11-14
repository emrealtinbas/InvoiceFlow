# Development Plan

InvoiceFlow API is built in small, verifiable phases. Each phase ends with its acceptance criteria
verified before the next one starts.

## Phase 1 — Project Foundation ✅

- [x] Create the .NET 10 solution (`InvoiceFlow.slnx`) with API, unit test, and integration test projects
- [x] Enable nullable reference types, implicit usings, and treat warnings as errors
- [x] Configure controller-based API, OpenAPI document, and Swagger UI (Development only)
- [x] Add `GET /health` returning `{"status":"Healthy"}` without authentication
- [x] Establish code style with `.editorconfig`
- [x] Add a meaningful unit test and an HTTP integration smoke test
- [x] Write README and architecture/requirements documentation
- [x] Verify `dotnet restore`, `dotnet build` (no warnings), and `dotnet test`

Acceptance criteria verified on 2026-11-12: restore, build, and test succeed; the API starts; `GET /health`
returns `200 OK` with the documented payload; OpenAPI and Swagger UI are served in Development.

## Phase 2 — Database & Persistence ✅

- [x] Add EF Core 10 with the Npgsql provider and a PostgreSQL connection string
- [x] Create the `AppDbContext` (Identity-based) and entity configurations for users, customers, invoices, and items
- [x] Configure relationships, indexes, check constraints, delete behaviors, and decimal precision
- [x] Enforce that an invoice owner matches the customer owner with a composite foreign key
- [x] Add optimistic concurrency through PostgreSQL `xmin`
- [x] Add the initial migration and a documented way to apply it (local `dotnet-ef` tool)
- [x] Register the `DbContext` with dependency injection
- [x] Extend the health endpoint with a PostgreSQL readiness check (`200` healthy, `503` unhealthy)
- [x] Cover persistence with Testcontainers-based integration tests against real PostgreSQL

Acceptance criteria verified on 2026-11-12: migrations apply to PostgreSQL 17; persistence, constraint, and
health tests pass; Phase 1 endpoints and tests still pass.

## Phase 3 — Authentication & Authorization ✅

- [x] User entity, password hashing, and registration endpoint (User role only)
- [x] Login endpoint issuing JWT bearer tokens
- [x] JWT validation and role-based authorization policies (`AdminOnly`, `AuthenticatedUser`)
- [x] `/api/auth/me` endpoint using the validated JWT subject
- [x] Explicit, idempotent admin provisioning command
- [x] Swagger UI Bearer authentication workflow
- [x] Tests for registration, login, invalid credentials, JWT validation, authorization, and provisioning

Acceptance criteria verified on 2026-11-12: registration, login, JWT validation, roles/policies,
`/api/auth/me`, and admin provisioning work against real PostgreSQL; Swagger documents the Bearer
scheme; 79 tests pass; build has zero warnings.

## Phase 4 — Customer Management ✅

- [x] Customer CRUD endpoints scoped to the owning user
- [x] Validation rules, e-mail uniqueness per owner, and admin access
- [x] Prevent deletion of customers that have invoices
- [x] Search and pagination
- [x] Unit and integration tests

Acceptance criteria verified on 2026-11-12: customer CRUD, ownership isolation, admin access, validation,
per-owner e-mail uniqueness, deletion protection, search, sorting, and pagination work against real
PostgreSQL; 138 tests pass and the build has zero warnings.

## Phase 5 — Invoice Core ✅

- [x] Invoice and invoice-item endpoints
- [x] Server-side totals with the documented rounding policy
- [x] PostgreSQL sequence-backed invoice numbering
- [x] Validation of items, dates, financial ranges, and customer ownership
- [x] Draft-only update/delete with optimistic concurrency tokens
- [x] Invoice filtering, deterministic sorting, and pagination
- [x] Unit and PostgreSQL integration tests

Acceptance criteria verified on 2026-11-12: Draft invoice CRUD, atomic item replacement, decimal financial
calculations, globally unique numbering, owner/admin access, filtering, pagination, and stale-write handling
work against PostgreSQL 17; 185 tests pass and the build has zero warnings.

## Phase 6 — Invoice Lifecycle ✅

- [x] Send, cancel, and mark-as-paid actions
- [x] Status-transition guards with `409 Conflict` on invalid transitions
- [x] Owner/admin authorization and opaque concurrency tokens
- [x] Data-preserving lifecycle writes and UTC audit updates
- [x] Tests for every allowed and rejected transition

Acceptance criteria verified on 2026-11-12: all four allowed transitions, terminal states, invalid-state
conflicts, owner/admin access, send prerequisites, stale and concurrent token handling, audit updates, and
financial/item preservation work against PostgreSQL 17; 221 tests pass and the build has zero warnings.

## Phase 7 — API Quality & Security ✅

- [x] Standardized ProblemDetails error handling for 400, 401, 403, 404, 409, 429, and 500 with
      `application/problem+json`, safe `traceId`/`correlationId` diagnostics, malformed-JSON handling, and a
      single global exception handler
- [x] Request validation audit using the existing DataAnnotations/`IValidatableObject` approach (no second
      validation framework)
- [x] Built-in structured logging: human-readable in Development, JSON in Production, one request completion
      log with method/path/status/duration/correlation ID and no sensitive payloads
- [x] `X-Correlation-ID` support with validation, generation, response echo, logging scope, and error
      diagnostics
- [x] Native ASP.NET Core fixed-window rate limiting for login (10/min) and registration (5/min) with
      ProblemDetails 429 responses and `Retry-After`
- [x] Explicit configuration-driven CORS with no default cross-origin access, no wildcards, and no
      credentials
- [x] Production security review: Development-only Swagger, HSTS and HTTPS redirection outside Development,
      safe exception behavior, trusted-proxy configuration, and no committed secrets
- [x] Dependency-free `GET /health/live` liveness plus PostgreSQL-backed `GET /health` readiness
- [x] Customer/invoice read-query review: no N+1, unbounded queries, client-side filtering, or speculative
      index changes
- [x] Authentication security review, including documented stateless-JWT limitations
- [x] Automated tests for error handling, correlation IDs, rate limiting, CORS, health, and regressions
- [x] README, architecture, requirements, and development-plan documentation updated

Acceptance criteria verified on 2026-11-13: `dotnet restore` succeeds; `dotnet build` completes with
0 warnings and 0 errors; `dotnet test` completes with 0 failures (75 unit + 186 integration = 261 tests).
Production JSON logging, correlation headers, ProblemDetails for unknown routes, liveness without
PostgreSQL, and readiness failure without PostgreSQL were also verified against a running API.

## Phase 8 — Integration Test Hardening & CI Readiness ✅

- [x] Test database provisioning and isolation per test run using the existing shared Testcontainers
      container, collection-level serialization, and truncation/sequence reset before every database test
- [x] End-to-end coverage of registration, login, identity, customers, multi-item invoices, Draft updates,
      send/mark-paid, and terminal-state enforcement
- [x] Cancellation journey covering Draft and Sent invoices, terminal-state rejection, and invoice-number
      continuity after cancellation
- [x] Authorization tests proving cross-user read, update, delete, and transition access is denied, and
      that another user's customer cannot be used
- [x] Sequential concurrency test proving a stale update returns `409` and does not overwrite persisted data
- [x] CI workflow at `.github/workflows/ci.yml` with `global.json` SDK resolution, Release build, Docker
      verification, separate unit/integration runs, TRX artifacts, minimal permissions, and no secrets
- [x] Test factory default hardened to an unreachable connection string when no container is supplied
- [x] Documentation updated with test commands, Docker requirement, isolation strategy, CI behavior, and
      failure diagnosis

Acceptance criteria verified on 2026-11-13: `dotnet restore` succeeds; `dotnet build` (Debug and Release)
completes with 0 warnings and 0 errors; `dotnet test` completes with 0 failures (75 unit + 209 integration
= 284 tests) across three consecutive full runs; the workflow file parses successfully. Integration
coverage was collected with `coverlet.collector` (91.6% line, 67.0% branch); no threshold is enforced. The
GitHub Actions workflow has **not** executed remotely yet, because no push was authorized; remote CI
status is not verified.

## Phase 9 — Docker Containerization & Deployment Readiness ✅

- [x] Multi-stage Dockerfile using the official .NET 10 SDK and ASP.NET Core runtime images; published
      output only, non-root `app` user, port `8080`, no SDK/source/secrets in the runtime image
- [x] Separate migrator image containing an EF Core migration bundle and explicit runner script
- [x] Docker Compose with PostgreSQL 17 (named volume, `pg_isready` health check, no published port) and
      the API (loopback-only `127.0.0.1:8080`, readiness health check, `depends_on` healthy PostgreSQL)
- [x] Environment-based configuration through existing keys; `.env.example` placeholders and gitignored
      `.env`; no hardcoded credentials or signing keys
- [x] Dedicated Compose migrator that completes successfully before API startup; no migration in API code
- [x] Container health checks using bash `/dev/tcp` against `/health` and `/health/live`, with no added
      `curl`/`wget` packages
- [x] `.dockerignore` excluding build output, tests, docs, and local environment files
- [x] CI Docker build job for the API and migrator images plus Compose validation, without publishing
- [x] README, architecture, requirements, and plan updated with build, Compose, migration, health,
      persistence, logging, troubleshooting, TLS, and production notes

Acceptance criteria verified on 2026-11-13: the API and migrator images build on `linux/arm64` natively and
on `linux/amd64` through buildx; the runtime image runs as UID 1654 (`app`), exposes `8080`, and contains no
SDK or source; `docker compose config` validates; PostgreSQL becomes healthy; all four migrations apply
through the explicit migrator; the API starts; liveness and readiness return `200`; registration, login,
customer creation, multi-item invoice creation, totals, send, and mark-paid work; Paid invoices reject
update/delete with `409`; data and the invoice-number sequence survive a full restart; stopping PostgreSQL
makes readiness return `503` while liveness stays `200`; Production disables Swagger/OpenAPI; and no secret
values appear in images or logs. The 284 existing tests still pass. The GitHub Actions workflow has **not**
executed remotely because no push was authorized, so remote CI status is not verified.

## Phase 10 — Portfolio Presentation ✅

- [x] Rewrite the README for portfolio reviewers with features, stack, architecture, quick start, testing,
      security, scope, and release limitations
- [x] Add a GitHub-compatible Mermaid architecture diagram representing the implemented system
- [x] Add an exact register-to-Paid API workflow with concurrency and terminal-state examples
- [x] Add a repeatable, non-destructive Docker Compose demo using unique disposable data
- [x] Document engineering decisions and operational trade-offs
- [x] Add concise contribution guidance and strengthen local environment ignore rules
- [x] Audit publication candidates for secrets, personal paths, generated output, dumps, and logs
- [x] Document the absent license, optional genuine screenshot captures, release metadata, and owner actions
- [x] Verify Release build, tests, Docker image, Compose configuration, live demo, health, and documentation

Acceptance criteria verified on 2026-11-13: `dotnet restore` succeeds; the Release build has 0 warnings and
0 errors; all 284 tests pass (75 unit + 209 integration); the API Docker image builds; Compose validates;
PostgreSQL and API containers become healthy without deleting the named volume; the explicit migrator is
idempotent; and the live demo completes registration, customer creation, multi-item calculation, Draft
update, send, Paid, and terminal-state rejection without exposing credentials. Local documentation links
resolve, and publication candidates contain no detected secret signatures, personal paths, local
environment files, build artifacts, dumps, or logs. No screenshots were fabricated. GitHub publication,
remote CI, and release creation are handled by the separate publication process; the repository owner
approved the MIT license.
