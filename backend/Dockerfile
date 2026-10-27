# Keep dependency installation cached while source changes; the final process has no root privileges.
FROM docker.io/library/python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY pyproject.toml alembic.ini ./
COPY app ./app
COPY migrations ./migrations
COPY scripts ./scripts
RUN pip install --no-deps . && useradd --uid 10001 --create-home gridpulse

# Development tooling is deliberately absent from the deployed image.
FROM base AS development
COPY requirements-dev.lock ./
RUN pip install --no-cache-dir -r requirements-dev.lock
USER gridpulse
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production
USER gridpulse
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=3)"
CMD ["sh", "scripts/start.sh"]
