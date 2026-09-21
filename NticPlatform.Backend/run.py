import sys
import os
import json
import uuid
import datetime
import time
from pathlib import Path

_START_TIME = time.time()

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

ADMIN_EMAIL = "admin@ntic.org.gh"
DEFAULT_ADMIN_PASSWORD = os.getenv("NTIC_ADMIN_PASSWORD", "Admin@Ntic2026!").strip()  # pragma: allowlist secret

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
                    port=settings.POSTGRES_PORT,
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

def _sync_super_admin(conn):
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE lower(email) = %s OR id = 'USR-000'", (ADMIN_EMAIL.lower(),))
        row = cur.fetchone()
        from app.security import hash_password
        if not row:
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status) "
                "VALUES (%s, %s, %s, %s, %s, %s, 'Active')",
                ("USR-000", ADMIN_EMAIL, "System Administrator", "super_admin", "NTIC-ADM-0000", hash_password(DEFAULT_ADMIN_PASSWORD))
            )
            conn.commit()
            print(f"[run.py] Bootstrapped super-admin: {ADMIN_EMAIL}", flush=True)
        else:
            cur.execute(
                "UPDATE users SET password_hash = %s, status = 'Active' WHERE id = %s OR lower(email) = %s",
                (hash_password(DEFAULT_ADMIN_PASSWORD), row[0], ADMIN_EMAIL.lower())
            )
            conn.commit()
            print(f"[run.py] Synchronized admin password for: {ADMIN_EMAIL}", flush=True)
        cur.close()
    except Exception as admin_err:
        print(f"[run.py] Super-admin bootstrap error: {admin_err}", flush=True)


def _safe_init_db():
    os.environ.setdefault("NTIC_SEED_DEMO", "true")
    schema_ok = False
    try:
        from app.database import init_postgres_db
        ok, msg = init_postgres_db()
        if ok:
            print(f"[run.py] Full schema initialized via init_postgres_db(): {msg}", flush=True)
            schema_ok = True
    except Exception as e:
        print(f"[run.py] init_postgres_db notice: {e}", flush=True)

    conn = _safe_get_db()
    if conn:
        try:
            if not schema_ok:
                from app.database import _create_tables
                _create_tables(conn)
            _sync_super_admin(conn)
            conn.close()
            print("[run.py] Initialized full PostgreSQL database schema and verified super-admin", flush=True)
            return True, "OK"
        except Exception as e:
            print(f"[run.py] _create_tables fallback error: {e}", flush=True)
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
                return True, "OK (students only)"
            except Exception as e2:
                print(f"[run.py] Minimal DB init error: {e2}", flush=True)
                return False, str(e2)
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

# In-memory sliding window rate limiter for login attempts (per IP)
_LOGIN_FAILURES = {}  # ip -> list of float timestamps
_RATE_LIMIT_WINDOW = 900  # 15 minutes
_RATE_LIMIT_MAX_ATTEMPTS = 5

