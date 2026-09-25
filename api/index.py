import os
import sys
import json
import traceback
from pathlib import Path

# Add project root and NticPlatform.Backend to sys.path so app modules are resolvable
_api_dir = Path(__file__).resolve().parent
_root_dir = _api_dir.parent

# Probe all plausible deployment locations for NticPlatform.Backend and dependencies
_candidates = [
    _root_dir / "NticPlatform.Backend",
    Path.cwd() / "NticPlatform.Backend",
    Path("/var/task/NticPlatform.Backend"),
    Path("/var/task/.venv/lib/python3.12/site-packages"),
    Path("/var/task/.venv/lib/python3.11/site-packages"),
    Path("/var/task/_vendor"),
    Path.cwd() / ".venv" / "lib" / "python3.12" / "site-packages",
    _root_dir,
    Path.cwd(),
    Path("/var/task"),
]

for _cand in _candidates:
    try:
        if _cand.exists() and str(_cand) not in sys.path:
            sys.path.insert(0, str(_cand))
    except Exception:
        pass

# Ensure Vercel serverless environment flag is recognized
os.environ.setdefault("VERCEL", "1")

# Safely import the FastAPI ASGI app from NticPlatform.Backend
_base_app = None
_import_error = None

try:
    from app.main import app as _base_app
except Exception as e:
    _import_error = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
    print(f"[api/index.py] CRITICAL: Failed to import FastAPI application:\n{_import_error}", flush=True)


# Vercel ASGI wrapper: normalizes paths and catches crashes with diagnostic telemetry
_db_initialized = False

def _ensure_db_init():
    global _db_initialized
    if not _db_initialized:
        try:
            from app.database import init_postgres_db
            init_postgres_db()
            _db_initialized = True
        except Exception as e:
            print(f"[api/index.py] DB init notice: {e}", flush=True)

async def app(scope, receive, send):
    scope_type = scope.get("type")
    _ensure_db_init()

    # If the app failed to load at boot, return diagnostic response instead of FUNCTION_INVOCATION_FAILED
    if _base_app is None:
        if scope_type == "http":
            _found_fastapi = []
            try:
                for r, d, f in os.walk("/var/task"):
                    if "fastapi" in d:
                        _found_fastapi.append(os.path.join(r, "fastapi"))
                    if len(_found_fastapi) > 5:
                        break
            except Exception as ex:
                _found_fastapi = [str(ex)]

            payload = json.dumps({
                "status": "error",
                "code": "BACKEND_INIT_FAILED",
                "message": "FastAPI application could not initialize in Vercel environment.",
                "detail": _import_error,
                "diagnostics": {
                    "cwd": str(Path.cwd()),
                    "file": str(__file__),
                    "sys_path": sys.path,
                    "vendor_contents": [p.name for p in Path("/var/task/_vendor").iterdir()][:15] if Path("/var/task/_vendor").exists() else "missing",
                    "lang_site_packages": [p.name for p in Path("/var/lang/lib/python3.12/site-packages").iterdir()][:15] if Path("/var/lang/lib/python3.12/site-packages").exists() else "missing",
                    "found_fastapi": _found_fastapi,
                }
            }, indent=2).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": payload})
        return

    # Normal request flow: normalize URL paths
    if scope_type in ("http", "websocket"):
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

    try:
        await _base_app(scope, receive, send)
    except Exception as runtime_err:
        if scope_type == "http":
            import json
            err_payload = json.dumps({
                "status": "error",
                "code": "INTERNAL_SERVER_ERROR",
                "detail": f"{type(runtime_err).__name__}: {runtime_err}",
                "traceback": traceback.format_exc(),
            }, indent=2).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": err_payload})
