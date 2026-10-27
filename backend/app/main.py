"""Application assembly, resource lifecycle, and cross-cutting HTTP behavior."""

import json
import logging
import time
from collections import OrderedDict, deque
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.responses import JSONResponse

from app.api.routes import router
from app.config import Settings, get_settings
from app.database import connection_options

logger = logging.getLogger("gridpulse")
logging.basicConfig(level=logging.INFO, format="%(message)s")


class RateLimiter:
    """Bound a single-process sliding window in memory, including abandoned IP keys."""

    def __init__(self, capacity: int = 10000):
        self.capacity = capacity
        self.entries: OrderedDict[str, deque[float]] = OrderedDict()

    def allow(self, key: str, limit: int, now: float | None = None) -> bool:
        """Apply a one-minute window in amortized O(1); no await means atomic per loop."""
        now = time.monotonic() if now is None else now
        queue = self.entries.setdefault(key, deque())
        self.entries.move_to_end(key)
        while queue and queue[0] <= now - 60:
            queue.popleft()
        if len(self.entries) > self.capacity:
            self.entries.popitem(last=False)
        if len(queue) >= limit:
            return False
        queue.append(now)
        return True


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build an application whose external resources can be replaced in tests."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Migrations run as a release step, never as concurrent web-worker startup writes.
        engine = create_async_engine(
            settings.database_url,
            pool_pre_ping=True,
            connect_args=connection_options(settings.database_url),
        )
        app.state.sessions = async_sessionmaker(engine, expire_on_commit=False)
        yield
        await engine.dispose()

    app = FastAPI(
        title="GridPulse API",
        version="1.0.0",
        lifespan=lifespan,
        description="Synthetic energy analytics portfolio demonstration. No physical grid control.",
    )
    app.state.settings = settings
    app.state.limiter = RateLimiter()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started, request_id = time.perf_counter(), str(uuid4())
        request.state.request_id = request_id
        # Do not trust arbitrary X-Forwarded-For headers. Production config trusts only its ingress.
        ip = request.client.host if request.client else "unknown"
        is_login = request.url.path == "/api/v1/auth/login"
        limit = 10 if is_login else settings.rate_limit_per_minute
        if request.url.path.startswith("/api/") and not app.state.limiter.allow(
            f"{ip}:{is_login}", limit
        ):
            response: Response = JSONResponse(
                {"error": {"message": "Too many requests", "request_id": request_id}},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        else:
            response = await call_next(request)
        response.headers.update(
            {
                "X-Request-ID": request_id,
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Cache-Control": "no-store",
            }
        )
        logger.info(
            json.dumps(
                {
                    "event": "http.request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                }
            )
        )
        return response

    def error_response(
        request: Request, code: int, message: str, headers: dict[str, str] | None = None
    ) -> JSONResponse:
        return JSONResponse(
            {
                "error": {
                    "message": message,
                    "request_id": getattr(request.state, "request_id", None),
                }
            },
            status_code=code,
            headers=headers,
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return error_response(
            request, exc.status_code, str(exc.detail), dict(exc.headers) if exc.headers else None
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic inputs may contain passwords, so never echo the raw error/input object.
        fields = ", ".join(".".join(str(x) for x in item["loc"]) for item in exc.errors())
        return error_response(request, 422, "Invalid request fields: " + fields)

    @app.exception_handler(ValidationError)
    async def model_validation_error(request: Request, exc: ValidationError) -> JSONResponse:
        return error_response(request, 422, "Invalid range or input values")

    @app.exception_handler(IntegrityError)
    async def conflict(request: Request, exc: IntegrityError) -> JSONResponse:
        return error_response(
            request, 409, "The record conflicts with an existing record or relationship"
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            json.dumps(
                {
                    "event": "http.error",
                    "request_id": getattr(request.state, "request_id", None),
                    "error_type": type(exc).__name__,
                }
            )
        )
        return error_response(request, 500, "Unexpected server error")

    @app.get("/health/live", tags=["Health"])
    async def live() -> dict[str, str]:
        """Indicate process health without requiring the database."""
        return {"status": "ok"}

    @app.get("/health/ready", tags=["Health"])
    async def ready() -> dict[str, str]:
        """Fail readiness when the database or migration is unavailable."""
        try:
            async with app.state.sessions() as session:
                await session.execute(text("SELECT version_num FROM alembic_version"))
        except Exception as exc:
            raise HTTPException(503, "Database or migrations unavailable") from exc
        return {"status": "ready"}

    app.include_router(router)
    return app
