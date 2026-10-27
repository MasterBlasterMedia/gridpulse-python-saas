"""Short-lived authentication and explicit authorization dependencies."""

from datetime import UTC, datetime, timedelta
from typing import Annotated, cast

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import Settings
from app.database import get_session
from app.models import Organization, User
from app.schemas import Principal, Role

password_hasher = PasswordHash.recommended()
# Unknown users still incur a real hash verification, reducing email enumeration via timing.
dummy_hash = password_hasher.hash("not-an-account-password")
bearer = HTTPBearer(auto_error=False)
Session = Annotated[AsyncSession, Depends(get_session)]


def issue_token(principal: Principal, settings: Settings) -> str:
    """Sign only identity; resolve mutable roles and account status on every request."""
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": principal.user_id,
            "iat": now,
            "exp": now + timedelta(minutes=settings.token_minutes),
            "iss": "gridpulse",
            "aud": "gridpulse-api",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


async def authenticate(email: str, password: str, session: AsyncSession) -> Principal:
    """Verify Argon2 off the event loop and return the same error for all failures."""
    user = await session.scalar(select(User).where(User.email == email.lower()))
    valid = await run_in_threadpool(
        password_hasher.verify, password, user.password_hash if user else dummy_hash
    )
    if not user or not valid or not user.active:
        raise HTTPException(
            401, "Invalid email or password", headers={"WWW-Authenticate": "Bearer"}
        )
    organization = await session.get(Organization, user.organization_id)
    if not organization or organization.is_demo:
        raise HTTPException(401, "Invalid email or password")
    return Principal(
        user_id=user.id,
        organization_id=organization.id,
        organization_name=organization.name,
        role=cast(Role, user.role),
    )


async def current_principal(
    request: Request,
    session: Session,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Principal:
    """Rebuild authorization from trusted rows so role revocation applies immediately."""
    settings: Settings = request.app.state.settings
    try:
        if credentials is None:
            raise ValueError("Missing bearer token")
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer="gridpulse",
            audience="gridpulse-api",
            options={"require": ["exp", "iat", "sub"]},
        )
        subject = payload["sub"]
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise HTTPException(
            401, "Authentication required", headers={"WWW-Authenticate": "Bearer"}
        ) from exc
    if subject == "public-demo" and settings.demo_enabled:
        org = await session.scalar(
            select(Organization).where(
                Organization.slug == "gridpulse-demo", Organization.is_demo.is_(True)
            )
        )
        if org:
            return Principal(
                user_id="public-demo",
                organization_id=org.id,
                organization_name=org.name,
                role="demo",
            )
    user = await session.get(User, subject)
    if user and user.active:
        org = await session.get(Organization, user.organization_id)
        if org and not org.is_demo:
            return Principal(
                user_id=user.id,
                organization_id=org.id,
                organization_name=org.name,
                role=cast(Role, user.role),
            )
    raise HTTPException(401, "Account unavailable")


Identity = Annotated[Principal, Depends(current_principal)]


def require_writer(principal: Identity) -> Principal:
    """Reject the public identity before any persisted mutation can execute."""
    if principal.role == "demo":
        raise HTTPException(403, "The public demonstration is read-only")
    return principal


def require_admin(principal: Annotated[Principal, Depends(require_writer)]) -> Principal:
    """Reserve operational state changes for administrators."""
    if principal.role != "administrator":
        raise HTTPException(403, "Administrator access required")
    return principal


Admin = Annotated[Principal, Depends(require_admin)]