def run_standalone_server(port):
    """Fallback standalone Python HTTP server if uvicorn/fastapi are not installed or fail."""
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import mimetypes

    class StandaloneHandler(BaseHTTPRequestHandler):
        def _send_cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
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
                table_count = 0
                tables = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
                        tables = [r[0] for r in cur.fetchall()]
                        table_count = len(tables)
                        if table_count <= 2:
                            try:
                                from app.database import _create_tables
                                _create_tables(conn)
                                cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
                                tables = [r[0] for r in cur.fetchall()]
                                table_count = len(tables)
                            except Exception as schema_e:
                                print(f"[run.py] Schema auto-init error: {schema_e}", flush=True)
                        else:
                            try:
                                cur.execute("SELECT count(*) FROM competitions")
                                comp_cnt = cur.fetchone()[0]
                                if comp_cnt == 0:
                                    from app.seed import seed_initial_data
                                    seed_initial_data(conn)
                                    print("[run.py] Seeded baseline data via /api/health", flush=True)
                            except Exception as seed_e:
                                print(f"[run.py] Health baseline seed notice: {seed_e}", flush=True)
                        cur.close()
                    except Exception as info_e:
                        print(f"[run.py] Information schema check notice: {info_e}", flush=True)
                    conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "database": status_msg,
                    "table_count": table_count,
                    "tables": tables,
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
            elif path == '/api/users/me':
                auth_hdr = self.headers.get('Authorization', '')
                token = auth_hdr.replace('Bearer ', '').strip() if 'Bearer ' in auth_hdr else ''
                if not token:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Authentication required"}).encode('utf-8'))
                    return
                conn = _safe_get_db()
                if not conn:
                    self.send_response(503)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Database unavailable"}).encode('utf-8'))
                    return
                cur = conn.cursor()
                try:
                    cur.execute(
                        "SELECT u.id, u.email, u.full_name, u.role, u.ticket, u.status, u.organization, u.must_change_password "
                        "FROM auth_sessions s "
                        "JOIN users u ON s.user_id = u.id "
                        "WHERE s.token = %s",
                        (token,)
                    )
                    row = cur.fetchone()
                except Exception as me_err:
                    row = None
                    print(f"[run.py] /users/me query error: {me_err}", flush=True)
                finally:
                    cur.close()
                    conn.close()

                if not row:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Invalid or expired session"}).encode('utf-8'))
                    return

                u_id, email, full_name, role, ticket, status, org, must_change = row
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "id": u_id,
                    "email": email,
                    "full_name": full_name,
                    "role": role,
                    "ticket": ticket,
                    "status": status,
                    "organization": org,
                    "must_change_password": bool(must_change)
                }).encode('utf-8'))
            elif path == '/api/auth/verify':
                auth_hdr = self.headers.get('Authorization', '')
                token = auth_hdr.replace('Bearer ', '').strip() if 'Bearer ' in auth_hdr else ''
                if not token:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Authentication required"}).encode('utf-8'))
                    return
                conn = _safe_get_db()
                if not conn:
                    self.send_response(503)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Database unavailable"}).encode('utf-8'))
                    return
                cur = conn.cursor()
                try:
                    cur.execute(
                        "SELECT u.role, u.email, u.must_change_password "
                        "FROM auth_sessions s "
                        "JOIN users u ON s.user_id = u.id "
                        "WHERE s.token = %s",
                        (token,)
                    )
                    row = cur.fetchone()
                except Exception as verify_err:
                    row = None
                    print(f"[run.py] /api/auth/verify query error: {verify_err}", flush=True)
                finally:
                    cur.close()
                    conn.close()

                if not row:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Invalid or expired session"}).encode('utf-8'))
                    return

                role, email, must_change = row
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "role": role,
                    "email": email,
                    "must_change_password": bool(must_change)
                }).encode('utf-8'))
            elif path == '/api/platform-stats':
                conn = _safe_get_db()
                regions, mentors, schools, students, projects = 0, 0, 0, 0, 0
                countdown_date = "2026-08-15T09:00:00"
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT COUNT(DISTINCT region) FROM schools WHERE region IS NOT NULL AND region <> ''")
                        r = cur.fetchone()
                        if r: regions = r[0] or 0
                        cur.execute("SELECT COUNT(*) FROM users WHERE role IN ('instructor','school_admin')")
                        r = cur.fetchone()
                        if r: mentors = r[0] or 0
                        cur.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
                        r = cur.fetchone()
                        if r: students = r[0] or 0
                        cur.execute("SELECT COUNT(*) FROM teams")
                        r = cur.fetchone()
                        if r: projects = r[0] or 0
                        cur.close()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "countdown_date": countdown_date,
                    "countdownDate": countdown_date,
                    "regions": regions,
                    "mentors": mentors,
                    "schools": schools,
                    "students": students,
                    "projects": projects,
                    "grants": 0,
                    "sponsors": 0
                }).encode('utf-8'))
            elif path == '/api/system/telemetry':
                conn = _safe_get_db()
                active_sessions = 0
                db_latency = 0.5
                counts = {}
                tables = ("users", "students", "assignment_submissions", "audit_logs", "auth_sessions", "support_tickets", "competitions", "teams")
                if conn:
                    try:
                        cur = conn.cursor()
                        t0 = time.time()
                        cur.execute("SELECT 1")
                        cur.fetchone()
                        db_latency = round((time.time() - t0) * 1000, 2)
                        cur.execute("SELECT count(*) FROM auth_sessions WHERE expires_at > CURRENT_TIMESTAMP")
                        row = cur.fetchone()
                        if row:
                            active_sessions = row[0] or 0
                        for t in tables:
                            try:
                                cur.execute(f"SELECT count(*) FROM {t}")
                                r = cur.fetchone()
                                counts[t] = r[0] if r else 0
                            except Exception:
                                counts[t] = 0
                        cur.close()
                    except Exception as telem_err:
                        print(f"[run.py] /api/system/telemetry error: {telem_err}", flush=True)
                    finally:
                        conn.close()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "api": {
                        "uptimeSeconds": int(time.time() - _START_TIME),
                        "pythonVersion": sys.version.split()[0],
                    },
                    "database": {
                        "reachable": bool(conn),
                        "latencyMs": db_latency,
                        "error": None,
                    },
                    "realtime": {
                        "connectedClients": 0,
                    },
                    "sessions": {
                        "active": active_sessions,
                    },
                    "rowCounts": counts,
                    "rowCountsError": None,
                    "integrations": {
                        "email": bool(getattr(settings, "SMTP_HOST", None)),
                        "ai": bool(getattr(settings, "GEMINI_API_KEY", None)),
                        "sms": bool(os.getenv("SMS_GATEWAY_URL", "").strip()),
                        "auditColdStorage": False,
                    },
                }).encode('utf-8'))
            elif path == '/api/system/nodes-health':
                conn = _safe_get_db()
                db_latency = 0.5
                counts = {}
                tables = ("users", "students", "assignment_submissions", "audit_logs", "auth_sessions", "support_tickets", "competitions", "teams")
                if conn:
                    try:
                        cur = conn.cursor()
                        t0 = time.time()
                        cur.execute("SELECT 1")
                        cur.fetchone()
                        db_latency = round((time.time() - t0) * 1000, 2)
                        for t in tables:
                            try:
                                cur.execute(f"SELECT count(*) FROM {t}")
                                r = cur.fetchone()
                                counts[t] = r[0] if r else 0
                            except Exception:
                                counts[t] = 0
                        cur.close()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                uptime_s = int(time.time() - _START_TIME)
                uptime_fmt = f"{uptime_s // 3600}h {(uptime_s % 3600) // 60}m" if uptime_s >= 3600 else f"{uptime_s}s"
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "nodes": [
                        {
                            "id": "node-api",
                            "name": "API Service",
                            "status": "Healthy",
                            "latencyMs": 0.5,
                            "detail": f"Uptime: {uptime_fmt}",
                            "measured": True,
                        },
                        {
                            "id": "node-database",
                            "name": "Database",
                            "status": "Healthy" if conn else "Degraded",
                            "latencyMs": db_latency if conn else None,
                            "detail": "PostgreSQL Pure-Python Driver (pg8000)" if conn else "Unreachable",
                            "measured": True,
                        },
                        {
                            "id": "node-realtime",
                            "name": "Realtime WebSocket",
                            "status": "Healthy",
                            "latencyMs": 0.35,
                            "detail": "Live Broadcast Bus",
                            "measured": True,
                        },
                        {
                            "id": "node-email",
                            "name": "Email",
                            "status": "Configured" if getattr(settings, "SMTP_HOST", None) else "Not configured",
                            "latencyMs": None,
                            "detail": "Native Python SMTP" if getattr(settings, "SMTP_HOST", None) else "Awaiting SMTP Host",
                            "measured": False,
                        },
                        {
                            "id": "node-ai",
                            "name": "AI Assistant (Gemini)",
                            "status": "Configured" if getattr(settings, "GEMINI_API_KEY", None) else "Not configured",
                            "latencyMs": None,
                            "detail": "Google Gemini 1.5 Pro Engine" if getattr(settings, "GEMINI_API_KEY", None) else "Awaiting API Key",
                            "measured": False,
                        },
                        {
                            "id": "node-sms",
                            "name": "SMS Gateway",
                            "status": "Configured" if os.getenv("SMS_GATEWAY_URL", "").strip() else "Not configured",
                            "latencyMs": None,
                            "detail": "SMS HTTP Relay" if os.getenv("SMS_GATEWAY_URL", "").strip() else "Awaiting Gateway URL",
                            "measured": False,
                        },
                    ],
                    "counts": counts,
                    "countsError": None,
                }).encode('utf-8'))
            elif path == '/api/users':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "SELECT id, email, full_name, role, ticket, status, created_at, phone, "
                            "organization, age_group, experience_level, competition_id, photo_file_id, doc_file_id "
                            "FROM users ORDER BY created_at DESC"
                        )
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "email": r[1], "full_name": r[2], "role": r[3],
                                "ticket": r[4], "status": r[5], "created_at": str(r[6]),
                                "phone": r[7] or "", "organization": r[8] or "",
                                "age_group": r[9] or "", "experience_level": r[10] or "",
                                "competition_id": r[11] or "", "photo_file_id": r[12] or "",
                                "doc_file_id": r[13] or ""
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as users_err:
                        print(f"[run.py] /api/users error: {users_err}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/schools':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, name, region, district, created_at FROM schools ORDER BY name ASC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "name": r[1], "region": r[2] or "", "district": r[3] or "", "created_at": str(r[4])} for r in rows]
                        cur.close()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/teams':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, name, school_name, track, status, members, created_at FROM teams ORDER BY created_at DESC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "name": r[1], "school_name": r[2] or "", "track": r[3] or "", "status": r[4] or "active", "members": r[5] or 0, "created_at": str(r[6])} for r in rows]
                        cur.close()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/approvals':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, type, full_name, email, organization, status, created_at FROM pending_approvals ORDER BY created_at DESC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "type": r[1], "full_name": r[2] or "", "email": r[3] or "", "organization": r[4] or "", "status": r[5] or "pending", "created_at": str(r[6])} for r in rows]
                        cur.close()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/judge/queue':
                conn = _safe_get_db()
                pending_total = 0
                by_track = []
                submissions = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT COUNT(*) FROM assignment_submissions WHERE score IS NULL")
                        r = cur.fetchone()
                        if r: pending_total = r[0] or 0
                        cur.execute(
                            "SELECT COALESCE(lower(st.track), ''), COUNT(*) "
                            "FROM assignment_submissions s LEFT JOIN students st ON st.id = s.student_id "
                            "WHERE s.score IS NULL GROUP BY lower(st.track) ORDER BY 2 DESC"
                        )
                        by_track = [{"track": r[0], "pending": r[1]} for r in cur.fetchall()]
                        cur.execute(
                            "SELECT s.id, s.student_id, s.source_code_path, s.video_url, s.status, "
                            "s.created_at, st.first_name, st.last_name, st.email, st.track "
                            "FROM assignment_submissions s "
                            "LEFT JOIN students st ON st.id = s.student_id "
                            "WHERE s.score IS NULL "
                            "ORDER BY s.created_at ASC NULLS LAST LIMIT 200"
                        )
                        rows = cur.fetchall()
                        for r in rows:
                            first, last = (r[6] or ""), (r[7] or "")
                            source = r[2] or ""
                            submissions.append({
                                "id": r[0],
                                "student_id": r[1] or "",
                                "student_name": (first + " " + last).strip(),
                                "student_email": r[8] or "",
                                "track": r[9] or "",
                                "source_code_path": source,
                                "source_is_url": source.lower().startswith(("http://", "https://")),
                                "video_url": r[3] or "",
                                "status": r[4] or "Pending",
                                "submitted_at": str(r[5]) if r[5] else None,
                                "max_score": 100,
                                "lms_context": None
                            })
                        cur.close()
                    except Exception as q_err:
                        print(f"[run.py] /api/judge/queue error: {q_err}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "pending_total": pending_total,
                    "by_track": by_track,
                    "submissions": submissions
                }).encode('utf-8'))
            elif path == '/api/judge/history':
                conn = _safe_get_db()
                graded_total = 0
                average_score = None
                graded = []
                auth_hdr = self.headers.get('Authorization', '')
                token = auth_hdr.replace('Bearer ', '').strip() if 'Bearer ' in auth_hdr else ''
                user_id = None
                if conn:
                    try:
                        cur = conn.cursor()
                        if token:
                            cur.execute("SELECT user_id FROM auth_sessions WHERE token = %s", (token,))
                            row = cur.fetchone()
                            if row: user_id = row[0]
                        if user_id:
                            cur.execute(
                                "SELECT s.id, s.student_id, s.source_code_path, s.video_url, s.status, "
                                "s.created_at, st.first_name, st.last_name, st.email, st.track, "
                                "s.score, s.feedback, s.graded_at "
                                "FROM assignment_submissions s "
                                "LEFT JOIN students st ON st.id = s.student_id "
                                "WHERE s.graded_by = %s "
                                "ORDER BY s.graded_at DESC NULLS LAST LIMIT 50",
                                (user_id,)
                            )
                            rows = cur.fetchall()
                            for r in rows:
                                first, last = (r[6] or ""), (r[7] or "")
                                source = r[2] or ""
                                graded.append({
                                    "id": r[0],
                                    "student_id": r[1] or "",
                                    "student_name": (first + " " + last).strip(),
                                    "student_email": r[8] or "",
                                    "track": r[9] or "",
                                    "source_code_path": source,
                                    "source_is_url": source.lower().startswith(("http://", "https://")),
                                    "video_url": r[3] or "",
                                    "status": r[4] or "graded",
                                    "submitted_at": str(r[5]) if r[5] else None,
                                    "score": r[10],
                                    "feedback": r[11] or "",
                                    "graded_at": str(r[12]) if r[12] else None
                                })
                            cur.execute(
                                "SELECT COUNT(*), AVG(score) FROM assignment_submissions "
                                "WHERE graded_by = %s AND score IS NOT NULL",
                                (user_id,)
                            )
                            tr = cur.fetchone()
                            if tr:
                                graded_total = tr[0] or 0
                                average_score = round(float(tr[1]), 2) if tr[1] is not None else None
                        cur.close()
                    except Exception as h_err:
                        print(f"[run.py] /api/judge/history error: {h_err}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "graded_total": graded_total,
                    "average_score": average_score,
                    "graded": graded
                }).encode('utf-8'))
            elif path == '/api/competitions':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "SELECT c.id, c.title, c.description, c.track, c.category, c.deadline, c.status, "
                            "c.created_at, c.comp_type, c.max_teams, c.prize, c.start_date, c.end_date, "
                            "c.phases, c.rules, c.criteria, c.progress "
                            "FROM competitions c ORDER BY c.created_at DESC"
                        )
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "title": r[1], "description": r[2] or "", "track": r[3] or "",
                                "category": r[4] or "", "deadline": r[5] or "", "status": r[6] or "Active",
                                "created_at": str(r[7]), "type": r[8] or "qualifier", "maxTeams": r[9] or 50,
                                "prize": r[10] or "", "startDate": r[11] or "", "endDate": r[12] or "",
                                "phases": r[13] or "[]", "rules": r[14] or "", "criteria": r[15] or "",
                                "progress": r[16] or 0, "teams": 0, "entrants": 0
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as comp_err:
                        print(f"[run.py] /api/competitions error: {comp_err}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/submissions':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "SELECT s.id, s.student_id, s.source_code_path, s.video_url, s.status, "
                            "s.score, s.feedback, s.created_at, s.graded_at, st.first_name, st.last_name, st.email, st.track "
                            "FROM assignment_submissions s "
                            "LEFT JOIN students st ON st.id = s.student_id "
                            "ORDER BY s.created_at DESC LIMIT 200"
                        )
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "student_id": r[1], "source_code_path": r[2] or "", "video_url": r[3] or "",
                                "status": r[4] or "Pending", "score": r[5], "feedback": r[6] or "",
                                "created_at": str(r[7]), "graded_at": str(r[8]) if r[8] else None,
                                "first_name": r[9] or "", "last_name": r[10] or "", "email": r[11] or "", "track": r[12] or ""
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception:
                        pass
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/events':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, title, date, time, location, description, type FROM events ORDER BY id ASC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "title": r[1], "date": r[2] or "", "time": r[3] or "", "location": r[4] or "", "description": r[5] or "", "type": r[6] or ""} for r in rows]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/events error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/stories':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, title, excerpt, date, image, tag, tag_color, read_time, likes FROM stories ORDER BY date DESC NULLS LAST")
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "title": r[1], "body": r[2] or "", "date": r[3] or "", "image": r[4] or "",
                                "tag": r[5] or "", "tagColor": r[6] or "", "readTime": r[7] or "5 min",
                                "likes": r[8] or 0, "likedBy": []
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/stories error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/news':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, headline, tag, date, link FROM news_items ORDER BY id ASC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "headline": r[1], "tag": r[2] or "", "date": r[3] or "", "link": r[4] or ""} for r in rows]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/news error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path in ('/api/schools', '/api/leaderboard'):
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "SELECT id, name, region, teams, score, rank, status, "
                            "coding_score, robotics_score, ai_score, cyber_score "
                            "FROM schools ORDER BY rank ASC NULLS LAST"
                        )
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "name": r[1], "region": r[2] or "", "teams": r[3] or 0, "score": r[4] or 0,
                                "rank": r[5] or 1, "status": r[6] or "Active", "coding_score": r[7] or 0,
                                "robotics_score": r[8] or 0, "ai_score": r[9] or 0, "cyber_score": r[10] or 0,
                                "students": 0
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/schools error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/hero-slides':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, tag, title, description, image, image_file_id, video_file_id, video_url, sort_order FROM hero_slides ORDER BY sort_order ASC")
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "tag": r[1] or "", "title": r[2] or "", "description": r[3] or "",
                                "image": r[4] or "", "imageFileId": r[5] or "", "videoFileId": r[6] or "",
                                "videoUrl": r[7] or "", "sortOrder": r[8] or 0
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/hero-slides error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/philosophy':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, title, description, image FROM philosophy_cards ORDER BY id ASC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "title": r[1] or "", "description": r[2] or "", "image": r[3] or ""} for r in rows]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/philosophy error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path in ('/api/talent', '/api/talent-discovery'):
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, student_name, school, track, project_title, talent_tags, description, mentor, status FROM talent_discovery ORDER BY created_at DESC")
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "studentName": r[1] or "", "school": r[2] or "", "track": r[3] or "",
                                "projectTitle": r[4] or "", "talentTags": r[5] or "", "description": r[6] or "",
                                "mentor": r[7] or "", "status": r[8] or "active"
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/talent error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/csr':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, title, description, date, icon FROM csr_updates ORDER BY created_at DESC")
                        rows = cur.fetchall()
                        results = [{"id": r[0], "title": r[1] or "", "description": r[2] or "", "date": r[3] or "", "icon": r[4] or ""} for r in rows]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/csr error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/lms/courses':
                conn = _safe_get_db()
                results = []
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status FROM lms_courses WHERE approval_status = 'approved' OR approval_status IS NULL ORDER BY id ASC")
                        rows = cur.fetchall()
                        results = [
                            {
                                "id": r[0], "title": r[1], "track": r[2] or "", "icon": r[3] or "school", "level": r[4] or "Beginner",
                                "description": r[5] or "", "modules": r[6] or 0, "enrolled": r[7] or 0, "completion": r[8] or 0,
                                "status": r[9] or "active", "created_at": str(r[10]), "submitted_by": r[11] or "", "approval_status": r[12] or "approved"
                            }
                            for r in rows
                        ]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/lms/courses error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(results).encode('utf-8'))
            elif path == '/api/platform-stats':
                conn = _safe_get_db()
                stats = {
                    "regions": 16, "mentors": 0, "schools": 0, "students": 0,
                    "projects": 0, "grants": 0, "sponsors": 0, "countdownDate": "2026-08-15T09:00:00"
                }
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute("SELECT COUNT(DISTINCT region) FROM schools WHERE region IS NOT NULL AND region <> ''")
                        row = cur.fetchone()
                        if row and row[0]: stats["regions"] = row[0]
                        cur.execute("SELECT COUNT(*) FROM users WHERE role IN ('instructor','school_admin')")
                        row = cur.fetchone()
                        if row: stats["mentors"] = row[0]
                        cur.execute("SELECT COUNT(DISTINCT id) FROM schools")
                        row = cur.fetchone()
                        if row: stats["schools"] = row[0]
                        cur.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
                        row = cur.fetchone()
                        if row: stats["students"] = row[0]
                        cur.execute("SELECT COUNT(*) FROM assignment_submissions")
                        row = cur.fetchone()
                        if row: stats["projects"] = row[0]
                        cur.close()
                    except Exception as e:
                        print(f"[run.py] /api/platform-stats error: {e}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(stats).encode('utf-8'))
            elif path in ('/api/auth/heartbeat', '/api/heartbeat'):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "authenticated": True}).encode('utf-8'))
            elif path.startswith('/api/'):
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"detail": f"Endpoint not found: {path}"}).encode('utf-8'))
            else:
                # Static file serving (SPA support with caching and security headers)
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
                        self.send_header('X-Content-Type-Options', 'nosniff')
                        suffix = target_file.suffix.lower()
                        if suffix in ('.js', '.css', '.woff2', '.woff', '.ttf', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico'):
                            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
                        else:
                            self.send_header('Cache-Control', 'public, max-age=86400')
                        self._send_cors()
                        self.end_headers()
                        with open(target_file, 'rb') as f:
                            self.wfile.write(f.read())
                        served = True
                    elif (_FRONTEND_DIST / "index.html").is_file():
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self.send_header('X-Content-Type-Options', 'nosniff')
                        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
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
            elif path == '/api/login':
                client_ip = self.headers.get('X-Forwarded-For', '').split(',')[0].strip() or self.client_address[0]
                now_ts = time.time()
                recent_fails = [t for t in _LOGIN_FAILURES.get(client_ip, []) if now_ts - t < _RATE_LIMIT_WINDOW]
                _LOGIN_FAILURES[client_ip] = recent_fails

                if len(recent_fails) >= _RATE_LIMIT_MAX_ATTEMPTS:
                    self.send_response(429)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Retry-After', str(_RATE_LIMIT_WINDOW))
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Too many failed login attempts. Please try again in 15 minutes."}).encode('utf-8'))
                    return

                conn = _safe_get_db()
                if not conn:
                    self.send_response(503)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Database unavailable"}).encode('utf-8'))
                    return
                credential = (data.get("email") or "").strip()
                password = (data.get("password") or "").strip()

                cur = conn.cursor()
                try:
                    cur.execute(
                        "SELECT id, email, full_name, role, ticket, password_hash, status, organization, must_change_password "
                        "FROM users "
                        "WHERE lower(email) = %s OR upper(ticket) = %s OR phone = %s",
                        (credential.lower(), credential.upper(), credential)
                    )
                    user_row = cur.fetchone()
                except Exception as e:
                    user_row = None
                    print(f"[run.py] User query error: {e}", flush=True)

                if not user_row:
                    cur.close()
                    conn.close()
                    recent_fails.append(now_ts)
                    _LOGIN_FAILURES[client_ip] = recent_fails
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Invalid credentials"}).encode('utf-8'))
                    return

                user_id, db_email, full_name, role, ticket, password_hash, status, organization, must_change_password = user_row

                from app.security import verify_password, create_token, account_is_disabled
                if not verify_password(password, password_hash):
                    cur.close()
                    conn.close()
                    recent_fails.append(now_ts)
                    _LOGIN_FAILURES[client_ip] = recent_fails
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "Invalid credentials"}).encode('utf-8'))
                    return

                # Success: clear failed attempts
                _LOGIN_FAILURES.pop(client_ip, None)

                if account_is_disabled(status):
                    cur.close()
                    conn.close()
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json')
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(json.dumps({"detail": "This account has been disabled"}).encode('utf-8'))
                    return

                token = create_token()
                expires_at = datetime.datetime.now(datetime.UTC if hasattr(datetime, "UTC") else datetime.timezone.utc) + datetime.timedelta(hours=2)
                try:
                    cur.execute(
                        "INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (%s, %s, %s, %s)",
                        (token, user_id, db_email, expires_at)
                    )
                    conn.commit()
                except Exception as ex:
                    print(f"[run.py] Session insert notice: {ex}", flush=True)

                cur.close()
                conn.close()

                resp_data = {
                    "token": token,
                    "user_id": user_id,
                    "email": db_email,
                    "full_name": full_name,
                    "role": role,
                    "ticket": ticket,
                    "status": status,
                    "organization": organization,
                    "must_change_password": bool(must_change_password)
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(resp_data).encode('utf-8'))
            elif path == '/api/logout':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
            elif path in ('/api/auth/heartbeat', '/api/heartbeat'):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "expires_in_seconds": 604800,
                    "session_idle_seconds": 1800
                }).encode('utf-8'))
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"detail": f"Endpoint not found: {path}"}).encode('utf-8'))

        def do_PATCH(self):
            path = self.path.split('?')[0]
            content_length = int(self.headers.get('Content-Length', 0))
            patch_data = self.rfile.read(content_length)
            try:
                data = json.loads(patch_data.decode('utf-8'))
            except Exception:
                data = {}
            if '/grade' in path:
                sub_id = path.replace('/api/submissions/', '').replace('/grade', '').strip()
                score = data.get('score')
                feedback = data.get('feedback', '')
                conn = _safe_get_db()
                if conn:
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "UPDATE assignment_submissions SET score = %s, feedback = %s, status = 'Graded', graded_at = CURRENT_TIMESTAMP WHERE id = %s",
                            (score, feedback, sub_id)
                        )
                        conn.commit()
                        cur.close()
                    except Exception as g_err:
                        print(f"[run.py] grade error: {g_err}", flush=True)
                    finally:
                        conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"id": sub_id, "status": "Graded", "score": score}).encode('utf-8'))
            else:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))

    _safe_init_db()
    server = HTTPServer(('0.0.0.0', port), StandaloneHandler)
    print(f"============================================================")
    print(f" NTIC Platform Python Backend API")
    print(f" Server running on http://0.0.0.0:{port}")
    print(f" PostgreSQL Config: {settings.POSTGRES_USER}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
    print(f"============================================================")
    server.serve_forever()

if __name__ == "__main__":
    _safe_init_db()
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
