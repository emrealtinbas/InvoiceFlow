# Release readiness

**Assessment date:** 2026-11-14. **Status:** **LOCAL VERIFICATION COMPLETE — release blocked on an
authorized candidate commit and remote CI**

Phase 10 prepares InvoiceFlow for portfolio publication without adding product behavior. The application is
an independent sample, not accounting, tax, payment-processing, or legal-compliance software. This file
separates implemented work from checks actually observed in the current environment.

## Verification matrix

| Area                                   | Result       | Evidence / remaining work                                                                                                                                     |
| -------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend typecheck, ESLint, Prettier   | PASS         | Node 24.22.3 / npm 10.9.2; `typecheck`, `lint --max-warnings=0`, and `format:check` all exit 0                                                                 |
| Frontend unit/component tests          | PASS         | 216/216 tests in 26 files                                                                                                                                     |
| Frontend production build              | PASS         | Vite production bundle generated                                                                                                                              |
| Release solution build                 | PASS         | API and both test projects; 0 warnings, 0 errors                                                                                                              |
| Backend unit tests                     | PASS         | 75/75 tests                                                                                                                                                   |
| PostgreSQL integration tests           | PASS         | 209/209 tests on disposable PostgreSQL 17 Testcontainers                                                                                                       |
| Compose configuration                  | PASS         | `docker compose --profile web config` exit 0                                                                                                                  |
| API, migrator, and web image builds    | PASS         | `docker compose --profile web build` completed for all three images                                                                                            |
| Migration and service readiness        | PASS         | PostgreSQL, API, and web healthy; migrator exited 0 (expected one-off task)                                                                                     |
| Nginx proxy, headers, and SPA fallback | PASS         | `/api/*` proxied; `/health` and `/health/live` 200; deep link `/invoices` 200; unauthenticated API 401 ProblemDetails; hashed assets `immutable`; API `no-store`; CSP/nosniff/DENY; correlation ID echoed; no CORS header added |
| Database persistence across restart    | PASS         | Disposable customer and invoice survived restart of `postgres`, `api`, and `web`; totals intact; API cleanup returned 204                                       |
| Playwright critical paths              | PASS         | 6/6 scenarios across desktop Chromium and mobile Chromium                                                                                                      |
| Phase 8 authenticated browser checks   | PASS         | Route focus, customer search, status filtering, badges, detail, validation accessibility, dialog initial/restore focus, mobile navigation, logout clearing, no browser storage |
| Release screenshots                    | PASS         | Six real screenshots in `docs/screenshots/` captured from the running stack                                                                                     |
| Production npm audit                   | PASS         | 0 known production dependency vulnerabilities                                                                                                                  |
| Secret/config review                   | PASS         | `.env` files ignored; no deployment secret markers in browser source/config                                                                                     |
| Solution restore                       | PASS         | All projects up to date                                                                                                                                        |
| Remote GitHub Actions                  | NOT VERIFIED | No push or workflow run was authorized                                                                                                                          |
| Clean release tree/commit              | BLOCKED      | Existing user work is intentionally uncommitted and preserved; commit/tag creation needs explicit authorization                                                  |

The Docker daemon was reachable in this run (`docker info` exit 0, server 29.9.3, context `desktop-linux`);
the earlier socket-permission failure is resolved. Local results are recorded exactly as observed and do not
imply remote CI success, image publication, or a GitHub release.

## Reproduction procedure

The matrix above was produced with these commands from the repository root on the verified candidate tree.
Use strong local-only values in `.env`; the E2E run needs the test-only rate-limit overrides.

```bash
cp .env.example .env
dotnet restore InvoiceFlow.slnx
dotnet build InvoiceFlow.slnx --configuration Release --no-restore
dotnet test tests/InvoiceFlow.UnitTests --configuration Release --no-build
dotnet test tests/InvoiceFlow.IntegrationTests --configuration Release --no-build

docker compose --profile web config
docker compose --profile web build
LOGIN_PERMIT_LIMIT=100 REGISTER_PERMIT_LIMIT=100 \
  docker compose --profile web up -d --wait

curl --fail http://127.0.0.1:8080/health/live
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8081/health
curl --fail --head http://127.0.0.1:8081/invoices

cd frontend
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e:install
E2E_BASE_URL=http://127.0.0.1:8081 npm run test:e2e
cd ..

docker compose --profile web restart
docker compose --profile web ps
docker compose --profile web down
```

