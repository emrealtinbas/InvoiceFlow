# Engineering decisions

These decisions optimize InvoiceFlow for clarity, correctness, and reproducibility at its current scale.
They are not universal prescriptions; each has explicit costs.

## 1. Modular monolith

One ASP.NET Core process keeps transactions, deployment, diagnostics, and local development simple. Feature
folders provide boundaries without adding network calls or distributed consistency. The trade-off is that
features scale and deploy together. A larger product would extract a service only when independent scaling,
team ownership, or failure isolation justified the operational cost.

## 2. PostgreSQL and EF Core

PostgreSQL provides relational constraints, exact numeric types, sequences, and strong transaction support.
EF Core supplies change tracking, migrations, LINQ translation, and Identity integration without a custom
repository layer. This couples persistence behavior to EF Core and Npgsql; complex reporting may eventually
need tuned SQL or a separate read model.

## 3. `decimal` for financial calculations

Binary floating-point values cannot represent many base-10 monetary amounts exactly. C# `decimal` and
PostgreSQL `numeric` make the calculation and storage model deterministic. Decimal arithmetic is slower
than binary floating point, but invoice workloads favor correctness over raw arithmetic throughput.

## 4. Line-level rounding

Each line subtotal and tax is rounded to two decimal places with `MidpointRounding.AwayFromZero`, then the
rounded lines are summed. Stored totals therefore equal the visible line amounts. Rounding only the final
invoice could create reconciliation differences. The selected rule is a product policy and may need to vary
by jurisdiction in a real accounting system.

## 5. PostgreSQL sequence for invoice numbers

A database sequence safely allocates unique numbers under concurrent requests without application locks.
The issue-date year is used for display, while the suffix increases globally and gaps are accepted. This is
not a legally gapless fiscal numbering system; jurisdictions requiring gapless or per-entity series would
need a more restrictive transactional allocation design.

## 6. Optimistic concurrency with `xmin`

PostgreSQL already changes `xmin` on every row update. Npgsql maps it as an EF Core row version, avoiding a
separate version column while detecting lost updates. The API exposes only an opaque Base64 token. This is
PostgreSQL-specific and tokens are short-lived concurrency markers, not durable audit versions. A database-
agnostic system would likely use an explicit version column.

## 7. Ownership in API logic and database constraints

Queries are owner-scoped at the API edge, and another user's resource appears as `404`. Ownership never
comes from request data. A composite foreign key also requires an invoice and its customer to share an
owner. Application checks give clear responses; constraints protect integrity against bugs and races. The
cost is more involved keys and careful Admin behavior.

## 8. Explicit migrations

The API never migrates its database during normal startup. Developers use the EF CLI, while containers use
a one-off migration bundle. This keeps schema changes observable and separates deployment permissions from
runtime permissions. It adds a required release step, but avoids multiple replicas racing to migrate or an
application changing production schema unexpectedly.

## 9. PostgreSQL Testcontainers

Integration tests run against the real database engine and committed migrations, covering provider-specific
behavior such as `xmin`, constraints, sequences, and `ILIKE`. They are slower than in-memory tests and
require Docker. A shared container plus per-test truncation balances fidelity and runtime.

## 10. In-memory rate limiting

ASP.NET Core's native fixed-window limiter is dependency-free and appropriate for protecting login and
registration in a single-instance sample. Its counters are per process, so replicas multiply the effective
limit and restarts clear state. A larger deployment would enforce limits at an API gateway or use a
distributed store with an abuse-monitoring strategy.

## 11. No JWT revocation

Access tokens are stateless and short-lived. Avoiding a blacklist keeps each authenticated request
independent of a shared session store, but deleted, locked, or role-changed users may retain access until
their token expires. Higher-risk production systems would add refresh-token rotation, revocation, and
security-event handling, or use an external identity provider.

## 12. Changes for a larger production system

Growth would likely introduce managed secret storage, TLS and edge rate limiting, centralized logs and
metrics, traces, backups and disaster recovery, vulnerability scanning, key rotation, refresh-token
management, and deployment approval gates. Reporting could use dedicated read models. Asynchronous e-mail
or document generation might justify a durable queue. Service extraction would remain evidence-driven
rather than being the default architecture.
