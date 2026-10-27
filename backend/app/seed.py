"""Deterministic synthetic data and explicit, opt-in local administrator provisioning."""

import argparse
import asyncio
import math
import os
import random
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.database import connection_options
from app.models import EnergyReading, Facility, Incident, IncidentFacility, Organization, User
from app.security import password_hasher

SITES = [
    ("NYC-01", "Hudson Research Campus", "New York", "Research", 2400),
    ("BOS-02", "Harbor Medical Center", "Boston", "Healthcare", 3200),
    ("PHL-03", "Franklin Logistics Hub", "Philadelphia", "Logistics", 1800),
    ("EWR-04", "Newark Data Center", "Newark", "Data center", 4600),
    ("ALB-05", "Capital Manufacturing", "Albany", "Manufacturing", 2800),
    ("PIT-06", "Allegheny Innovation Park", "Pittsburgh", "Commercial", 2100),
    ("BUF-07", "Lakeside Distribution", "Buffalo", "Logistics", 1600),
    ("HFD-08", "Connecticut Science Center", "Hartford", "Research", 1900),
    ("PVD-09", "Providence Business Park", "Providence", "Commercial", 2200),
    ("ROC-10", "Genesee Technology Campus", "Rochester", "Data center", 3800),
    ("SYR-11", "Central Valley Works", "Syracuse", "Manufacturing", 2600),
    ("NHV-12", "Elm City Health Campus", "New Haven", "Healthcare", 2900),
]


def stable_id(name: str) -> str:
    """Make seed identifiers repeatable without overwriting existing records."""
    return str(uuid5(NAMESPACE_URL, "https://gridpulse.example/" + name))


async def seed_demo(session: AsyncSession, end: datetime, days: int = 45) -> bool:
    """Create one synthetic organization once; repeated invocations are harmless."""
    if await session.scalar(select(Organization).where(Organization.slug == "gridpulse-demo")):
        return False
    org = Organization(
        id=stable_id("demo"),
        slug="gridpulse-demo",
        name="Northeast Energy Collective",
        is_demo=True,
    )
    session.add(org)
    await session.flush()
    randomizer = random.Random(42)
    sites = []
    for index, (code, name, region, kind, capacity) in enumerate(SITES):
        site = Facility(
            id=stable_id(code),
            organization_id=org.id,
            code=code,
            name=name,
            region=region,
            kind=kind,
            capacity_kw=capacity,
            status="warning" if index in (2, 4) else "maintenance" if index == 6 else "operational",
        )
        sites.append(site)
    session.add_all(sites)
    await session.flush()
    for index, site in enumerate(sites):
        rows = []
        for hour in range(days * 24):
            stamp = end - timedelta(hours=days * 24 - hour)
            # Different building types respond differently to workdays and daily occupancy.
            occupied = 0.13 * math.sin((stamp.hour - 7) / 24 * 2 * math.pi)
            weekday = 1 if stamp.weekday() < 5 else 0.87
            base = 0.65 if site.kind == "Data center" else 0.43
            demand = site.capacity_kw * (base + occupied) * weekday
            demand += randomizer.gauss(0, site.capacity_kw * 0.013)
            demand *= 1 + 0.025 * hour / (days * 24)
            # Labeled synthetic spikes exercise anomaly detection without contaminating every trace.
            if index in (2, 4) and hour in (days * 24 - 50, days * 24 - 18):
                demand *= 1.85
            rows.append(
                EnergyReading(
                    organization_id=org.id,
                    facility_id=site.id,
                    timestamp=stamp,
                    demand_kw=round(max(0, demand), 3),
                )
            )
        session.add_all(rows)
        await session.flush()
    titles = [
        "Demand excursion at Franklin hub",
        "Elevated overnight manufacturing load",
        "Meter inspection scheduled",
        "Cooling load outside baseline",
        "Consumption review completed",
    ]
    for index, title in enumerate(titles):
        incident = Incident(
            id=stable_id(f"incident-{index}"),
            organization_id=org.id,
            title=title,
            severity=[4, 3, 1, 2, 2][index],
            customer_impact=[1850, 720, 0, 340, 250][index],
            status="resolved" if index == 4 else "acknowledged" if index == 2 else "open",
            created_at=end - timedelta(hours=[4, 13, 29, 8, 45][index]),
        )
        session.add(incident)
        await session.flush()
        # Match associations to named incidents rather than their list positions.
        affected = [[sites[2], sites[4]], [sites[4]], [sites[6]], [sites[3]], [sites[5]]][index]
        session.add_all(
            [
                IncidentFacility(
                    organization_id=org.id, incident_id=incident.id, facility_id=site.id
                )
                for site in affected
            ]
        )
    await session.commit()
    return True


async def provision_admin(session: AsyncSession, email: str, password: str) -> None:
    """Provision a separate empty workspace, never privileged access to the public demo."""
    if len(password) < 14:
        raise ValueError("Administrator password must contain at least 14 characters")
    if await session.scalar(select(User).where(User.email == email.lower())):
        raise ValueError("That email already exists; seed will not reset credentials")
    org = Organization(
        name="Private operations workspace", slug="private-" + stable_id(email), is_demo=False
    )
    session.add(org)
    await session.flush()
    session.add(
        User(
            organization_id=org.id,
            email=email.lower(),
            password_hash=password_hasher.hash(password),
            role="administrator",
        )
    )
    await session.commit()


async def main() -> None:
    """Seed after migrations; credentials are read from environment and never printed."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--end", default="2026-10-27", help="Exclusive UTC end date; fixed for reproducibility"
    )
    parser.add_argument(
        "--admin", action="store_true", help="Read GRIDPULSE_ADMIN_EMAIL/PASSWORD from environment"
    )
    args = parser.parse_args()
    url = get_settings().database_url
    engine = create_async_engine(url, connect_args=connection_options(url))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            created = await seed_demo(session, datetime.fromisoformat(args.end).replace(tzinfo=UTC))
            print("Synthetic dataset created." if created else "Existing demo preserved.")
            if args.admin:
                await provision_admin(
                    session,
                    os.environ["GRIDPULSE_ADMIN_EMAIL"],
                    os.environ["GRIDPULSE_ADMIN_PASSWORD"],
                )
                print("Administrator created in a separate private workspace.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
