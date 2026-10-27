"""Exercise authentication, tenancy, calculations, and mutation persistence through HTTP."""

from datetime import UTC, datetime

import jwt
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.main import RateLimiter
from app.models import AuditEvent, EnergyReading, Facility, ForecastRun, User
from app.services.operations import csv_safe
from tests.conftest import SETTINGS, TEST_PASSWORD


async def test_health_and_protected_endpoint(client):
    assert (await client.get("/health/live")).status_code == 200
    assert (await client.get("/health/ready")).status_code == 200
    response = await client.get("/api/v1/dashboard")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"


async def test_login_and_server_resolved_identity(client, db):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    auth = {"Authorization": "Bearer " + response.json()["access_token"]}
    assert (await client.get("/api/v1/auth/me", headers=auth)).json()["role"] == "administrator"
    assert await db.scalar(select(func.count()).select_from(AuditEvent)) == 1
    user = await db.get(User, "admin-a")
    user.active = False
    await db.commit()
    assert (await client.get("/api/v1/auth/me", headers=auth)).status_code == 401


@pytest.mark.parametrize(
    "email,password", [("admin@example.com", "wrong"), ("missing@example.com", TEST_PASSWORD)]
)
async def test_login_does_not_reveal_account_existence(client, email, password):
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid email or password"


async def test_invalid_and_expired_tokens(client):
    token = jwt.encode(
        {"sub": "admin-a", "iat": 0, "exp": 1, "iss": "gridpulse", "aud": "gridpulse-api"},
        SETTINGS.jwt_secret,
        algorithm="HS256",
    )
    for value in ["bad-token", token]:
        assert (
            await client.get("/api/v1/facilities", headers={"Authorization": "Bearer " + value})
        ).status_code == 401


async def test_demo_is_fixed_scope_and_read_only(client, headers, db):
    response = await client.post("/api/v1/auth/demo")
    assert response.status_code == 200
    auth = {"Authorization": "Bearer " + response.json()["access_token"]}
    assert (await client.get("/api/v1/facilities", headers=auth)).json()[0]["id"] == "site-demo"
    assert (
        await client.patch("/api/v1/facilities/site-demo", json={"status": "warning"}, headers=auth)
    ).status_code == 403
    assert (
        await client.patch(
            "/api/v1/incidents/incident-demo", json={"status": "resolved"}, headers=auth
        )
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/facilities/site-demo/forecast", json={"save": True}, headers=auth
        )
    ).status_code == 403
    assert (await client.get("/api/v1/audit", headers=auth)).status_code == 403
    assert (
        await client.post("/api/v1/facilities/site-demo/forecast", json={}, headers=auth)
    ).status_code == 200
    assert await db.scalar(select(func.count()).select_from(ForecastRun)) == 0
    assert await db.scalar(select(func.count()).select_from(AuditEvent)) == 0


@pytest.mark.parametrize(
    "path",
    [
        "/facilities/site-b",
        "/facilities/site-b/anomalies",
        "/dashboard?facility_id=site-b",
        "/reports/energy.csv?facility_id=site-b",
    ],
)
async def test_cross_tenant_read_is_not_found(client, headers, path):
    response = await client.get("/api/v1" + path, headers=headers())
    assert response.status_code == 404, response.text


async def test_cross_tenant_forecast_and_mutation(client, headers):
    assert (
        await client.post("/api/v1/facilities/site-b/forecast", json={}, headers=headers())
    ).status_code == 404
    assert (
        await client.patch(
            "/api/v1/incidents/incident-b", json={"status": "resolved"}, headers=headers()
        )
    ).status_code == 404
    assert (
        await client.patch(
            "/api/v1/facilities/site-b", json={"status": "warning"}, headers=headers()
        )
    ).status_code == 404


async def test_scoped_lists_and_report_never_include_foreign_data(client, headers):
    facilities = (await client.get("/api/v1/facilities", headers=headers())).json()
    assert [row["id"] for row in facilities] == ["site-a"]
    incidents = (await client.get("/api/v1/incidents", headers=headers())).json()
    assert [row["id"] for row in incidents] == ["incident-a"]
    report = await client.get("/api/v1/reports/energy.csv", headers=headers())
    assert report.status_code == 200
    assert "Site a" in report.text and "Site b" not in report.text
    assert len(report.text.splitlines()) == 97
    assert report.headers["content-disposition"].startswith("attachment")


