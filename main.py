import sys
import os
from pathlib import Path

# Ensure virtual environment site-packages are first on sys.path in Wasmer / container environments
for _sp in [
    Path("/opt/venv/lib/python3.13/site-packages"),
    Path("/opt/venv/lib/python3.12/site-packages"),
    Path("/opt/venv/lib/python3.11/site-packages"),
]:
    if _sp.exists() and str(_sp) not in sys.path:
        sys.path.insert(0, str(_sp))

_root_dir = Path(__file__).resolve().parent
_backend_path = _root_dir / "NticPlatform.Backend"
if str(_backend_path) not in sys.path:
    sys.path.insert(0, str(_backend_path))
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

try:
    import sitecustomize
except ImportError:
    pass

try:
    from app.main import app
except Exception as app_err:
    print(f"[main.py] Warning: full app.main import encountered: {app_err}", flush=True)
    import json
    import mimetypes

    _FRONTEND_CANDIDATES = [
        _root_dir / "static",
        _backend_path / "static",
        _root_dir / "NticPlatform.Frontend" / "dist" / "ntic-frontend" / "browser",
        _root_dir / "NticPlatform.Frontend" / "dist" / "browser",
        Path("/app/static"),
        Path("/app/NticPlatform.Frontend/dist/ntic-frontend/browser"),
        Path("/app/NticPlatform.Frontend/dist/browser"),
    ]
    _FRONTEND_DIR = next((p for p in _FRONTEND_CANDIDATES if p.is_dir()), None)

    async def app(scope, receive, send):
        if scope["type"] == "lifespan":
            while True:
                msg = await receive()
                if msg["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif msg["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        elif scope["type"] == "http":
            path = scope.get("path", "/")
            if path == "/api/health":
                content = json.dumps({"status": "ok", "service": "ntic-platform"}).encode("utf-8")
                await send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"access-control-allow-origin", b"*"),
                    ],
                })
                await send({"type": "http.response.body", "body": content})
                return

            if _FRONTEND_DIR:
                clean = path.lstrip("/")
                fpath = _FRONTEND_DIR / clean if clean else _FRONTEND_DIR / "index.html"
                if not fpath.is_file() and clean.startswith("assets/"):
                    alt = _FRONTEND_DIR / clean[7:]
                    if alt.is_file():
                        fpath = alt
                elif not fpath.is_file() and not clean.startswith("assets/"):
                    alt = _FRONTEND_DIR / "assets" / clean
                    if alt.is_file():
                        fpath = alt
                if not fpath.is_file():
                    fpath = _FRONTEND_DIR / "index.html"
                if fpath.is_file():
                    mime, _ = mimetypes.guess_type(str(fpath))
                    with open(fpath, "rb") as f:
                        data = f.read()
                    await send({
                        "type": "http.response.start",
                        "status": 200,
                        "headers": [
                            (b"content-type", (mime or "application/octet-stream").encode("utf-8")),
                            (b"access-control-allow-origin", b"*"),
                        ],
                    })
                    await send({"type": "http.response.body", "body": data})
                    return

            msg = json.dumps({"status": "ok", "message": "NTIC Platform API is running"}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"access-control-allow-origin", b"*"),
                ],
            })
            await send({"type": "http.response.body", "body": msg})
