# InvoiceFlow API

A RESTful Customer & Invoice Management API for small businesses, built with ASP.NET Core on .NET 10.

> **Independent sample project.** InvoiceFlow API is a personal portfolio project. It is not client work,
> it is not affiliated with any company, and it does not contain any real customer or invoice data.

## Status

**Phase 3 — Authentication & Authorization is complete.** The API supports registration, login with JWT
bearer tokens, role-based authorization, `GET /api/auth/me`, and explicit admin provisioning. Customer and
invoice endpoints are planned for later phases; see [docs/development-plan.md](docs/development-plan.md).

## Technology stack

| Area          | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Runtime       | .NET 10 / ASP.NET Core                                          |
| Language      | C# (nullable reference types, file-scoped namespaces)           |
| API style     | Controller-based REST API                                       |
| API docs      | Microsoft.AspNetCore.OpenApi + Swagger UI                       |
| Persistence   | PostgreSQL 17, EF Core 10, Npgsql provider, EF Core migrations  |
| Identity      | ASP.NET Core Identity (`IdentityUser<Guid>`, `IdentityRole<Guid>`) |
| Auth          | JWT bearer tokens (HS256), Admin/User roles, authorization policies |
| Tests         | xUnit, Testcontainers for PostgreSQL, `WebApplicationFactory`   |
| Validation    | Data annotations + Identity password policy (FluentValidation planned, Phase 7) |
| Deployment    | Docker (planned, Phase 9)                                       |

## Solution structure

```text
InvoiceFlow/
├── src/
│   └── InvoiceFlow.Api/
│       ├── Features/
│       │   ├── Auth/            # ApplicationUser, Identity, JWT, auth endpoints, provisioning
│       │   ├── Customers/       # Customer entity and EF configuration
│       │   └── Invoices/        # Invoice, InvoiceItem, InvoiceStatus + EF configurations
│       ├── Common/              # shared API concerns (errors, pagination, ...)
│       ├── Infrastructure/
│       │   ├── HealthChecks/    # health response contract
│       │   ├── OpenApi/         # OpenAPI document and Bearer security scheme
│       │   └── Persistence/     # AppDbContext, audit contract, migrations
│       ├── Program.cs           # composition root and HTTP pipeline
│       └── appsettings.json
├── tests/
│   ├── InvoiceFlow.UnitTests/          # JWT, options, current-user, entity, and model tests
│   └── InvoiceFlow.IntegrationTests/   # HTTP + real PostgreSQL (Testcontainers)
├── docs/
│   ├── architecture.md
│   ├── requirements.md
│   └── development-plan.md
├── Directory.Build.props
├── dotnet-tools.json
├── global.json
└── InvoiceFlow.slnx
```

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (the repository pins `10.0.404` via `global.json`)
- PostgreSQL 17 for local development (Docker or a native installation)
- Docker for the integration tests (Testcontainers starts PostgreSQL automatically)
- A random JWT signing key of at least 32 bytes, supplied through `Jwt__SigningKey`

No database is required to start the API, but readiness reports unhealthy until one is reachable.

## Local development

### 1. Start PostgreSQL

```bash
docker run --name invoiceflow-postgres \
  -e POSTGRES_USER=invoiceflow \
  -e POSTGRES_PASSWORD=invoiceflow \
  -e POSTGRES_DB=invoiceflow \
  -p 5432:5432 \
  -d postgres:17-alpine
```

### 2. Configure connection and JWT secrets

`appsettings.json` contains a safe example connection string **without a password** and the non-secret JWT
settings (issuer, audience, lifetime). Supply the real values through environment variables:

```bash
export ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=invoiceflow;Username=invoiceflow;Password=invoiceflow"
export Jwt__SigningKey="$(openssl rand -base64 48)"
```

The signing key is read only from `Jwt__SigningKey`. The application refuses to start when it is missing
or shorter than 32 bytes, and it never logs the key or full access tokens. Never commit real credentials.

### 3. Apply migrations

The repository uses a local `dotnet-ef` tool (pinned in `dotnet-tools.json`):

```bash
dotnet tool restore
dotnet ef database update --project src/InvoiceFlow.Api --startup-project src/InvoiceFlow.Api
```

Migrations are applied explicitly; the application never calls `Migrate()` or `EnsureCreated()` on startup.

### 4. Run the API

```bash
dotnet restore
dotnet build
dotnet run --project src/InvoiceFlow.Api
```

| Resource        | URL                                                   |
| --------------- | ----------------------------------------------------- |
| Health/readiness| `http://localhost:5188/health`                        |
| Swagger UI      | `http://localhost:5188/swagger` (Development only)    |
| OpenAPI JSON    | `http://localhost:5188/openapi/v1.json` (Development only) |