async def test_dashboard_aggregates_real_values_and_filters(client, headers):
    result = await client.get("/api/v1/dashboard", headers=headers())
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["facility_count"] == 1
    assert body["current_demand_kw"] == 123
    assert body["consumption_kwh"] == 10704
    assert body["active_incidents"] == 1
    result = await client.get(
        "/api/v1/dashboard",
        params={"start": "2026-10-20T00:00:00Z", "end": "2026-10-21T00:00:00Z"},
        headers=headers(),
    )
    assert result.json()["consumption_kwh"] == 2676
    assert result.json()["coverage_percent"] == 100
    assert len(result.json()["series"]) == 24


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2026-10-21", "end": "2026-10-20"},
        {"start": "2020-01-01T00:00:00Z"},
        {"start": "2026-01-01T00:00:00Z", "end": "2026-10-01T00:00:00Z"},
    ],
)
async def test_invalid_date_ranges_are_rejected(client, headers, params):
    assert (
        await client.get("/api/v1/dashboard", params=params, headers=headers())
    ).status_code == 422


async def test_search_status_and_empty_ranges(client, headers):
    assert len((await client.get("/api/v1/facilities?search=Site", headers=headers())).json()) == 1
    assert (await client.get("/api/v1/facilities?search=%25", headers=headers())).json() == []
    assert (await client.get("/api/v1/facilities?status=warning", headers=headers())).json() == []
    result = (
        await client.get(
            "/api/v1/dashboard?start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z",
            headers=headers(),
        )
    ).json()
    assert result["series"] == [] and result["current_demand_kw"] is None


async def test_forecast_calculates_and_persists_with_audit(client, headers, db):
    result = await client.post(
        "/api/v1/facilities/site-a/forecast",
        json={"method": "moving_average", "save": True},
        headers=headers("analyst"),
    )
    assert result.status_code == 200, result.text
    body = result.json()
    assert len(body["series"]) == 24
    assert body["series"][0]["demand_kw"] == 111.5
    assert body["mae_kw"] == 6
    assert body["rmse_kw"] == pytest.approx(6.922, abs=0.001)
    assert await db.get(ForecastRun, body["saved_id"]) is not None
    assert (await client.get("/api/v1/forecasts", headers=headers())).json()[0]["id"] == body[
        "saved_id"
    ]
    assert (await client.get("/api/v1/forecasts", headers=headers(tenant="b"))).json() == []
    assert await db.scalar(select(func.count()).select_from(AuditEvent)) == 1


async def test_gaps_prevent_forecast_and_anomaly_window_bridges(client, headers, db):
    await db.execute(
        delete(EnergyReading).where(
            EnergyReading.facility_id == "site-a",
            EnergyReading.timestamp == datetime(2026, 10, 21, tzinfo=UTC),
        )
    )
    await db.commit()
    assert (
        await client.post("/api/v1/facilities/site-a/forecast", json={}, headers=headers())
    ).status_code == 422
    response = await client.get("/api/v1/facilities/site-a/anomalies", headers=headers())
    assert response.status_code == 200
    assert any(point["demand_kw"] is None for point in response.json()["series"])