Also inspect browser console/network output; verify registration, sign-in/out, ownership isolation, customer
CRUD, invoice editing/calculation, concurrency recovery, lifecycle actions, dashboard data, mobile navigation,
and reload-driven memory-only session loss. Confirm data survives `restart`. Do not use `down -v` when checking
persistence.

## Security and operational review

- JWTs remain in memory, never local/session storage; account-scoped caches are cleared on expiry and logout.
- The browser receives no database password, signing key, Docker service name, or credential-bearing API URL.
- PostgreSQL is private; host ports for API/web bind to loopback. Nginx uses same-origin proxying and defensive
  response headers. Real TLS still belongs at the deployment reverse proxy.
- Owner filtering, generic inaccessible-resource `404`s, server-authoritative totals, opaque concurrency
  tokens, rate limiting, and RFC 9457 errors are implemented in the API.
- Refresh tokens/revocation, payments, PDFs, e-mail, external accounting, legal numbering, HA, backups, and
  production observability are intentionally out of scope. Dashboard analytics are client-aggregated and
  capped at 1,000 invoices.
- Seven moderate advisories previously observed in the development-only TypeScript ESLint toolchain require
  a breaking forced upgrade; production dependencies currently report zero vulnerabilities.

## Captured screenshots

Captured from the running Compose stack using the synthetic `demo@invoiceflow.example` account and `.example`
customer addresses. The seeded invoices and customers were removed afterward; no credentials, tokens, or real
personal data appear in the images.

- `docs/screenshots/dashboard.png` — desktop dashboard with financial coverage and status distribution
- `docs/screenshots/customers.png` — customer list with search
- `docs/screenshots/invoices.png` — invoice list with status badges and filters
- `docs/screenshots/invoice-detail.png` — multi-line invoice detail with authoritative totals
- `docs/screenshots/invoice-editor.png` — Draft editor with calculated preview
- `docs/screenshots/invoices-mobile.png` — mobile invoice list (390 × 844 viewport)

Before reusing the images in another release, confirm they still match the shipped UI and contain no local
paths or environment values. Do not fabricate or mock screenshots.

## Version and proposed release notes

The existing backend tag `v1.0.0` must remain unchanged. After the candidate commit is authorized, pushed, and
passes every remote GitHub Actions job, the recommended pre-release is **`v1.1.0-rc.1`**; promote the same
verified scope to **`v1.1.0`** only after remote CI is green. No tag was created by Phase 10.

### Proposed InvoiceFlow v1.1.0

- React 19/TypeScript workspace for authentication, customers, invoices, lifecycle, and dashboard workflows
- Exact decimal previews aligned with server-authoritative invoice calculations
- Accessible responsive UI with account-safe query caching and memory-only JWT sessions
- Unprivileged Nginx production image and opt-in full-stack Compose profile
- 216 passing frontend tests, 75 passing backend unit tests, 209 passing PostgreSQL integration tests, and six
  passing Playwright scenarios on the verified local candidate tree
- CI quality, image, readiness, and full-stack E2E jobs
- Documented limitations, threat boundaries, troubleshooting, screenshots, and reproducible verification steps

## Publication procedure

1. Authorize and create a focused candidate commit from the verified working tree without rewriting history or
   discarding existing work.
2. Push normally and require all GitHub Actions jobs to pass on that commit.
3. Re-confirm the Docker/Nginx/persistence and Playwright evidence on the pushed commit if the tree changed.
4. Create `v1.1.0-rc.1` from the green commit; never move the existing `v1.0.0` tag.
5. Verify repository description, topics, license rendering, links, and release notes before final `v1.1.0`.

Local verification does not imply image publication, remote CI success, or a GitHub release.
