"""Validated runtime configuration; secrets never have usable defaults."""

from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    """Fail early when deployment configuration cannot provide safe isolation."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+asyncpg://gridpulse:gridpulse@localhost:5432/gridpulse"
    jwt_secret: str = Field(min_length=32)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    environment: str = "development"
    demo_enabled: bool = True
    token_minutes: int = Field(default=30, ge=1, le=60)
    rate_limit_per_minute: int = Field(default=120, ge=1)

    @field_validator("database_url")
    @classmethod
    def async_database_url(cls, value: str) -> str:
        """Accept provider-issued PostgreSQL URLs without logging or manually retyping secrets."""
        if value.startswith("postgres://"):
            value = "postgresql://" + value[len("postgres://") :]
        url = make_url(value)
        if url.drivername == "postgresql":
            url = url.set(drivername="postgresql+asyncpg")
        if url.drivername == "postgresql+asyncpg":
            query = dict(url.query)
            mode = query.pop("sslmode", None)
            # asyncpg uses `ssl`; hosted connections verify both certificate chain and hostname.
            if mode:
                query["ssl"] = (
                    "verify-full" if mode in {"require", "verify-ca", "verify-full"} else mode
                )
            query.pop(
                "channel_binding", None
            )  # This libpq-specific option is not an asyncpg keyword.
            url = url.set(query=query)
        return url.render_as_string(hide_password=False)

    @model_validator(mode="after")
    def production_origins(self) -> "Settings":
        """Require explicit TLS origins for the remotely hosted browser client."""
        if self.environment == "production" and any(
            not origin.startswith("https://") or "*" in origin for origin in self.cors_origins
        ):
            raise ValueError("Production CORS origins must be explicit HTTPS origins")
        return self


@lru_cache
def get_settings() -> Settings:
    """Parse environment once; dependencies can override this in isolated tests."""
    # BaseSettings resolves required fields from the environment rather than call arguments.
    return Settings()
