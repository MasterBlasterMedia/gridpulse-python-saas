"""Real SQL sessions with isolated data; optionally exercise PostgreSQL via TEST_DATABASE_URL."""

import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.main import create_app
from app.models import Base, EnergyReading, Facility, Incident, IncidentFacility, Organization, User
from app.schemas import Principal
from app.security import issue_token, password_hasher

TEST_PASSWORD = "Only-for-isolated-tests-2026!"
HASH = password_hasher.hash(TEST_PASSWORD)
SETTINGS = Settings(jwt_secret="only-for-tests-" * 4, rate_limit_per_minute=10000)


@pytest.fixture
async def session_factory():
    """Destructive fixture setup is allowed only on explicitly named test databases."""
    url = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    if not url.startswith("sqlite") and not url.rsplit("/", 1)[-1].endswith("_test"):
        raise ValueError("TEST_DATABASE_URL must point to a database ending in _test")
    engine = create_async_engine(url)
    if url.startswith("sqlite"):

        @event.listens_for(engine.sync_engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(
            text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))")
        )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                Organization(id="org-a", name="Tenant A", slug="a"),
                Organization(id="org-b", name="Tenant B", slug="b"),
                Organization(
                    id="org-demo", name="Synthetic Demo", slug="gridpulse-demo", is_demo=True
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                User(
                    id="admin-a",
                    organization_id="org-a",
                    email="admin@example.com",
                    password_hash=HASH,
                    role="administrator",
                ),
                User(
                    id="analyst-a",
                    organization_id="org-a",
                    email="analyst@example.com",
                    password_hash=HASH,
                    role="analyst",
                ),
                User(
                    id="admin-b",
                    organization_id="org-b",
                    email="other@example.com",
                    password_hash=HASH,
                    role="administrator",
                ),
            ]
        )
        for suffix in ["a", "b", "demo"]:
            session.add(
                Facility(
                    id=f"site-{suffix}",
                    organization_id=f"org-{suffix}",
                    code=suffix.upper() + "-01",
                    name=f"Site {suffix}",
                    region="Northeast",
                    kind="Research",
                    capacity_kw=1000,
                    status="operational",
                )
            )
        await session.flush()
        for suffix in ["a", "b", "demo"]:
            session.add_all(
                [
                    EnergyReading(
                        organization_id=f"org-{suffix}",
                        facility_id=f"site-{suffix}",
                        timestamp=datetime(2026, 10, 20, tzinfo=UTC) + timedelta(hours=i),
                        demand_kw=(100 if suffix != "b" else 900) + (i % 24),
                    )
                    for i in range(96)
                ]
            )
            session.add(
                Incident(
                    id=f"incident-{suffix}",
                    organization_id=f"org-{suffix}",
                    title=f"Incident {suffix}",
                    severity=3,
                    customer_impact=150,
                    status="open",
                    created_at=datetime(2026, 10, 23, tzinfo=UTC),
                )
            )
        await session.flush()
        session.add_all(
            [
                IncidentFacility(
                    organization_id=f"org-{suffix}",
                    facility_id=f"site-{suffix}",
                    incident_id=f"incident-{suffix}",
                )
                for suffix in ["a", "b", "demo"]
            ]
        )
        await session.commit()
    yield factory
    await engine.dispose()


@pytest.fixture
async def db(session_factory) -> AsyncIterator[AsyncSession]:
    """Expose the same database as HTTP handlers for persistence assertions."""
    async with session_factory() as session:
        yield session


@pytest.fixture
def app(session_factory):
    application = create_app(SETTINGS)
    application.state.sessions = session_factory
    return application


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.fixture
def headers():
    """Use genuine signed tokens while keeping tests independent of login rate limits."""

    def make(role="administrator", tenant="a"):
        principal = Principal(
            user_id="public-demo"
            if role == "demo"
            else f"{'admin' if role == 'administrator' else 'analyst'}-{tenant}",
            organization_id=f"org-{tenant}",
            organization_name="Test",
            role=role,
        )
        return {"Authorization": f"Bearer {issue_token(principal, SETTINGS)}"}

    return make
