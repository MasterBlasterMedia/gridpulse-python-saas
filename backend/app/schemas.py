"""Explicit HTTP contracts keep storage models out of public responses."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Role = Literal["administrator", "analyst", "demo"]


class LoginRequest(BaseModel):
    """Bound password input before running deliberately expensive Argon2 verification."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Principal(BaseModel):
    """Trusted identity rebuilt from server records, never from client-supplied roles."""

    user_id: str
    organization_id: str
    organization_name: str
    role: Role


class SessionResponse(BaseModel):
    """Short-lived bearer credentials with enough context to label demo access."""

    access_token: str
    token_type: str = "bearer"
    principal: Principal


class FacilityCreate(BaseModel):
    """Validated site metadata; tenant ownership is always assigned by the server."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str = Field(min_length=2, max_length=24, pattern=r"^[A-Z0-9-]+$")
    name: str = Field(min_length=2, max_length=100)
    region: str = Field(min_length=2, max_length=60)
    kind: str = Field(min_length=2, max_length=50)
    capacity_kw: float = Field(gt=0, le=1_000_000, allow_inf_nan=False)


class FacilityOut(FacilityCreate):
    """Public facility fields omit internal tenant keys."""

    model_config = ConfigDict(from_attributes=True)
    id: str
    status: Literal["operational", "maintenance", "warning"]


class FacilityStatus(BaseModel):
    """Restrict operations to documented lifecycle states."""

    status: Literal["operational", "maintenance", "warning"]


class IncidentStatus(BaseModel):
    """Acknowledge or resolve incidents without exposing arbitrary field updates."""

    status: Literal["acknowledged", "resolved"]


class TimeRange(BaseModel):
    """Use inclusive start and exclusive end for nonoverlapping report periods."""

    start: datetime | None = None
    end: datetime | None = None

    @field_validator("start", "end")
    @classmethod
    def aware(cls, value: datetime | None) -> datetime | None:
        """Reject ambiguous local timestamps at the API boundary."""
        if value is not None and value.tzinfo is None:
            raise ValueError("Include a timezone, for example 2026-10-01T00:00:00Z")
        return value

    @model_validator(mode="after")
    def ordered(self) -> "TimeRange":
        """Bound analysis work before large datasets reach application memory."""
        if self.start and self.end:
            hours = (self.end - self.start).total_seconds() / 3600
            if not 0 < hours <= 24 * 93:
                raise ValueError("Choose a positive interval of at most 93 days")
        return self


class ForecastRequest(BaseModel):
    """Keep simple baseline settings explicit and reproducible."""

    model_config = ConfigDict(extra="forbid")
    method: Literal["moving_average", "ewma"] = "ewma"
    horizon: int = Field(default=24, ge=1, le=72)
    window: int = Field(default=24, ge=3, le=168)
    alpha: float = Field(default=0.25, gt=0, le=1, allow_inf_nan=False)
    save: bool = False
