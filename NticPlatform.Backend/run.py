import sys
import os
import json
import uuid
from pathlib import Path

# Ensure virtual environment site-packages are first on sys.path in Wasmer / container environments
for _sp in [
    Path("/opt/venv/lib/python3.13/site-packages"),
    Path("/opt/venv/lib/python3.12/site-packages"),
    Path("/opt/venv/lib/python3.11/site-packages"),
]:
    if _sp.exists() and str(_sp) not in sys.path:
        sys.path.insert(0, str(_sp))

_root_path = Path(__file__).resolve().parent.parent
if str(_root_path) not in sys.path:
    sys.path.insert(0, str(_root_path))
_backend_path = Path(__file__).resolve().parent
if str(_backend_path) not in sys.path:
    sys.path.insert(0, str(_backend_path))

try:
    import sitecustomize
except ImportError:
    pass

try:
    from app.config import settings
except Exception:
    class _FallbackSettings:
        PORT = int(os.getenv("PORT", "80"))
        POSTGRES_HOST = os.getenv("DB_HOST", "127.0.0.1")
        POSTGRES_PORT = int(os.getenv("DB_PORT", "5432"))
        POSTGRES_DB = os.getenv("DB_NAME", "postgres")
        POSTGRES_USER = os.getenv("DB_USERNAME", "postgres")
        POSTGRES_PASSWORD = os.getenv("DB_PASSWORD", "")
    settings = _FallbackSettings()

def _safe_get_db():
    try:
        from app.database import get_db_connection
        conn = get_db_connection()
        if conn:
            return conn
    except Exception as e:
        sys._last_db_error = f"get_db_connection: {e}"

    # Try pg8000 (pure-Python, works seamlessly in Wasmer / WASIX sandbox)
    try:
        import pg8000.dbapi
        for use_ssl in [True, False]:
            try:
                conn = pg8000.dbapi.connect(
                    user=settings.POSTGRES_USER,
                    host=settings.POSTGRES_HOST,
                    port=int(settings.POSTGRES_PORT),
                    database=settings.POSTGRES_DB,
                    password=settings.POSTGRES_PASSWORD,
                    ssl_context=use_ssl,
                    timeout=5,
                )
                print(f"[run.py] pg8000 connect succeeded with ssl_context={use_ssl}", flush=True)
                sys._last_db_error = None
                return conn
            except Exception as pg_err:
                sys._last_db_error = f"pg8000 ssl={use_ssl}: {pg_err}"
    except Exception as pg_import_err:
        sys._last_db_error = f"pg8000 import error: {pg_import_err}"

    try:
        import psycopg2
        for ssl_mode in ["prefer", "require", "disable"]:
            try:
                conn = psycopg2.connect(
                    host=settings.POSTGRES_HOST,
                    port=settings.POSTGRES_PORT,
                    user=settings.POSTGRES_USER,
                    password=settings.POSTGRES_PASSWORD,
                    dbname=settings.POSTGRES_DB,
                    connect_timeout=5,
                    sslmode=ssl_mode,
                )
                print(f"[run.py] Direct connect succeeded with sslmode={ssl_mode}", flush=True)
                return conn
            except Exception as ssl_err:
                sys._last_db_error = f"sslmode={ssl_mode}: {ssl_err}"
    except Exception as direct_err:
        if not getattr(sys, "_last_db_error", None):
            sys._last_db_error = f"psycopg2 error: {direct_err}"
        print(f"[run.py] DB connection helper error: {direct_err}", flush=True)
    return None

