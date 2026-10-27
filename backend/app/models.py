"""Normalized tables with tenant relationships enforced at the database boundary."""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def identifier() -> str:
    """Generate nonsequential public identifiers without relying on secrecy for access."""
    return str(uuid4())


def now_utc() -> datetime:
    """Return aware timestamps so incident age is independent of server timezone."""
    return datetime.now(UTC)


class Base(DeclarativeBase):
    """Share schema metadata between Alembic and application mappings."""


class Organization(Base):
    """Own all operational data; demo organizations cannot acquire real users."""

    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class User(Base):
    """Bind a login to one organization and a narrowly defined role."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('administrator','analyst')", name="user_role"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="analyst")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Facility(Base):
    """A metered site; capacity is descriptive and never a control command."""

    __tablename__ = "facilities"
    __table_args__ = (
        UniqueConstraint("id", "organization_id", name="uq_facility_tenant"),
        UniqueConstraint("organization_id", "code", name="uq_facility_code"),
        CheckConstraint("capacity_kw > 0", name="positive_capacity"),
        CheckConstraint(
            "status IN ('operational','maintenance','warning')", name="facility_status"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    code: Mapped[str] = mapped_column(String(24))
    name: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="operational")
    capacity_kw: Mapped[float] = mapped_column(Float)


class EnergyReading(Base):
    """One hourly mean-demand observation; missing intervals remain missing."""

    __tablename__ = "energy_readings"
    __table_args__ = (
        # The composite FK makes accidentally attaching another tenant's site impossible.
        ForeignKeyConstraint(
            ["facility_id", "organization_id"], ["facilities.id", "facilities.organization_id"]
        ),
        UniqueConstraint("facility_id", "timestamp", name="uq_reading_hour"),
        CheckConstraint("demand_kw >= 0", name="nonnegative_demand"),
        # Dashboard and export queries filter tenant, optional site, then a time interval.
        Index("ix_reading_tenant_time", "organization_id", "timestamp"),
        Index("ix_reading_tenant_site_time", "organization_id", "facility_id", "timestamp"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(String(36))
    facility_id: Mapped[str] = mapped_column(String(36))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    demand_kw: Mapped[float] = mapped_column(Float)


class Incident(Base):
    """Track an operational observation separately from its affected facilities."""

    __tablename__ = "incidents"
    __table_args__ = (
        UniqueConstraint("id", "organization_id", name="uq_incident_tenant"),
        CheckConstraint("severity BETWEEN 1 AND 4", name="incident_severity"),
        CheckConstraint("customer_impact >= 0", name="incident_impact"),
        CheckConstraint("status IN ('open','acknowledged','resolved')", name="incident_status"),
        Index("ix_incident_tenant_status", "organization_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    title: Mapped[str] = mapped_column(String(160))
    severity: Mapped[int] = mapped_column(Integer)
    customer_impact: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class IncidentFacility(Base):
    """Represent many affected sites without duplicating incident details."""

    __tablename__ = "incident_facilities"
    __table_args__ = (
        ForeignKeyConstraint(
            ["incident_id", "organization_id"], ["incidents.id", "incidents.organization_id"]
        ),
        ForeignKeyConstraint(
            ["facility_id", "organization_id"], ["facilities.id", "facilities.organization_id"]
        ),
    )
    incident_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    facility_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(36))


class ForecastRun(Base):
    """Record reproducible parameters and calculated results for signed-in analysts."""

    __tablename__ = "forecast_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["facility_id", "organization_id"], ["facilities.id", "facilities.organization_id"]
        ),
        Index("ix_forecast_tenant_created", "organization_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    organization_id: Mapped[str] = mapped_column(String(36))
    facility_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    result: Mapped[dict[str, Any]] = mapped_column(JSON)


class AuditEvent(Base):
    """Append a minimal attributable event in the same transaction as each mutation."""

    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_tenant_created", "organization_id", "created_at"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    actor_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(60))
    resource_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
