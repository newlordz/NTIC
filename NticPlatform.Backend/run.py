import sys
import os
import json
import uuid
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import settings
from app.database import init_postgres_db, get_db_connection

def run_standalone_server(port):
    """Fallback standalone Python HTTP server if uvicorn/fastapi are not installed."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

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
                conn = get_db_connection()
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
                    "config": {
                        "host": settings.POSTGRES_HOST,
                        "port": settings.POSTGRES_PORT,
                        "db": settings.POSTGRES_DB,
                        "user": settings.POSTGRES_USER
                    }
                }).encode('utf-8'))
            elif path == '/api/students':
                conn = get_db_connection()
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
                conn = get_db_connection()
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

    init_postgres_db()
    server = HTTPServer(('0.0.0.0', port), StandaloneHandler)
    print(f"============================================================")
    print(f" NTIC Platform Python Backend API")
    print(f" Server running on http://localhost:{port}")
    print(f" PostgreSQL Config: {settings.POSTGRES_USER}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
    print(f"============================================================")
    server.serve_forever()

if __name__ == "__main__":
    port = settings.PORT
    try:
        import uvicorn
        import fastapi
        print(f"[FastAPI] Starting NTIC Platform Backend on http://0.0.0.0:{port}...")
        uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
    except ImportError:
        print("[Notice] uvicorn/fastapi not installed in current env. Starting standalone Python PostgreSQL HTTP server...")
        run_standalone_server(port)
