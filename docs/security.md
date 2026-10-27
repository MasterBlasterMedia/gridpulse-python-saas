# Security model and boundaries

This is an independently developed demonstration, not a certified or audited production security product.

- **Credentials:** passwords use pwdlib's recommended Argon2 hashing. Unknown emails still run a dummy hash verification off the event loop. Login returns one generic credential error. Password input is bounded, and validation errors never echo raw submitted fields.
- **Tokens:** HMAC-SHA256 JWTs have issuer/audience and expiry validation. A required environment secret has a 32-character minimum. Account state and roles are resolved from the database per request. There are no public administrator credentials or refresh tokens.
- **Demo:** the only public subject resolves to the fixed `gridpulse-demo` organization, which must also have `is_demo=true`. Private password login rejects demo organizations. Public forecast computation cannot persist a run; every metadata/status mutation requires an administrator.
- **Isolation:** clients do not submit tenant IDs. Foreign resource lookups return 404. Composite database relationships constrain tenant ownership. Automated tests exercise IDs from a second organization, including exports and forecasts.
- **Audit:** successful logins, saved forecasts, and administrator mutations append events. Failed writes do not create success events. The audit endpoint is tenant-scoped and administrator-only.
- **SQL and input:** SQLAlchemy binds inputs; text search escapes wildcard characters. Requests validate ranges and bounded model settings. Report cells are neutralized if leading whitespace is followed by a spreadsheet formula prefix.
- **Network:** hosted connections use certificate and hostname validation when provider URLs request TLS. CORS is an exact allowlist and does not replace authentication. No secrets are included in Vite variables. API responses disable caching.
- **Abuse:** a bounded sliding-window IP limiter restricts login to ten attempts/minute and ordinary API access to 120/minute. It does not trust arbitrary forwarded headers. Configure only known ingress CIDRs in `TRUSTED_PROXY_IPS`. Keep one worker/task: the limiter is not distributed.
- **Hosting:** local Compose publishes database/API only on loopback. AWS allows ingress to the API only from the ALB, and to RDS only from the API security group. The application task role has no AWS API permissions. The execution role may retrieve only the runtime secret and required image/log resources.

## Important limitations

No MFA, SSO, account recovery, refresh-session revocation, RLS, distributed limiter, automated key rotation, or external penetration test is included. Bearer tokens reduce cookie/CSRF complexity but an XSS bug could read an active token. Dependency updates and a strict deployment boundary remain necessary. Swagger loads upstream assets; a restrictive CSP would need to account for or self-host them.

The immutable synthetic dataset has no real customer data. Do not connect actual electrical equipment. Before adapting this for a real organization, perform a security review, add shared rate limiting and identity lifecycle management, and test data-retention and recovery procedures.

## Reporting a problem

Do not post credentials, tokens, or real customer information in a public issue. Reproduce with synthetic data, include the request ID and non-sensitive steps, and contact the repository owner through the account's available private reporting mechanism.
