# Deployment record and runbook

## Current verification status

- Public repository: https://github.com/MasterBlasterMedia/gridpulse-python-saas
- Frontend target: GitHub Pages at `https://masterblastermedia.github.io/gridpulse-python-saas/` (publication pending verification).
- API target: free Render Docker web service, with a separate Neon Free PostgreSQL project (publication pending verification).
- AWS: Terraform validated; **not provisioned** and no billable AWS deployment authorized.

This section will be updated with the actual deployment URLs and successful CI/live checks. Planned URLs are not presented as verified deployments.

## Free demonstration deployment

1. Create a separate Neon **Free** project for synthetic GridPulse data. Use PostgreSQL 17 or 18. Do not reuse a customer database.
2. Create a Render web service from the public repository, choose **Docker** and explicitly select the **$0** compute tier (Render may default to a paid tier).
3. Set root directory to `backend`, Dockerfile to `Dockerfile`, build context to `.`, and health check path to `/health/ready`. Use the Ohio region to match the demonstration database.
4. Store the connection URL in Render's encrypted `DATABASE_URL` environment value. Provider `postgresql://` URLs are normalized to asyncpg. `sslmode=require` is converted to certificate/hostname verification; credentials are never committed.
5. Generate a random `JWT_SECRET` of at least 32 characters in the secret store. Set `ENVIRONMENT=production`, `CORS_ORIGINS=["https://masterblastermedia.github.io"]`, `RUN_MIGRATIONS=true`, `SEED_DEMO=true`, and `PORT=8000`.
6. Keep one worker. The free single-instance startup applies migrations and the idempotent demo seed before serving. Disable provider auto-deploy unless it is gated by the repository's successful checks; a secret deploy hook can trigger releases from CI.
7. Once API readiness, `/docs`, demo identity, and forecast requests succeed, set the GitHub Actions repository variable `VITE_API_URL` to the actual HTTPS API origin.
8. Enable GitHub Pages with **GitHub Actions** as the publishing source. The `pages` job runs only after all test, audit, container, and infrastructure jobs pass.
9. Check the deployed site in a browser and confirm requests reach the external API, not local files or mocked fixtures.

### Free-tier limits

As verified on 2026-10-27, [Render free web services](https://render.com/docs/free) sleep after 15 minutes without inbound traffic. Initial requests after a sleep may be slow. [Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project) includes 1 GB storage and 100 CU-hours per project each month; quotas and terms may change. This deployment uses Neon because Render's free PostgreSQL expires after 30 days.

No paid plan, credit purchase, disk, autoscaling upgrade, or AWS resource is necessary for this demo. Do not enable a paid option automatically if a free quota is exhausted.

## Optional AWS deployment

`infra/aws` demonstrates one 0.25-vCPU / 0.5-GB Fargate task behind an HTTPS ALB, encrypted single-AZ RDS PostgreSQL, private database subnets, Secrets Manager, CloudWatch logs, ECR, and a repository/environment-restricted GitHub OIDC role. Tasks have public IPs for outbound access but accept inbound traffic only from the ALB. This avoids a NAT gateway's fixed cost; a production network may prefer private tasks and endpoints/NAT.

### Estimated recurring cost — approval required before apply

Budget roughly **US $50–90/month** for this small always-on example in US East, before tax, unusual traffic, or optional services. This is a planning estimate, **not a provider quote**:

- Fargate 0.25 vCPU / 0.5 GB, 730 hours: approximately $9/month under the published on-demand Linux/x86 example rates.
- Small single-AZ PostgreSQL plus 20 GB storage: budget $15–25/month; actual instance and storage rates depend on region/version.
- ALB hours and modest LCU use: budget $17–25/month.
- Public IPv4 addresses, logs, ECR, Secrets Manager, and modest transfer: budget $10–25/month.

Refresh the [AWS Pricing Calculator](https://calculator.aws/) immediately before approval. Primary references: [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [RDS PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/), [load balancer pricing](https://aws.amazon.com/elasticloadbalancing/pricing/), and [VPC/public IPv4 pricing](https://aws.amazon.com/vpc/pricing/). RDS deletion protection and final snapshots can retain chargeable resources until explicitly removed.

### Approved provisioning sequence

1. Obtain cost approval, choose a domain, validate an ACM certificate in the deployment region, and configure an encrypted remote Terraform backend with restricted access.
2. Supply the existing GitHub OIDC provider ARN, certificate ARN, frontend HTTPS origin, and a digest-pinned API image. Bootstrap ECR and the runtime secret container if needed; no secret values are written through Terraform.
3. Review `terraform plan`. Apply only with authorization. Keep `desired_count=0` until credentials and migrations are ready. RDS uses a managed master secret rather than a password in state.
4. From an authorized one-off task in the API security group, create a dedicated application database role/schema. Store its TLS PostgreSQL URL and a generated JWT key as JSON keys `DATABASE_URL` and `JWT_SECRET` in the runtime Secrets Manager secret. Keep the RDS master credential out of the normal application container.
5. Configure the protected GitHub `production` environment, scoped deployment role ARN, region, ECR URL, release subnets, and security group variables. Set `AWS_DEPLOY_ENABLED=true` only after approval.
6. Run **Approved AWS deployment** with a full commit SHA that already passed `Verify and publish` on `main`. The workflow checks the exact successful revision, pushes an immutable image, registers a task revision, runs migrations in a one-off task, checks its exit status, and only then updates the service.
7. Add DNS for the certificate hostname to the ALB, verify HTTPS and readiness, set the frontend API variable, and republish Pages. No HTTP listener is exposed.

The AWS example is configured for one task because rate limiting is process-local. The execution role retrieves runtime secrets and image/log resources; the application task role has no AWS API policy. See the [AWS execution-role documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).

## Rollback

For static assets, rerun a verified earlier Pages workflow. For Render, redeploy the previous successful commit from the provider dashboard. For ECS, select the previous immutable task revision and verify readiness. Database migrations should be backward-compatible with the preceding application version. Do not automatically downgrade schema after writes; inspect the migration and restore strategy first.
