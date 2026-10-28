# GridPulse — Energy Operations & Analytics

An independently developed portfolio SaaS demonstration built with **Python, FastAPI, PostgreSQL, React, and TypeScript**. Explore a facility network, calculate demand forecasts, investigate statistical anomalies, prioritize incidents, and export the underlying observations.

Every operational value is computed from stored synthetic data. This is educational analytical software, **not a certified electrical control system**. It does not imply client work, employment history, or energy-sector credentials.

[Repository](https://github.com/MasterBlasterMedia/gridpulse-python-saas) · [Architecture](docs/architecture.md) · [Engineering decisions](docs/decisions.md) · [Testing](docs/testing.md) · [Deployment status](docs/deployment.md)

**Live API:** [Swagger documentation](https://gridpulse-api-2nux.onrender.com/docs). Frontend publication is being verified; see [the deployment record](docs/deployment.md).

![GridPulse operations dashboard](docs/screenshots/dashboard-desktop.png)

## What This Project Demonstrates

| Skill | Inspectable implementation |
| --- | --- |
| Python | Typed algorithms, meaningful docstrings, deterministic seeds, pure statistical functions |
| FastAPI | Dependency-injected sessions and identities, validated schemas, centralized errors, OpenAPI |
| Database engineering | Async SQLAlchemy 2, Alembic, composite tenant foreign keys, time-series indexes |
| React | TypeScript, React Router, TanStack Query, SCSS Modules, Recharts, accessible forms and state handling |
| Algorithms | Moving average, EWMA, chronological holdout, trailing anomaly windows, bounded heap selection |
| Security | Argon2, expiring JWTs, server-resolved roles, organization scoping, read-only demo, audit events |
| Testing | Pytest/HTTPX, PostgreSQL constraints, React Testing Library/Vitest, Playwright desktop/mobile |
| Cloud & operations | Docker Compose, gated GitHub Pages deployment, Render configuration, optional AWS Terraform and OIDC |
| Maintainability | Modules with clear responsibilities, reasoning comments, migration and rollback procedures |

## Try it locally

Requires Docker Engine/Desktop with Compose v2. No paid service is needed.

```bash
git clone https://github.com/MasterBlasterMedia/gridpulse-python-saas.git
cd gridpulse-python-saas
python3 scripts/configure_local.py
docker compose up --build -d
```

- Application: **http://localhost:8080**
- API Swagger: **http://localhost:8001/docs**
- API readiness: **http://localhost:8001/health/ready**
- Local PostgreSQL: localhost:5433 (credentials in ignored `.env`)

The release container applies migrations and seeds **12 facilities × 45 days × 24 hourly observations = 12,960 readings**, plus five incidents. The exclusive seed end date is fixed at **2026-10-27 00:00 UTC**. Re-running the seed preserves the existing organization. Dashboard defaults follow the latest stored observation, not the wall clock.

```bash
# Optional source reload; open http://localhost:5173.
docker compose -f compose.yaml -f compose.dev.yaml up --build

# Shut down without deleting database contents.
docker compose down
```

`docker compose down -v` deletes the local database volume. Use it only when deliberately resetting disposable local data.

### Native development

Use Python 3.12+ and Node 24. Start PostgreSQL, create an empty `gridpulse` database, and copy `backend/.env.example` to the ignored `backend/.env`. Replace its signing key with a random secret and set the database URL.

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.lock -e .
alembic upgrade head
python -m app.seed
uvicorn app.main:create_app --factory --reload
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite proxies API requests to localhost:8000. For an external API, set `VITE_API_URL` in an ignored frontend environment file. The browser uses hash routing so direct links also work on GitHub Pages.

## Architecture

```mermaid
flowchart LR
    Visitor[Public visitor / private user] --> Pages[React · GitHub Pages]
    Pages -->|HTTPS · bearer identity| API[FastAPI routes + validation]
    API --> Auth[Identity + role dependencies]
    API --> Services[Operations services]
    Services --> Algorithms[Forecast · anomaly · priority]
    Services --> Repo[Tenant-scoped repositories]
    Repo --> DB[(PostgreSQL)]
    Release[Alembic + deterministic seed] --> DB
    CI[GitHub Actions] -->|tests then publish| Pages
```

The deployable backend is a modular monolith. HTTP routes do not contain forecasting or reporting algorithms. Repositories require an organization ID obtained from the verified identity; clients cannot choose an organization. Composite foreign keys also reject cross-tenant reading and incident associations.

```text
backend/
  app/api/           HTTP adapters
  app/services/      Pure analytics and service orchestration
  app/repositories/  Scoped SQL queries
  app/models.py      Normalized schema and constraints
  app/security.py    Authentication and role dependencies
  app/seed.py        Reproducible synthetic observations
  migrations/       Explicit reversible Alembic history
  tests/            Unit, HTTP, and database checks
frontend/
  src/components/   Shared controls and interactive charts
  src/pages/        Dashboard, facilities, analytics, public case study
  src/session.tsx   In-memory credentials and tenant cache invalidation
  e2e/              Real-browser integration smoke tests
infra/aws/          Optional cost-gated ECS/RDS Terraform
.github/workflows/  Checks, Pages publishing, opt-in cloud deployment
docs/              Design, security, testing, deployment, maintenance
```

## Algorithms and units

- **Moving average:** mean of the last `window` observations, O(w) time and O(w) temporary slice storage. Forecasts are a constant level over the selected horizon.
- **EWMA:** recursively weight newer observations by `alpha`, O(n) time and O(1) auxiliary model state.
- **Evaluation:** fit to all but the last 24 hours; evaluate a frozen prediction on those 24 hours; report MAE and RMSE; then refit on all available history. There is no holdout leakage or seasonal model claim.
- **Anomalies:** compare each reading with the preceding window, O(nw) time and O(w+a) space. The scale is `max(population_stddev, abs(mean)*0.05, 1kW)`. Missing/invalid values reset the window. Analysis queries include a prior warmup window, but return only the requested interval.
- **Incident queue:** score `100*severity + 10*min(sites,20) + min(8*log1p(customers),80) + min(0.5*age_hours,48)`. Heap selection is O(n log k), with O(k) heap space; the repository still materializes O(n) incidents. IDs break score ties deterministically.
- **Energy:** observations represent **one-hour mean kW**. Each observation contributes `kW × 1h` to kWh. Missing intervals are not fabricated. Fleet trends use only complete observations, and coverage is displayed separately.

## API examples

The demo needs no public password and cannot change stored data.

```bash
API=http://localhost:8001
TOKEN=$(curl -fsS -X POST "$API/api/v1/auth/demo" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/api/v1/dashboard"
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/api/v1/facilities"
# Replace FACILITY_ID with an ID from the preceding response.
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "$API/api/v1/facilities/FACILITY_ID/forecast" \
  -d '{"method":"ewma","alpha":0.25,"window":24,"horizon":24,"save":false}'
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/api/v1/reports/energy.csv" -o energy.csv
```

See [API conventions](docs/api.md) or `/docs` for date filters, endpoint permissions, and errors.

## Authentication and authorization

| Identity | Read / export | Compute forecast | Save forecast | Modify facilities / incidents | Audit trail |
| --- | --- | --- | --- | --- | --- |
| Public demo | Synthetic organization | Yes | No | No | No |
| Analyst | Own organization | Yes | Yes | No | No |
| Administrator | Own organization | Yes | Yes | Yes | Own organization |

To provision a local administrator, set `GRIDPULSE_ADMIN_EMAIL` and `GRIDPULSE_ADMIN_PASSWORD` in your shell using your secret manager or a masked prompt, then run `python -m app.seed --admin`. Passwords must be at least 14 characters. This creates a **separate empty private workspace**; it never elevates the public demo. There is no public registration or credential-reset endpoint.

Tokens expire after 30 minutes by default; reload restarts a demo session. Passwords use Argon2. Roles and active status are re-read on every request. CSV values are sanitized for spreadsheet formulas. Logs contain request IDs and timings, not passwords or tokens. Read [security boundaries and limitations](docs/security.md).

## Verification

```bash
cd backend
ruff check . && ruff format --check .
mypy app
# TEST_DATABASE_URL must target a disposable database ending in _test.
TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost/gridpulse_test \
  pytest --cov=app --cov-report=term-missing --cov-fail-under=80

cd ../frontend
npm ci
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npx playwright install chromium
# Keep the API and Vite running, or set E2E_BASE_URL=http://localhost:8080 for Compose.
npm run test:e2e
```

The suite includes real PostgreSQL foreign-key enforcement, unauthorized cross-organization requests, demo write denials, chronology/accuracy assertions, missing data, invalid ranges, audit persistence, component states, and actual browser/API flows. Measured results and reproduction details live in [testing.md](docs/testing.md).

## CI/CD and hosting

`Verify and publish` runs Python lint/type/tests, React lint/type/tests/build, dependency audits, Terraform validation, and full Docker Compose browser tests. GitHub Pages deploys only after every job passes and `VITE_API_URL` is configured. `render.yaml` describes a free API service; optional Render deploy hooks run only after the same checks.

The AWS example uses ECS Fargate, an HTTPS ALB, RDS PostgreSQL in private subnets, CloudWatch, Secrets Manager, and scoped GitHub OIDC credentials. **No AWS infrastructure is provisioned by default.** Consult [deployment instructions and cost assumptions](docs/deployment.md) before enabling it.

## Known limits and next steps

- All data is synthetic and fixed to a documented date. There is no telemetry ingestion or physical control.
- The statistical baselines do not capture weather, seasonality, or causal effects. No probabilistic confidence interval is fabricated.
- Public queries are bounded; the repository caps inventory at 500 sites and reading queries at 200,000 rows. Large networks need pagination, rollups, and retention policies.
- Role-based scoping is implemented; PostgreSQL row-level security, SSO, refresh sessions, password recovery, and globally shared rate limiting are future work.
- The demo limiter is per process. Keep one worker/task until a shared rate limiter exists.
- Free hosting has cold starts and quotas. AWS resources incur recurring costs and require approval.
- CSV is implemented. PDF reporting and Kubernetes are optional extensions, not completed features.

See [maintenance.md](docs/maintenance.md) for dependency refresh, schema changes, secret rotation, backups, and rollback.
