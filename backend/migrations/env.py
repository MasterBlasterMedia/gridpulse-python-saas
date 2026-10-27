"""Run Alembic using the same async driver and metadata as the application."""

import asyncio

from alembic import context
from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.database import connection_options
from app.models import Base


def migrate(connection: Connection) -> None:
    """Wrap schema changes in a transaction on PostgreSQL."""
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def online() -> None:
    """Avoid pooling for a short-lived migration process."""
    url = get_settings().database_url
    engine = create_async_engine(url, poolclass=pool.NullPool, connect_args=connection_options(url))
    async with engine.connect() as connection:
        await connection.run_sync(migrate)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url, target_metadata=Base.metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(online())
