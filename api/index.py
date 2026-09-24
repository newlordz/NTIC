import os
import sys
from pathlib import Path

# Add project root and NticPlatform.Backend to sys.path so app modules are resolvable
_api_dir = Path(__file__).resolve().parent
_root_dir = _api_dir.parent
_backend_dir = _root_dir / "NticPlatform.Backend"

if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

# Ensure Vercel serverless environment flag is recognized
os.environ.setdefault("VERCEL", "1")

# Import the FastAPI ASGI app from NticPlatform.Backend
from app.main import app as _base_app

# Vercel ASGI wrapper: normalizes paths so /api routes match regardless of rewrite style
async def app(scope, receive, send):
    if scope.get("type") in ("http", "websocket"):
        path = scope.get("path", "")
        # If Vercel rewrote path directly to function filename, recover original path from headers
        if path.endswith(".py") or path == "/api/index":
            headers = dict(scope.get("headers", []))
            orig = headers.get(b"x-matched-path", headers.get(b"x-forwarded-uri", b"")).decode("utf-8", "ignore")
            if orig and not orig.endswith(".py"):
                path = orig.split("?")[0]
        # Ensure path starts with /api to match FastAPI route declarations
        if not path.startswith("/api"):
            path = "/api" + (path if path.startswith("/") else f"/{path}")
        scope["path"] = path
    await _base_app(scope, receive, send)
