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

## Phase 5 — Invoice Core ⬜

- [ ] Invoice and invoice-item endpoints
- [ ] Server-side totals with the documented rounding policy
- [ ] Invoice numbering
- [ ] Validation of items, dates, and customer ownership
- [ ] Tests for calculation rules and validation

## Phase 6 — Invoice Lifecycle ⬜

- [ ] Send, cancel, and mark-as-paid actions
- [ ] Status-transition guards with `409 Conflict` on invalid transitions
- [ ] Draft-only editing
- [ ] Filtering by status, customer, and date range
- [ ] Tests for every allowed and rejected transition

## Phase 7 — API Quality & Security ⬜

- [ ] FluentValidation for request contracts
- [ ] Standardized ProblemDetails error handling and exception mapping
- [ ] Serilog structured logging with request correlation
- [ ] Rate limiting, CORS policy, and security headers
- [ ] XML documentation and enriched OpenAPI metadata
- [ ] Security review of ownership checks and sensitive data handling

## Phase 8 — Integration Tests ⬜

- [ ] Test database provisioning and isolation per test run
- [ ] End-to-end coverage of auth, customers, invoices, and lifecycle flows
- [ ] Authorization tests proving cross-user access is denied
- [ ] CI-ready test configuration

## Phase 9 — Docker & Deployment ⬜

- [ ] Multi-stage Dockerfile for the API
- [ ] Docker Compose with PostgreSQL for local development
- [ ] Environment-based configuration and secret handling
- [ ] Health/readiness configuration for containers
- [ ] Deployment notes

## Phase 10 — Portfolio Presentation ⬜

- [ ] Final README with architecture diagram, API examples, and screenshots
- [ ] Curated `docs/` with decisions and trade-offs
- [ ] Seed data and a runnable demo scenario
- [ ] Repository cleanup, license, and contribution notes
- [ ] Publish the repository and link it from the portfolio
