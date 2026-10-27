"""Request-scoped database resources."""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Give each request its own transaction and close it even after errors."""
    # AsyncSession is mutable and cannot safely be shared by concurrent requests.
    async with request.app.state.sessions() as session:
        yield session
