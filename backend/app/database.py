"""Request-scoped database resources."""

import ssl
from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession


def connection_options(database_url: str) -> dict[str, ssl.SSLContext]:
    """Use system trust roots for hosted PostgreSQL without weakening TLS verification."""
    url = make_url(database_url)
    if url.drivername == "postgresql+asyncpg" and url.query.get("ssl") == "verify-full":
        # A mode string makes asyncpg expect ~/.postgresql/root.crt. An explicit context
        # uses the OS trust store and still requires a valid certificate and hostname.
        return {"ssl": ssl.create_default_context()}
    return {}


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Give each request its own transaction and close it even after errors."""
    # AsyncSession is mutable and cannot safely be shared by concurrent requests.
    async with request.app.state.sessions() as session:
        yield session
