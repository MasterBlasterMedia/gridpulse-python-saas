"""Create local Compose configuration without exposing credentials in terminal output."""

import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    raise SystemExit(
        "Existing .env preserved. Edit it explicitly if configuration must change."
    )
# Restrictive file creation avoids a window where another local user could read fresh secrets.
with os.fdopen(
    os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w"
) as descriptor:
    descriptor.write(
        f"POSTGRES_PASSWORD={secrets.token_urlsafe(32)}\nJWT_SECRET={secrets.token_urlsafe(48)}\n"
    )
print("Created ignored .env. Next: docker compose up --build -d")
