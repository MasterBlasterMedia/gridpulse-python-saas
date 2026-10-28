# Verification record

Measured on **2026-10-27**, with frontend regression checks repeated on **2026-10-28**, using Python 3.12.14, Node 24.22.1, PostgreSQL 18.6, and the committed lockfiles. This record separates executed checks from configuration or proposed infrastructure.

## Executed checks

| Check | Observed result |
| --- | --- |
| Backend Pytest / HTTPX with real PostgreSQL | **64 passed** |
| Backend line coverage | **97.35%** across the measured app modules |
| Statistical algorithm module | **100%** line coverage |
| Operations service | **98%** line coverage |
| Ruff check and format | Pass |
| Mypy strict mode on `app/` | Pass, 15 source modules |
| React / Vitest / Testing Library | **14 passed** |
| Frontend coverage | **65.38% statements / 65.80% lines**; no 80% frontend claim |
| TypeScript and ESLint | Pass |
| Production React build | Pass, Vite 8.3.5 |
| Playwright real API smoke | **4 passed**, desktop and mobile |
| Published Pages + Render smoke | **4 passed**, desktop and mobile, verified 2026-10-28 |
| Python pinned dependency audit | No known vulnerabilities reported |
| npm audit | No known vulnerabilities reported |
| Alembic upgrade and model drift | Applied successfully; no new upgrade operations |
| Terraform init/validate | Pass, Terraform 1.17.0; no AWS resources created |
| Local container builds | API, migration, and frontend images build |
| GitHub Docker Compose integration | Pass: migrations, PostgreSQL, API, frontend, and all four browser tests |
| Local Compose runtime | Blocked by host Podman missing `pasta` / `aardvark-dns`; Docker CI is the authoritative Compose runtime check |

The later GitHub CI run and live deployment checks are recorded in [deployment.md](deployment.md). Dependency audits are a point-in-time advisory check, not proof of absence of vulnerabilities.

## Meaningful assertions

- Moving averages and EWMA have hand-computed expected results. A constant trace has zero holdout error; a step-change holdout proves its values did not leak into fitting.
- Hosted PostgreSQL TLS uses system trust roots with certificate and hostname checks; a regression test verifies the SSL context.
- Forecasts reject insufficient, nonfinite, negative, and missing/nonconsecutive history. MAE and RMSE use the final 24 observations at a frozen prediction origin.
- Anomaly tests include flat traces, a known spike, zero variance, thresholds, short history, invalid/missing readings, and warmup before a short selected range.
- Priority tests cover severity, reach, customers, age, contribution caps, stable ties, and top-k behavior.
- HTTP tests send IDs belonging to a different organization to read, forecast, mutation, and CSV endpoints. PostgreSQL independently rejects a cross-tenant foreign key.
- Public demo tests verify failed facility/incident writes, failed forecast persistence, denied audit access, and successful nonpersistent calculations with unchanged audit/run tables.
- Mutations are checked for persisted state, duplicate conflicts, forward incident transitions, and atomic audit records. Invalid authentication never reveals whether an email exists or echoes passwords.
- Frontend tests mock only the transport: the real pages, session provider, query cache, controls, and routing handle loading, errors, empty search, date validation, comparison, forecast inputs, role visibility, and authentication failures.
- A deferred inventory response proves a linked forecast cannot be submitted before its facility option loads. The regression failed against the original enabled-button state and passed after the loading guard was added.
- Browser smoke tests use the running API and database, exercise both 1440px desktop and mobile layouts, assert no horizontal overflow, navigate facilities, change anomaly thresholds, calculate a forecast, and download CSV.

## Reproduce the database tests

The fixture deliberately recreates tables. A non-SQLite `TEST_DATABASE_URL` must end in `_test`; a guard rejects ordinary database names. Use a **disposable database** and never a production connection.

```bash
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@127.0.0.1:5432/gridpulse_test \
  .venv/bin/pytest --cov=app --cov-report=term-missing --cov-fail-under=80
```

Without `TEST_DATABASE_URL`, the fixture uses in-memory SQLite with foreign keys enabled. PostgreSQL is the reference integration target. SQLite test execution stalled under the original filesystem sandbox; the reported results use PostgreSQL. Coverage config explicitly tracks `greenlet` and `thread`, required by SQLAlchemy's async bridge; omitting these produced a misleading undercount.

## Measured bundle refactor

The initial eager application imported Recharts through every analytical page. Lazy route modules now keep that code out of the public landing page's initial JavaScript download.

| Metric | Before | After |
| --- | ---: | ---: |
| Initial entry JavaScript, bytes | 730,824 | 329,244 |
| Same entry compressed with Python `gzip.compress(..., mtime=0)`, default level 9 | 215,241 | 103,397 |

**54.95% fewer uncompressed entry bytes.** Both measurements used the same installed dependency set, Vite 8.3.5 production builds, and Linux/Node 24. The recorded after build also included small visual correctness edits, so this is an observed before/after build comparison rather than an isolated laboratory benchmark. Later small source changes can alter hashes and byte counts.

Chart code is deferred, not removed. The first analytical view downloads an additional chart chunk (~371 KB before gzip), and total application code is not reduced by the same percentage. No claim is made about measured startup latency, Web Vitals, API throughput, or real-world forecasting accuracy.

## Initial dashboard request refactor

The first hosted browser trace showed two sequential dashboard requests for the default seven-day selection: an overview request followed by the same range with explicit dates. The default view now reuses the overview response; changed filters still request their selected scope. The component regression assertion verifies one initial dashboard request instead of two. This is a request-count reduction, not a measured latency guarantee.

Hosted Playwright runs allow 90 seconds for assertions and 120 seconds per test to accommodate free-tier startup and CPU limits. Local/container CI retains 5-second assertions and a 30-second test budget.

## Boundaries not covered by this result

The suite is intentionally compact. It is not a load test, accessibility certification, penetration test, disaster recovery drill, or AWS integration run. AWS Terraform is validated but not applied. Free-host cold starts and availability depend on provider quotas. Future production use requires a broader threat model and operational testing.
