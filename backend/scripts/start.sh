#!/bin/sh
set -eu
# Small single-instance hosts may opt into initialization; ECS uses a separate release task.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  alembic upgrade head
fi
if [ "${SEED_DEMO:-false}" = "true" ]; then
  python -m app.seed
fi
# One worker matches the in-memory limiter's scope. Add a shared limiter before scaling out.
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}" --no-access-log --forwarded-allow-ips "${TRUSTED_PROXY_IPS:-127.0.0.1}"
