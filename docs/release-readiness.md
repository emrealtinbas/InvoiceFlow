# Release readiness

This checklist records local readiness and the safeguards used for GitHub publication.

## Ready locally

- Professional README with an actual architecture diagram, scope, security limitations, and tested commands
- Complete API workflow in [`api-examples.md`](api-examples.md)
- Non-destructive, unique-data demo at [`../scripts/demo.sh`](../scripts/demo.sh)
- Practical architecture and trade-offs in [`architecture.md`](architecture.md) and
  [`engineering-decisions.md`](engineering-decisions.md)
- Release build and 284-test local regression suite
- PostgreSQL 17 integration tests through Testcontainers
- API and migrator Docker builds plus valid Docker Compose configuration
- Runtime secrets excluded from source, image context, examples, and logs
- Contribution instructions and repository hygiene rules
- MIT license approved by the repository owner

## Publication procedure

1. Review the complete release diff and create an accurate commit.
2. Push without rewriting remote history.
3. Observe GitHub Actions and resolve failures before tagging.
4. Confirm visibility, description, topics, default branch, license recognition, and documentation rendering.
5. Create the release only from the commit that passed remote CI.

## Suggested GitHub presentation

**Repository description**

> Production-oriented invoice management REST API built with .NET 10, ASP.NET Core, PostgreSQL, EF Core,
> Testcontainers, and Docker.

**Topics**

`dotnet`, `aspnet-core`, `csharp`, `postgresql`, `entity-framework-core`, `rest-api`, `jwt-authentication`,
`testcontainers`, `docker`, `xunit`, `modular-monolith`, `portfolio`

**Suggested first tag**

`v1.0.0`

**Portfolio summary**

> InvoiceFlow is a feature-oriented ASP.NET Core API demonstrating secure ownership boundaries, exact
> invoice calculations, guarded lifecycle transitions, PostgreSQL optimistic concurrency, consistent API
> errors, production-minded observability, real-database integration tests, and reproducible container
> delivery.

## Suggested v1.0.0 release notes

### InvoiceFlow API v1.0.0

- User registration and JWT authentication with User/Admin authorization
- Owner-isolated customer and invoice CRUD
- Multi-item TRY invoices with deterministic decimal calculations
- Draft, Sent, Paid, and Cancelled lifecycle enforcement
- Opaque PostgreSQL `xmin` optimistic concurrency tokens
- Pagination, filtering, search, and deterministic sorting
- RFC 9457 ProblemDetails, correlation IDs, structured logging, CORS, and rate limiting
- Liveness/readiness checks and explicit EF Core migrations
- Non-root Docker image, Docker Compose stack, and migration bundle
- 284 local tests, including PostgreSQL 17 Testcontainers integration coverage

Local verification does not imply that remote CI, image publication, or a GitHub release has succeeded.

## Screenshots

No screenshots are committed because a genuine capture set was not required to verify the repository and
no fabricated images should be used. Before portfolio publication, the owner may capture:

- Swagger UI endpoint overview in Development
- A redacted invoice creation response with no JWT or credentials visible
- A redacted Paid lifecycle response
- The real local Release test summary
- `docker compose ps` showing healthy services

Review every image for access tokens, local paths, personal data, and environment values before committing.