`GET /health` is a readiness check that includes PostgreSQL connectivity:

- `200 OK` — `{"status":"Healthy"}`
- `503 Service Unavailable` — `{"status":"Unhealthy"}`

The endpoint never exposes connection strings or exception details.

### 5. Provision an admin (optional)

Admin provisioning is disabled by default and is never part of normal application startup. It is an
explicit command:

```bash
export AdminProvisioning__Enabled=true
export AdminProvisioning__Email="admin@example.com"
export AdminProvisioning__Password="<strong-admin-password>"

dotnet run --project src/InvoiceFlow.Api -- --provision-admin
```

The command creates the `Admin` and `User` roles if they are missing, creates the admin account once, and is
safe to run repeatedly. It never overwrites an existing password, never promotes an existing normal user to
Admin, and never logs the password. Unset the `AdminProvisioning__*` variables after provisioning.

## Authentication and authorization

### Endpoints

| Method | Path                 | Authentication | Success | Errors                                         |
| ------ | -------------------- | -------------- | ------- | ---------------------------------------------- |
| POST   | `/api/auth/register` | Anonymous      | `201`   | `400` validation, `409` duplicate e-mail       |
| POST   | `/api/auth/login`    | Anonymous      | `200`   | `401` invalid credentials or locked-out account |
| GET    | `/api/auth/me`       | Bearer JWT     | `200`   | `401` missing/invalid token or deleted user     |

Registration returns `{ "id", "email", "role": "User" }` and does **not** sign the user in. Login returns
`{ "accessToken", "tokenType": "Bearer", "expiresIn" }`. `/api/auth/me` returns `{ "id", "email", "roles" }`.

### Password and lockout policy

- Minimum length 12, with upper-case, lower-case, digit, and non-alphanumeric characters.
- Passwords are hashed by ASP.NET Core Identity (PBKDF2) and never stored or logged in plain text.
- Five failed login attempts lock the account for 15 minutes.
- Lockout is enabled for newly registered users.
- Public registration always assigns only the `User` role; a role supplied by the client is ignored.

### JWT

- HS256 signing with issuer and audience validation.
- Claims: `sub` (user id), `email`, `role`, `iss`, `aud`, `iat`, `exp`, `jti`.
- Default lifetime: 30 minutes (`Jwt:AccessTokenMinutes`).
- Signature, issuer, audience, lifetime, and algorithm are validated; unsigned and non-HS256 tokens are
  rejected. Clock skew is limited to 5 seconds.
- Refresh tokens, OAuth social login, e-mail verification, password reset, and two-factor authentication
  are out of scope for Phase 3.

### Roles and policies

| Policy              | Requirement                    |
| ------------------- | ------------------------------ |
| `AdminOnly`         | Authenticated user with `Admin` |
| `AuthenticatedUser` | Any authenticated user          |

Unauthenticated requests receive `401` with a ProblemDetails body; authenticated requests without the
required role receive `403`.

### Swagger UI workflow

1. Start the API in Development and open `http://localhost:5188/swagger`.
2. Call `POST /api/auth/register` to create a User account.
3. Call `POST /api/auth/login` and copy the `accessToken`.
4. Click **Authorize**, paste the token (Swagger UI adds the `Bearer` prefix), and confirm.
5. Call `GET /api/auth/me` to see the authenticated identity and roles.

### curl examples

```bash
# Register a User account (201 Created)
curl -i -X POST http://localhost:5188/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPass123!"}'

# Log in and print the access token (200 OK)
curl -s -X POST http://localhost:5188/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPass123!"}'

# Read the authenticated user (replace <access-token>)
curl -s http://localhost:5188/api/auth/me \
  -H "Authorization: Bearer <access-token>"

# Missing or invalid token (401 Unauthorized)
curl -i http://localhost:5188/api/auth/me
```

## Tests

```bash
dotnet test
```

- **Unit tests** verify JWT option validation, token claims/lifetime, current-user parsing, entity defaults,
  and EF Core model metadata. They do not need a database.
- **Integration tests** start a real PostgreSQL container with Testcontainers, apply the real migrations,
  and verify registration, login, lockout, JWT validation, authorization policies, `/api/auth/me`, admin
  provisioning, persistence, database constraints, error handling, and the health endpoint. Docker must be
  running.

Testcontainers reuses a single container for the whole test collection and truncates data between tests.

## Documentation

- [Architecture](docs/architecture.md) — architectural decisions, ER diagram, auth design, and persistence details
- [Requirements](docs/requirements.md) — business requirements and decisions
- [Development plan](docs/development-plan.md) — phased roadmap and current progress
