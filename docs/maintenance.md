# Maintenance and further development

## Routine checks

- Review CI failures before publishing. Keep the exact deployment revision associated with its successful test run.
- Check provider free-tier usage and cold-start behavior. Do not upgrade to a paid plan without authorization.
- Review weekly dependency PRs, run both dependency audits, and test lockfile updates before merging. Update `pyproject.toml`, `requirements.lock`, and `requirements-dev.lock` coherently.
- Use the included `X-Request-ID` to correlate a failing request with structured backend logs. Logs intentionally omit request bodies and credentials.

## Database changes

Make model edits, generate an Alembic revision, and review its explicit DDL. Test upgrade, downgrade on disposable data, and `alembic check` against PostgreSQL. Production migrations run before the new service revision. Prefer additive changes and backfills over locking rewrites. Never use the test fixture against a non-test database.

The fixed seed is idempotent and will not overwrite an existing demo. To refresh a private development dataset, create a new empty database and run migrations plus `python -m app.seed --end YYYY-MM-DD`. Changing the seed end is an explicit reproducibility decision, not an automatic background update. Keep the public synthetic organization separate from private workspaces.

## Identity and secrets

Provision administrators with `python -m app.seed --admin`, reading credentials from environment. The command refuses to reset an existing email and creates a new private workspace. For managed identity lifecycle, implement an admin provisioning workflow or integrate an OIDC provider rather than adding a public privileged signup.

To revoke a user's access, set its server-side active flag false using an authorized administrative procedure; token validation rechecks it per request. There is no user-management UI yet. Rotate the signing key in the hosting secret store and redeploy: existing tokens then fail and users sign in again. Rotate database credentials in the database and secret store together; never place secrets in command arguments, URLs in public logs, source, screenshots, or Vite variables.

## Backups and rollback

Local Compose data persists in `postgres-data`; `down -v` intentionally deletes it. A production backup policy must include tested restoration, not just scheduled backups. RDS configuration enables seven-day retention and deletion protection; verify region-specific costs. Neon free history retention is limited and does not replace a tested durable backup plan for real customer use.

Roll back code using a known image digest or earlier verified commit. Inspect migration compatibility before rollback. Keep Terraform state encrypted and access-controlled. The AWS example requires explicit cleanup of deletion protection and final snapshots when retiring resources; never assume destroying the application stops every related charge.

## Prioritized extensions

1. Shared Redis-backed rate limits and managed OIDC/SSO before multi-worker deployments.
2. PostgreSQL row-level security as a second tenant boundary, with connection-pool context reset tests.
3. Meter ingestion validation, hourly completeness rules, retention, rollups, and paginated inventory.
4. Seasonal-naive forecasting as a stronger benchmark, then weather regressors only with suitable real data and independent evaluation.
5. Robust residual anomaly detection, explicit alert acknowledgment policies, and human review.
6. Scheduled report jobs or PDF exports if there is demonstrated demand; neither is implemented now.
