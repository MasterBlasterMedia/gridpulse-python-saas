# Engineering decisions

| Problem | Choice and reason | Alternatives | Tradeoff |
| --- | --- | --- | --- |
| Demonstrate backend architecture without needless operations | A modular FastAPI monolith keeps HTTP, services, SQL, and algorithms independently readable | Microservices; one-file API | Coupled releases; deliberately small deployment footprint |
| Concurrent I/O and testability | Request-scoped AsyncSession injected through FastAPI | Sync sessions; global connection | Async transactions require careful lifecycle handling; sessions cannot be shared across tasks |
| Tenant isolation | Repositories carry verified tenant context; composite FKs reject cross-tenant associations | RLS; separate databases | Query discipline still matters; tests cover read, mutation, export, forecast, and SQL constraints |
| Understandable forecasts | MA and EWMA with a frozen chronological holdout and MAE/RMSE | Seasonal naive; regression; ARIMA | Honest level forecasts are flat; they miss daily cycles and weather effects |
| Anomaly review | Prior-window deviation with a variance floor and warmup before the selected period | Robust median/MAD; seasonal residuals | Thresholds are tunable, not calibrated for real-grid safety; sudden level shifts may create repeated flags |
| Prioritized work queue | Explicit bounded policy plus heap top-k | Full sorting; database scoring | Educational scoring, not industry policy; no speed claim for tiny lists |
| Safe public exploration | Dedicated synthetic organization and server-enforced nonpersistent demo operations | Public shared password; static fixtures | Computation remains available; writes and saved runs require a private identity |
| Browser credential persistence | In-memory bearer tokens | HttpOnly same-site cookies; browser storage | Cross-origin Pages/API hosting is simple; reload loses private login and XSS can still access active memory |
| Deployment secrets | Environment configuration with no usable secret defaults | Files in the image; remote secret lookups per request | Operators must configure secrets before startup; AWS injects them through the execution role |
| Initial frontend download | Lazy analytical routes | A single bundle; manual vendor chunks | More requests on first dashboard entry; chart functionality is unchanged |
| Reproducible data | Fixed seed, stable IDs, UTC end date and seeded random generator | Current-date random seeds | Demo does not imply live readings; existing seed data is deliberately preserved |

## Changes discovered during verification

- **Frontend bundle:** an eager import brought charting code into the public landing page. Route-level imports defer that dependency. The measured build comparison is in [testing.md](testing.md); it measures bytes, not fabricated load-time improvements.
- **Coverage:** SQLAlchemy's async adapter uses greenlets. The first coverage configuration missed resumed coroutine lines despite passing assertions. Declaring `greenlet` and `thread` execution contexts corrected measurement. This is a measurement repair, not an increase in tested behavior. [Coverage configuration reference](https://coverage.readthedocs.io/en/latest/config.html#run-concurrency).
- **One-day anomaly views:** a selected period cannot supply its own prior 24-hour baseline at its beginning. Queries now warm up the detector with prior data, filter flags back to the requested period, and include a regression test.
- **Hosted database TLS:** asyncpg mode strings expected a private root-certificate file. A shared connection helper now supplies the system trust context for API, migration, and seed connections while retaining certificate and hostname checks.
- **Initial dashboard requests:** hosted browser traces revealed two sequential requests for the same default range. Reusing the overview reduces those initial dashboard requests from two to one; a component test guards the request count. No latency benchmark is claimed.
- **Forecast navigation:** a hosted browser check caught a linked facility ID enabling submission before its select option loaded. Native form validation then blocked the request. Submission now waits for the selected inventory entry; a deferred-response regression reproduces the original failure and verifies the fix.
- **Container portability:** Podman required explicit `docker.io/library/` registry names. The manifests now use qualified names, which also work with Docker.

## Refactoring opportunities without claimed benchmarks

The current dashboard filters reading lists once per site for anomaly analysis. Grouping the fetched rows by site could remove repeated scans if profiling a larger dataset justifies it. The bounded demo does not require materialized aggregates; a telemetry ingestion workload likely would. Neither improvement is claimed as implemented or benchmarked.
