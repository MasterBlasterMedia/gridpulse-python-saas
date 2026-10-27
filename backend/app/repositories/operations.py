"""Bounded data access shared by dashboard, analytics, and CSV reporting."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EnergyReading, Facility, Incident, IncidentFacility
from app.schemas import TimeRange


def utc(value: datetime) -> datetime:
    """Normalize SQLite test timestamps and PostgreSQL timestamps to one representation."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class OperationsRepository:
    """Require tenant context once and carry it through every resource lookup."""

    def __init__(self, session: AsyncSession, organization_id: str):
        self.session = session
        self.organization_id = organization_id

    async def facility(self, facility_id: str) -> Facility:
        """Return 404 for missing and foreign resources to avoid disclosing existence."""
        facility = await self.session.scalar(
            select(Facility).where(
                Facility.id == facility_id, Facility.organization_id == self.organization_id
            )
        )
        if not facility:
            raise HTTPException(404, "Facility not found")
        return facility

    async def facilities(self, search: str = "", status: str | None = None) -> list[Facility]:
        """Search bounded site metadata; escape SQL wildcard characters in user input."""
        query = select(Facility).where(Facility.organization_id == self.organization_id)
        if search:
            # Literal matching prevents '%' from unintentionally expanding a user's search.
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = query.where(Facility.name.ilike(f"%{escaped}%", escape="\\"))
        if status:
            query = query.where(Facility.status == status)
        return list((await self.session.scalars(query.order_by(Facility.name).limit(500))).all())

    async def bounds(
        self, period: TimeRange, facility_id: str | None = None
    ) -> tuple[datetime, datetime]:
        """Default to the latest seeded observation so an archived demo remains explorable."""
        if facility_id:
            await self.facility(facility_id)
        query = select(func.max(EnergyReading.timestamp)).where(
            EnergyReading.organization_id == self.organization_id
        )
        if facility_id:
            query = query.where(EnergyReading.facility_id == facility_id)
        latest = await self.session.scalar(query)
        end = period.end or (utc(latest) + timedelta(hours=1) if latest else datetime.now(UTC))
        start = period.start or end - timedelta(days=7)
        # Validate resolved defaults too; otherwise a partial range could bypass the cap.
        try:
            TimeRange(start=start, end=end)
        except ValueError as exc:
            raise HTTPException(422, "Choose a positive interval of at most 93 days") from exc
        return start, end

    async def readings(
        self,
        start: datetime,
        end: datetime,
        facility_id: str | None = None,
    ) -> list[EnergyReading]:
        """Fetch at most 200k hourly points; fail explicitly instead of silently truncating."""
        query = select(EnergyReading).where(
            EnergyReading.organization_id == self.organization_id,
            EnergyReading.timestamp >= start,
            EnergyReading.timestamp < end,
        )
        if facility_id:
            query = query.where(EnergyReading.facility_id == facility_id)
        rows = list(
            (
                await self.session.scalars(query.order_by(EnergyReading.timestamp).limit(200001))
            ).all()
        )
        if len(rows) > 200000:
            raise HTTPException(422, "Select a shorter range or an individual facility")
        return rows

    async def incident_rows(self) -> list[tuple[Incident, int]]:
        """Count affected sites with one grouped join instead of one query per incident."""
        query = (
            select(Incident, func.count(IncidentFacility.facility_id))
            .outerjoin(IncidentFacility, IncidentFacility.incident_id == Incident.id)
            .where(Incident.organization_id == self.organization_id)
            .group_by(Incident.id)
        )
        return [(incident, count) for incident, count in (await self.session.execute(query)).all()]
