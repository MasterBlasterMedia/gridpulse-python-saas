"""Thin routes validate inputs and delegate tenant-scoped work."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select

from app.models import AuditEvent, Facility, ForecastRun, Incident, Organization
from app.repositories.operations import OperationsRepository
from app.schemas import (
    FacilityCreate,
    FacilityOut,
    FacilityStatus,
    ForecastRequest,
    IncidentStatus,
    LoginRequest,
    Principal,
    SessionResponse,
    TimeRange,
)
from app.security import Admin, Identity, Session, authenticate, issue_token
from app.services import operations

router = APIRouter(prefix="/api/v1")
Range = Annotated[TimeRange, Query()]


def repository(session: Session, principal: Identity) -> OperationsRepository:
    """Make it difficult for a new handler to forget tenant scoping."""
    return OperationsRepository(session, principal.organization_id)


Repo = Annotated[OperationsRepository, Depends(repository)]


@router.post("/auth/login", response_model=SessionResponse, tags=["Authentication"])
async def login(body: LoginRequest, request: Request, session: Session) -> SessionResponse:
    """Authenticate an existing account; public registration is intentionally absent."""
    principal = await authenticate(str(body.email), body.password, session)
    operations.audit(
        OperationsRepository(session, principal.organization_id),
        principal,
        "auth.login",
        principal.user_id,
    )
    await session.commit()
    return SessionResponse(
        access_token=issue_token(principal, request.app.state.settings), principal=principal
    )


@router.post("/auth/demo", response_model=SessionResponse, tags=["Authentication"])
async def demo(request: Request, session: Session) -> SessionResponse:
    """Issue a read-only identity for the specific demo organization, without credentials."""
    if not request.app.state.settings.demo_enabled:
        raise HTTPException(404, "Public demonstration disabled")
    org = await session.scalar(
        select(Organization).where(
            Organization.slug == "gridpulse-demo", Organization.is_demo.is_(True)
        )
    )
    if not org:
        raise HTTPException(503, "Demo dataset has not been initialized")
    principal = Principal(
        user_id="public-demo", organization_id=org.id, organization_name=org.name, role="demo"
    )
    return SessionResponse(
        access_token=issue_token(principal, request.app.state.settings), principal=principal
    )


@router.get("/auth/me", response_model=Principal, tags=["Authentication"])
async def me(principal: Identity) -> Principal:
    """Expose resolved permissions so clients can present appropriate controls."""
    return principal


@router.get("/facilities", response_model=list[FacilityOut], tags=["Facilities"])
async def facilities(
    repo: Repo,
    search: str = Query(default="", max_length=100),
    status: Literal["operational", "maintenance", "warning"] | None = None,
) -> list[Facility]:
    """Search and filter the caller's facility inventory."""
    return await repo.facilities(search, status)


@router.get("/facilities/{facility_id}", response_model=FacilityOut, tags=["Facilities"])
async def facility(facility_id: str, repo: Repo) -> Facility:
    """Retrieve one site with a tenant-constrained lookup."""
    return await repo.facility(facility_id)


@router.post("/facilities", response_model=FacilityOut, status_code=201, tags=["Facilities"])
async def create_facility(body: FacilityCreate, principal: Admin, repo: Repo) -> Facility:
    """Create metadata and its audit event as one atomic transaction."""
    site = Facility(**body.model_dump(), organization_id=principal.organization_id)
    repo.session.add(site)
    await repo.session.flush()
    operations.audit(repo, principal, "facility.created", site.id)
    await repo.session.commit()
    return site


@router.patch("/facilities/{facility_id}", response_model=FacilityOut, tags=["Facilities"])
async def change_facility(
    facility_id: str, body: FacilityStatus, principal: Admin, repo: Repo
) -> Facility:
    """Change descriptive operating status; no physical equipment is controlled."""
    site = await repo.facility(facility_id)
    site.status = body.status
    operations.audit(repo, principal, "facility.status." + body.status, site.id)
    await repo.session.commit()
    return site


@router.get("/dashboard", tags=["Analytics"])
async def dashboard(repo: Repo, period: Range, facility_id: str | None = None) -> dict[str, Any]:
    """Calculate metrics from stored hourly readings and scoped incidents."""
    return await operations.dashboard(repo, period, facility_id)


@router.get("/facilities/{facility_id}/anomalies", tags=["Analytics"])
async def anomalies(
    facility_id: str,
    repo: Repo,
    period: Range,
    window: int = Query(default=24, ge=3, le=168),
    threshold: float = Query(default=3, ge=1, le=10),
) -> dict[str, Any]:
    """Expose configurable trailing-window anomaly detection."""
    return await operations.anomalies(repo, facility_id, period, window, threshold)


@router.post("/facilities/{facility_id}/forecast", tags=["Analytics"])
async def forecast(
    facility_id: str, body: ForecastRequest, principal: Identity, repo: Repo
) -> dict[str, Any]:
    """Compute a forecast; demo access may calculate but cannot persist a run."""
    return await operations.run_forecast(repo, principal, facility_id, body)


@router.get("/forecasts", tags=["Analytics"])
async def forecasts(repo: Repo) -> list[dict[str, Any]]:
    """Retrieve up to fifty saved analyses in the caller's organization."""
    rows = (
        await repo.session.scalars(
            select(ForecastRun)
            .where(ForecastRun.organization_id == repo.organization_id)
            .order_by(ForecastRun.created_at.desc())
            .limit(50)
        )
    ).all()
    return [{"id": row.id, "created_at": row.created_at, "result": row.result} for row in rows]


@router.get("/incidents", tags=["Incidents"])
async def incidents(
    repo: Repo, limit: int = Query(default=20, ge=1, le=100), include_resolved: bool = False
) -> list[dict[str, Any]]:
    """Return an explainable priority queue with stable tie ordering."""
    return await operations.incident_queue(repo, limit, include_resolved)


@router.patch("/incidents/{incident_id}", tags=["Incidents"])
async def change_incident(
    incident_id: str, body: IncidentStatus, principal: Admin, repo: Repo
) -> dict[str, str]:
    """Allow forward lifecycle transitions and audit successful changes atomically."""
    incident = await repo.session.scalar(
        select(Incident)
        .where(Incident.id == incident_id, Incident.organization_id == repo.organization_id)
        .with_for_update()
    )
    if not incident:
        raise HTTPException(404, "Incident not found")
    if incident.status == "resolved" or incident.status == body.status:
        raise HTTPException(409, "Incident is already in this state or has been resolved")
    incident.status = body.status
    operations.audit(repo, principal, "incident." + body.status, incident.id)
    await repo.session.commit()
    return {"id": incident.id, "status": incident.status}


@router.get("/reports/energy.csv", tags=["Reporting"])
async def report(repo: Repo, period: Range, facility_id: str | None = None) -> Response:
    """Download bounded database results with spreadsheet formula injection protection."""
    return Response(
        await operations.energy_csv(repo, period, facility_id),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="gridpulse-energy.csv"'},
    )


@router.get("/audit", tags=["Administration"])
async def audit(principal: Admin, repo: Repo) -> list[dict[str, Any]]:
    """Expose a bounded audit trail only to administrators in the same organization."""
    rows = (
        await repo.session.scalars(
            select(AuditEvent)
            .where(AuditEvent.organization_id == principal.organization_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(100)
        )
    ).all()
    return [
        {
            "id": row.id,
            "actor_id": row.actor_id,
            "action": row.action,
            "resource_id": row.resource_id,
            "created_at": row.created_at,
        }
        for row in rows
    ]
