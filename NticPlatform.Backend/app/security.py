import hashlib
import secrets
from fastapi import HTTPException, status, Request

_ITERATIONS = 600_000
ADMIN_ROLES = {"super_admin", "admin"}


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS)
    return f"{salt}${dk.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hex_digest = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS)
    return secrets.compare_digest(dk.hex(), hex_digest)

def create_token() -> str:
    return secrets.token_hex(32)


def require_auth(request: Request):
    from app.database import get_db_connection

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")

    token = auth_header[7:]
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unreachable")

    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT u.id, u.email, u.full_name, u.role, u.status FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = %s AND s.expires_at > CURRENT_TIMESTAMP",
            (token,),
        )
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    return {"id": row[0], "email": row[1], "full_name": row[2], "role": row[3], "status": row[4]}


def require_admin(request: Request):
    user = require_auth(request)
    if user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