def _safe_init_db():
    try:
        from app.database import init_postgres_db
        ok, msg = init_postgres_db()
        if ok:
            return True, msg
    except Exception as e:
        pass

    conn = _safe_get_db()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS students (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    first_name VARCHAR(100),
                    last_name VARCHAR(100),
                    email VARCHAR(255) UNIQUE,
                    track VARCHAR(50),
                    consent_granted BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
            cur.close()
            conn.close()
            print("[run.py] Initialized students table via fallback driver", flush=True)
            return True, "OK"
        except Exception as e:
            print(f"[run.py] Fallback DB init error: {e}", flush=True)
            return False, str(e)
    return False, "DB unreachable"

_FRONTEND_CANDIDATES = [
    _root_path / "static",
    _backend_path / "static",
    _root_path / "NticPlatform.Frontend" / "dist" / "ntic-frontend" / "browser",
    _root_path / "NticPlatform.Frontend" / "dist" / "browser",
    Path("/app/static"),
    Path("/app/NticPlatform.Frontend/dist/ntic-frontend/browser"),
    Path("/app/NticPlatform.Frontend/dist/browser"),
]
_FRONTEND_DIST = next((p for p in _FRONTEND_CANDIDATES if p.is_dir()), None)

def run_standalone_server(port):
    """Fallback standalone Python HTTP server if uvicorn/fastapi are not installed or fail."""
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import mimetypes

    class StandaloneHandler(BaseHTTPRequestHandler):
        def _send_cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID')

        def do_OPTIONS(self):
            self.send_response(204)
            self._send_cors()
            self.end_headers()

        def do_GET(self):
            path = self.path.split('?')[0]
            if path == '/api/health':
                conn = _safe_get_db()
                status_msg = "connected" if conn else "disconnected"
                if conn:
                    conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "database": status_msg,
                    "db_error": getattr(sys, "_last_db_error", None),
                    "config": {
                        "host": settings.POSTGRES_HOST,
                        "port": settings.POSTGRES_PORT,
                        "db": settings.POSTGRES_DB,
                        "user": settings.POSTGRES_USER
                    }
                }).encode('utf-8'))
            elif path == '/api/students':
                conn = _safe_get_db()
                if not conn:
                    self.send_response(503)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "PostgreSQL database unreachable"}).encode('utf-8'))
                    return
                cur = conn.cursor()
                cur.execute("SELECT id, tenant_id, first_name, last_name, email, track, consent_granted, created_at FROM students ORDER BY created_at DESC")
                rows = cur.fetchall()
                cur.close()
                conn.close()
                results = [
                    {
                        "id": r[0],
                        "tenant_id": r[1],
                        "first_name": r[2],
                        "last_name": r[3],
                        "email": r[4],
                        "track": r[5],
                        "consent_granted": r[6],
                        "created_at": str(r[7])
                    }
                    for r in rows
                ]
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            else:
                # Static file serving (SPA support)
                clean_path = path.lstrip('/')
                served = False
                if _FRONTEND_DIST:
                    target_file = _FRONTEND_DIST / clean_path
                    if not target_file.is_file() and clean_path.startswith('assets/'):
                        alt = _FRONTEND_DIST / clean_path[7:]
                        if alt.is_file():
                            target_file = alt
                    elif not target_file.is_file() and not clean_path.startswith('assets/'):
                        alt = _FRONTEND_DIST / 'assets' / clean_path
                        if alt.is_file():
                            target_file = alt
                    if target_file.is_file():
                        mime_type, _ = mimetypes.guess_type(str(target_file))
                        self.send_response(200)
                        self.send_header('Content-Type', mime_type or 'application/octet-stream')
                        self._send_cors()
                        self.end_headers()
                        with open(target_file, 'rb') as f:
                            self.wfile.write(f.read())
                        served = True
                    elif (_FRONTEND_DIST / "index.html").is_file():
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self._send_cors()
                        self.end_headers()
                        with open(_FRONTEND_DIST / "index.html", 'rb') as f:
                            self.wfile.write(f.read())
                        served = True

                if not served:
                    if path == '/':
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self._send_cors()
                        self.end_headers()
                        self.wfile.write(json.dumps({"status": "ok", "message": "NTIC Platform API is running"}).encode('utf-8'))
                    else:
                        self.send_response(404)
                        self.send_header('Content-Type', 'application/json')
                        self._send_cors()
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode('utf-8'))

        def do_POST(self):
            path = self.path.split('?')[0]
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                data = {}

            if path == '/api/students':
                conn = _safe_get_db()
                if not conn:
                    self.send_response(503)
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "DB Unreachable"}).encode('utf-8'))
                    return
                s_id = str(uuid.uuid4())
                cur = conn.cursor()
                try:
                    cur.execute("""
                        INSERT INTO students (id, tenant_id, first_name, last_name, email, track, consent_granted)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (
                        s_id,
                        data.get("tenant_id", "11111111-1111-1111-1111-111111111111"),
                        data.get("first_name", "Anonymous"),
                        data.get("last_name", "Student"),
                        data.get("email", f"{s_id[:8]}@ntic.org.gh"),
                        data.get("track", "Coding"),
                        data.get("consent_granted", True)
                    ))
                    conn.commit()
                    self.send_response(201)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"id": s_id, "first_name": data.get("first_name"), "email": data.get("email")}).encode('utf-8'))
                except Exception as e:
                    conn.rollback()
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                finally:
                    cur.close()
                    conn.close()
            else:
                self.send_response(404)
                self._send_cors()
                self.end_headers()

    _safe_init_db()
    server = HTTPServer(('0.0.0.0', port), StandaloneHandler)
    print(f"============================================================")
    print(f" NTIC Platform Python Backend API")
    print(f" Server running on http://0.0.0.0:{port}")
    print(f" PostgreSQL Config: {settings.POSTGRES_USER}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
    print(f"============================================================")
    server.serve_forever()

if __name__ == "__main__":
    port = settings.PORT
    is_cloud_env = (
        bool(os.getenv("PORT"))
        or bool(os.getenv("WASMER_APP_ID"))
        or bool(os.getenv("WASMER_APP_URL"))
        or (sys.platform in ("wasi", "wasix"))
        or os.path.exists("/opt/venv")
        or os.path.exists("/app")
    )
    if not is_cloud_env:
        try:
            import socket
            _probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            _probe.settimeout(1)
            if _probe.connect_ex(("127.0.0.1", port)) == 0:
                print(f"[Notice] A backend is already running on port {port}. Not starting a duplicate instance.")
                _probe.close()
                sys.exit(0)
            _probe.close()
        except Exception:
            pass
    try:
        import uvicorn
        import fastapi

        # Auto-reload is a DEVELOPMENT feature. Enabling it unconditionally meant
        # production also ran a file-watching reloader: double the memory, and
        # SIGTERM is not forwarded cleanly to the worker, so in-flight requests
        # and the lifespan shutdown hooks get killed. It is now opt-in.
        reload_enabled = os.getenv("NTIC_DEV_RELOAD", "").strip().lower() in ("1", "true", "yes")

        import importlib.util
        has_ws = bool(importlib.util.find_spec("websockets") or importlib.util.find_spec("wsproto"))
        if not has_ws:
            print(
                "[Warning] No WebSocket library installed, so /api/ws will return 404 "
                "and real-time sync will not work.\n"
                "          Fix with:  pip install 'uvicorn[standard]'"
            )

        mode = "development (auto-reload ON)" if reload_enabled else "production (auto-reload off)"
        print(f"[FastAPI] Starting NTIC Platform Backend on http://0.0.0.0:{port} - {mode}...", flush=True)
        if not reload_enabled:
            print("          Set NTIC_DEV_RELOAD=true for auto-reload while developing.", flush=True)
        app_target = "main:app" if Path(__file__).resolve().parent.parent.joinpath("main.py").exists() else "app.main:app"
        uvicorn.run(app_target, host="0.0.0.0", port=port, reload=reload_enabled)
    except Exception as err:
        print(f"[Notice] uvicorn/fastapi import failed ({err}). Starting standalone Python PostgreSQL HTTP server...")
        run_standalone_server(port)
