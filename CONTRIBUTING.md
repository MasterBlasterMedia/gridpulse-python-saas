# Contributing

Keep the modular monolith readable. Put pure business rules in services, SQL in tenant-scoped repositories, HTTP validation in schemas/routes, and reusable controls in frontend components. Explain non-obvious decisions rather than narrating obvious assignments.

Before opening a PR, run Ruff, Mypy, backend tests against a disposable PostgreSQL database, ESLint, TypeScript, Vitest, and the production build. Run the Playwright smoke suite when changing user flows or API contracts. Add tests for changed behavior and important failure cases; do not add tests that merely repeat an implementation.

Review database revisions independently of model changes. Preserve the read-only public identity and cross-organization access tests. Never commit environment secrets, real customer data, personal access tokens, or service credentials. Describe limitations and measured results truthfully.