async def test_admin_changes_are_persisted_and_audited(client, headers, db):
    body = {
        "code": "NEW-1",
        "name": "New campus",
        "region": "East",
        "kind": "Research",
        "capacity_kw": 1200,
    }
    assert (
        await client.post("/api/v1/facilities", json=body, headers=headers("analyst"))
    ).status_code == 403
    created = await client.post("/api/v1/facilities", json=body, headers=headers())
    assert created.status_code == 201, created.text
    site_id = created.json()["id"]
    assert (await db.get(Facility, site_id)).organization_id == "org-a"
    assert (
        await client.post("/api/v1/facilities", json=body, headers=headers())
    ).status_code == 409
    assert (
        await client.patch(
            "/api/v1/facilities/" + site_id, json={"status": "maintenance"}, headers=headers()
        )
    ).json()["status"] == "maintenance"
    assert (
        await client.patch(
            "/api/v1/incidents/incident-a", json={"status": "acknowledged"}, headers=headers()
        )
    ).status_code == 200
    assert (
        await client.patch(
            "/api/v1/incidents/incident-a", json={"status": "resolved"}, headers=headers()
        )
    ).status_code == 200
    assert (
        await client.patch(
            "/api/v1/incidents/incident-a", json={"status": "acknowledged"}, headers=headers()
        )
    ).status_code == 409
    assert (await client.get("/api/v1/incidents", headers=headers())).json() == []
    assert (
        len((await client.get("/api/v1/incidents?include_resolved=true", headers=headers())).json())
        == 1
    )
    events = (await client.get("/api/v1/audit", headers=headers())).json()
    assert len(events) == 4
    assert (await client.get("/api/v1/audit", headers=headers(tenant="b"))).json() == []


async def test_database_rejects_cross_tenant_relationship(db):
    db.add(
        EnergyReading(
            organization_id="org-a",
            facility_id="site-b",
            timestamp=datetime(2026, 11, 1, tzinfo=UTC),
            demand_kw=10,
        )
    )
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


async def test_validation_never_echoes_password(client):
    secret = "very-private-test-password"
    response = await client.post(
        "/api/v1/auth/login", json={"email": "invalid", "password": secret}
    )
    assert response.status_code == 422 and secret not in response.text


async def test_invalid_parameters_and_extra_tenant_fields(client, headers):
    assert (
        await client.get("/api/v1/facilities/site-a/anomalies?threshold=0", headers=headers())
    ).status_code == 422
    assert (
        await client.post(
            "/api/v1/facilities/site-a/forecast", json={"alpha": 2}, headers=headers()
        )
    ).status_code == 422
    body = {
        "code": "BAD",
        "name": "Bad",
        "region": "East",
        "kind": "Test",
        "capacity_kw": 10,
        "organization_id": "org-b",
    }
    assert (
        await client.post("/api/v1/facilities", json=body, headers=headers())
    ).status_code == 422


async def test_short_range_anomalies_use_prior_warmup_without_expanding_report(client, headers, db):
    reading = await db.scalar(
        select(EnergyReading).where(
            EnergyReading.facility_id == "site-a",
            EnergyReading.timestamp == datetime(2026, 10, 23, tzinfo=UTC),
        )
    )
    reading.demand_kw = 400
    await db.commit()
    params = {"start": "2026-10-23T00:00:00Z", "end": "2026-10-24T00:00:00Z"}
    response = await client.get(
        "/api/v1/facilities/site-a/anomalies", params=params, headers=headers()
    )
    assert response.status_code == 200
    assert len(response.json()["series"]) == 24
    assert response.json()["anomalies"][0]["index"] == 0
    dashboard = await client.get(
        "/api/v1/dashboard", params={**params, "facility_id": "site-a"}, headers=headers()
    )
    assert dashboard.json()["anomaly_count"] >= 1
    assert len(dashboard.json()["series"]) == 24
    assert dashboard.json()["active_incidents"] == 1


async def test_cors_allows_only_configured_origin(client):
    response = await client.options(
        "/api/v1/facilities",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    response = await client.options(
        "/api/v1/facilities",
        headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in response.headers


async def test_login_rate_limit(client):
    for _ in range(10):
        await client.post("/api/v1/auth/login", json={})
    response = await client.post("/api/v1/auth/login", json={})
    assert response.status_code == 429 and response.headers["retry-after"] == "60"


def test_limiter_expires_and_bounds_memory():
    limiter = RateLimiter(capacity=2)
    assert limiter.allow("a", 1, 0)
    assert not limiter.allow("a", 1, 1)
    assert limiter.allow("a", 1, 61)
    limiter.allow("b", 1, 62)
    limiter.allow("c", 1, 63)
    assert len(limiter.entries) == 2


@pytest.mark.parametrize("value", ["=SUM(A1:A2)", " +test", "-1", "@SUM(1)"])
def test_csv_formula_injection(value):
    assert csv_safe(value).startswith("'")
    assert csv_safe("Ordinary facility") == "Ordinary facility"
