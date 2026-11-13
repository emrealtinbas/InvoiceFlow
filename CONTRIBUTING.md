# Contributing

InvoiceFlow is a focused portfolio project. Contributions should preserve its feature-oriented modular
monolith and avoid adding infrastructure or abstractions without a demonstrated requirement.

## Prerequisites

- .NET SDK version selected by `global.json`
- Docker with Compose v2
- Git

Docker must be running for PostgreSQL Testcontainers integration tests.

## Build and test

```bash
dotnet restore InvoiceFlow.slnx
dotnet build InvoiceFlow.slnx --configuration Release --no-restore
dotnet test InvoiceFlow.slnx --configuration Release --no-build
```

Validate container configuration when changing deployment files:

```bash
POSTGRES_PASSWORD=local-placeholder \
Jwt__SigningKey=local-placeholder-signing-key-at-least-32-bytes \
docker compose config --quiet

docker build --target final --tag invoiceflow-api:local .
```

## Conventions

- Keep nullable reference types enabled and fix warnings rather than suppressing them.
- Follow `.editorconfig` and the existing feature-folder organization.
- Prefer built-in ASP.NET Core and EF Core capabilities over new frameworks.
- Use `decimal` for monetary values and preserve the documented rounding policy.
- Derive ownership from the authenticated principal, never request data.
- Return the established ProblemDetails contract for errors.
- Add meaningful unit or PostgreSQL integration tests for changed behavior.
- Never commit `.env`, credentials, access tokens, database dumps, logs, or generated build output.

## Pull requests

Keep pull requests focused and explain the behavior, trade-offs, and verification commands. Update relevant
documentation when contracts or operational steps change. All Release builds and tests must pass, Docker
configuration must remain valid, and no migration may be applied automatically during API startup.
