"""Compose SQL data with pure algorithms; keep HTTP routes small and auditable."""

import csv
import io
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select

from app.models import AuditEvent, ForecastRun, IncidentFacility
from app.repositories.operations import OperationsRepository, utc
from app.schemas import ForecastRequest, Principal, TimeRange
from app.services.analytics import (
    detect_anomalies,
    forecast,
    prioritize,
    priority_score,
    trend_percent,
)


def audit(repo: OperationsRepository, principal: Principal, action: str, resource_id: str) -> None:
    """Stage an event in the caller's transaction so failed writes never appear successful."""
    repo.session.add(
        AuditEvent(
            organization_id=principal.organization_id,
            actor_id=principal.user_id,
            action=action,
            resource_id=resource_id,
        )
    )


async def dashboard(
    repo: OperationsRepository, period: TimeRange, facility_id: str | None
) -> dict[str, Any]:
    """Aggregate hourly mean kW into kWh without treating missing intervals as zero."""
    start, end = await repo.bounds(period, facility_id)
    # Warm up detectors before the displayed range so a one-day view can still reveal spikes.
    history = await repo.readings(start - timedelta(hours=24), end, facility_id)
    rows = [row for row in history if utc(row.timestamp) >= start]
    facilities = [await repo.facility(facility_id)] if facility_id else await repo.facilities()
    totals: dict[datetime, float] = {}
    counts: dict[datetime, int] = {}
    site_totals: dict[str, float] = {}
    site_latest: dict[str, float] = {}
    site_counts: dict[str, int] = {}
    for row in rows:
        stamp = utc(row.timestamp)
        totals[stamp] = totals.get(stamp, 0) + row.demand_kw
        counts[stamp] = counts.get(stamp, 0) + 1
        site_totals[row.facility_id] = site_totals.get(row.facility_id, 0) + row.demand_kw
        site_counts[row.facility_id] = site_counts.get(row.facility_id, 0) + 1
        site_latest[row.facility_id] = row.demand_kw
    # Fleet comparisons use only complete hours; partial fleets would create false trends.
    complete = [stamp for stamp in sorted(totals) if counts[stamp] == len(facilities)]
    latest = complete[-1] if complete else None
    incident_rows = await repo.incident_rows()
    if facility_id:
        affected = set(
            (
                await repo.session.scalars(
                    select(IncidentFacility.incident_id).where(
                        IncidentFacility.organization_id == repo.organization_id,
                        IncidentFacility.facility_id == facility_id,
                    )
                )
            ).all()
        )
        incident_rows = [(i, c) for i, c in incident_rows if i.id in affected]
    expected = max(1, int((end - start).total_seconds() // 3600) * len(facilities))
    # Per-site detection preserves real anomalies that fleet aggregation can obscure.
    anomaly_count = 0
    for site in facilities:
        series = hourly_series([r for r in history if r.facility_id == site.id])
        anomaly_count += sum(
            series[item.index][0] >= start for item in detect_anomalies([v for _, v in series])
        )
    return {
        "synthetic": True,
        "start": start,
        "end": end,
        "as_of": latest,
        "facility_count": len(facilities),
        "current_demand_kw": round(totals[latest], 2) if latest else None,
        "consumption_kwh": round(sum(site_totals.values()), 2),
        "peak_demand_kw": round(max((totals[s] for s in complete), default=0), 2),
        "active_incidents": sum(i.status != "resolved" for i, _ in incident_rows),
        "anomaly_count": anomaly_count,
        "trend_percent": trend_percent([totals[s] for s in complete]),
        "coverage_percent": round(min(100, len(rows) / expected * 100), 2),
        "series": [
            {
                "timestamp": stamp,
                "demand_kw": round(totals[stamp], 2) if counts[stamp] == len(facilities) else None,
                "reporting_facilities": counts[stamp],
            }
            for stamp in sorted(totals)
        ],
        "facilities": [
            {
                "id": site.id,
                "name": site.name,
                "code": site.code,
                "region": site.region,
                "kind": site.kind,
                "status": site.status,
                "capacity_kw": site.capacity_kw,
                "current_demand_kw": site_latest.get(site.id),
                "consumption_kwh": round(site_totals.get(site.id, 0), 2),
                "average_demand_kw": round(site_totals.get(site.id, 0) / site_counts[site.id], 2)
                if site_counts.get(site.id)
                else None,
            }
            for site in facilities
        ],
    }


def hourly_series(rows: list[Any]) -> list[tuple[datetime, float | None]]:
    """Insert explicit gaps so algorithms cannot confuse nonadjacent hours."""
    if not rows:
        return []
    mapping = {utc(row.timestamp): row.demand_kw for row in rows}
    current, end = min(mapping), max(mapping)
    result = []
    while current <= end:
        result.append((current, mapping.get(current)))
        current += timedelta(hours=1)
    return result


async def anomalies(
    repo: OperationsRepository, facility_id: str, period: TimeRange, window: int, threshold: float
) -> dict[str, Any]:
    """Return chart observations and flags from the same selected interval."""
    start, end = await repo.bounds(period, facility_id)
    rows = await repo.readings(start - timedelta(hours=window), end, facility_id)
    series = hourly_series(rows)
    flagged = detect_anomalies([value for _, value in series], window, threshold)
    visible = [(stamp, value) for stamp, value in series if stamp >= start]
    offset = len(series) - len(visible)
    return {
        "window": window,
        "threshold": threshold,
        "start": start,
        "end": end,
        "series": [{"timestamp": stamp, "demand_kw": value} for stamp, value in visible],
        "anomalies": [
            {**asdict(item), "index": item.index - offset, "timestamp": series[item.index][0]}
            for item in flagged
            if series[item.index][0] >= start
        ],
    }


async def run_forecast(
    repo: OperationsRepository, principal: Principal, facility_id: str, options: ForecastRequest
) -> dict[str, Any]:
    """Calculate bounded forecasts; persist only when a non-demo user explicitly requests it."""
    if options.save and principal.role == "demo":
        raise HTTPException(403, "The public demonstration is read-only")
    start, end = await repo.bounds(TimeRange(), facility_id)
    rows = await repo.readings(start - timedelta(days=7), end, facility_id)
    series = hourly_series(rows)
    if any(value is None for _, value in series):
        raise HTTPException(
            422, "Forecast requires consecutive hourly readings; this range has gaps"
        )
    try:
        result = forecast(
            [float(value) for _, value in series if value is not None],
            options.method,
            options.horizon,
            options.window,
            options.alpha,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    predictions = result.pop("predictions")
    assert isinstance(predictions, list)
    result.update(
        {
            "facility_id": facility_id,
            "as_of": end.isoformat(),
            "series": [
                {"timestamp": (end + timedelta(hours=i)).isoformat(), "demand_kw": value}
                for i, value in enumerate(predictions)
            ],
            "history": [
                {"timestamp": stamp.isoformat(), "demand_kw": value}
                for stamp, value in series[-48:]
            ],
            "synthetic": True,
        }
    )
    if options.save:
        run = ForecastRun(
            organization_id=principal.organization_id, facility_id=facility_id, result=result
        )
        repo.session.add(run)
        await repo.session.flush()
        audit(repo, principal, "forecast.saved", run.id)
        await repo.session.commit()
        result["saved_id"] = run.id
    return result


async def incident_queue(
    repo: OperationsRepository, limit: int, include_resolved: bool
) -> list[dict[str, Any]]:
    """Rank with one consistent clock so tie ordering cannot change within a response."""
    now = datetime.now(UTC)
    items: dict[str, dict[str, Any]] = {}
    for incident, count in await repo.incident_rows():
        if incident.status == "resolved" and not include_resolved:
            continue
        age = max(0, (now - utc(incident.created_at)).total_seconds() / 3600)
        score = priority_score(incident.severity, count, incident.customer_impact, age)
        items[incident.id] = {
            "id": incident.id,
            "title": incident.title,
            "severity": incident.severity,
            "status": incident.status,
            "facilities_affected": count,
            "customer_impact": incident.customer_impact,
            "created_at": utc(incident.created_at),
            "age_hours": round(age, 1),
            "priority_score": score,
        }
    return [
        items[key]
        for key in prioritize(
            [(key, value["priority_score"]) for key, value in items.items()], limit
        )
    ]


def csv_safe(value: str) -> str:
    """Neutralize spreadsheet formula prefixes even after leading whitespace."""
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value


async def energy_csv(repo: OperationsRepository, period: TimeRange, facility_id: str | None) -> str:
    """Export real query results with explicit units and synthetic provenance."""
    start, end = await repo.bounds(period, facility_id)
    rows = await repo.readings(start, end, facility_id)
    facilities = {site.id: site for site in await repo.facilities()}
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "facility_code",
            "facility_name",
            "timestamp_utc",
            "mean_demand_kw",
            "energy_kwh",
            "synthetic",
        ]
    )
    for row in rows:
        site = facilities[row.facility_id]
        writer.writerow(
            [
                csv_safe(site.code),
                csv_safe(site.name),
                utc(row.timestamp).isoformat(),
                row.demand_kw,
                row.demand_kw,
                "true",
            ]
        )
    return buffer.getvalue()
