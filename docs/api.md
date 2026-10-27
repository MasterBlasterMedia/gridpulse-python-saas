# API conventions

Base path: `/api/v1`. Interactive contract: `/docs`; machine-readable contract: `/openapi.json`. All times are UTC-capable ISO 8601, with explicit timezone offsets. `start` is inclusive; `end` is exclusive. Periods are limited to 93 days. Omitting dates selects the seven days preceding the latest stored observation.

| Route | Method | Access | Purpose |
| --- | --- | --- | --- |
| `/auth/demo` | POST | Public | Issue expiring, read-only synthetic identity |
| `/auth/login` | POST | Public | Authenticate JSON `{email,password}` |
| `/auth/me` | GET | Any signed identity | Resolve current organization and role |
| `/facilities` | GET | Any signed identity | Search name and filter status |
| `/facilities/{id}` | GET | Any signed identity | Scoped facility metadata |
| `/facilities` | POST | Administrator | Create validated site metadata |
| `/facilities/{id}` | PATCH | Administrator | Change descriptive status |
| `/dashboard` | GET | Any signed identity | Metrics, time series, site comparisons |
| `/facilities/{id}/anomalies` | GET | Any signed identity | Trailing-window statistical flags |
| `/facilities/{id}/forecast` | POST | Any signed identity | Calculate forecast; saving requires private identity |
| `/forecasts` | GET | Any signed identity | Up to 50 saved runs from own organization |
| `/incidents` | GET | Any signed identity | Prioritized top-k, optional resolved incidents |
| `/incidents/{id}` | PATCH | Administrator | Acknowledge or resolve with audit event |
| `/reports/energy.csv` | GET | Any signed identity | CSV for the same scope/date conventions |
| `/audit` | GET | Administrator | Latest 100 own-organization events |

Read requests use `Authorization: Bearer <token>`. Data route parameters include optional `facility_id`; clients cannot override organization ownership. Forecast settings are `method` (`ewma` or `moving_average`), `window` (3–168), `alpha` (>0 to 1), `horizon` (1–72), and `save` (default false). Anomaly parameters are `window` (3–168) and `threshold` (1–10).

Errors use `{ "error": { "message": "...", "request_id": "..." } }`. Authentication is 401, insufficient role is 403, missing or foreign resources are 404, conflicts are 409, invalid requests are 422, rate limiting is 429, and uninitialized/unready services are 503. A `Retry-After` header accompanies a 429. Every ordinary response includes `X-Request-ID` and `Cache-Control: no-store`.

`/health/live` checks the web process. `/health/ready` checks database connectivity and the migration table. Schema compatibility is verified at release time through Alembic and CI; readiness is not a substitute for migration validation.
