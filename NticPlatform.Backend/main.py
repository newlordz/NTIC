import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
PG_PORT = os.getenv("POSTGRES_PORT", "5432")
PG_USER = os.getenv("POSTGRES_USER", "postgres")
PG_PASSWORD = os.getenv("POSTGRES_PASSWORD", "botsio212nyc")
PG_DB = os.getenv("POSTGRES_DB", "NticPlatformDb")

def get_pg_connection():
    try:
        import psycopg2
        return psycopg2.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            dbname=PG_DB
        )
    except Exception as e:
        return None, str(e)

class APIHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            conn = get_pg_connection()
            status = "connected" if not isinstance(conn, tuple) else f"error: {conn[1]}"
            if not isinstance(conn, tuple) and conn:
                conn.close()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "database": status,
                "config": {"host": PG_HOST, "port": PG_PORT, "db": PG_DB, "user": PG_USER}
            }).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self._send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    server = HTTPServer(('0.0.0.0', port), APIHandler)
    print(f"NTIC Platform Python Backend API running on http://localhost:{port}")
    print(f"PostgreSQL Configured -> Host: {PG_HOST}:{PG_PORT} | DB: {PG_DB} | User: ${PG_USER}")
    server.serve_forever()
