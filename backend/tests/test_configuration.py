"""Deployment configuration should fail before a server accepts traffic."""

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_provider_url_is_normalized_with_certificate_verification():
    settings = Settings(
        jwt_secret="unit-test-signing-key" * 3,
        database_url="postgresql://user:test-only@db.example/gridpulse?sslmode=require&channel_binding=require",
    )
    assert (
        settings.database_url
        == "postgresql+asyncpg://user:test-only@db.example/gridpulse?ssl=verify-full"
    )


def test_production_rejects_unencrypted_browser_origins():
    with pytest.raises(ValidationError):
        Settings(
            jwt_secret="unit-test-signing-key" * 3,
            environment="production",
            cors_origins=["http://example.com"],
        )


def test_short_signing_keys_are_rejected():
    with pytest.raises(ValidationError):
        Settings(jwt_secret="short")
