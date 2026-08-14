import hashlib
import secrets
import time
from collections import defaultdict
from fastapi import HTTPException, status, Request

_ITERATIONS = 600_000
ADMIN_ROLES = {"super_admin", "admin"}

# ── In-Memory Sliding Window Rate Limiting ────────────────────────
_RATE_LIMITS = defaultdict(list)

def check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 60):
    """Enforce rate limits per IP or identifier. Raises HTTP 429 if exceeded."""
    now = time.time()
    # Prune old timestamps
    attempts = [t for t in _RATE_LIMITS[key] if now - t < window_seconds]
    _RATE_LIMITS[key] = attempts
    if len(attempts) >= max_attempts:
        retry_after = int(window_seconds - (now - attempts[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Please wait {retry_after} seconds before retrying.",
            headers={"Retry-After": str(retry_after)}
        )
    _RATE_LIMITS[key].append(now)

def reset_rate_limit(key: str):
    """Clear rate limit counter after a successful action (e.g. valid login)."""
    _RATE_LIMITS.pop(key, None)


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
    from app.database import get_db_connection, release_db_connection

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")

    token = auth_header[7:]
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unreachable")

    row = None
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT u.id, u.email, u.full_name, u.role, u.status FROM auth_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = %s AND s.expires_at > CURRENT_TIMESTAMP",
            (token,),
        )
        row = cur.fetchone()
        cur.close()
    finally:
        release_db_connection(conn)

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    return {"id": row[0], "email": row[1], "full_name": row[2], "role": row[3], "status": row[4]}


def require_admin(request: Request):
    user = require_auth(request)
    if user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def verify_token(token: str) -> dict | None:
    """Validate a token string and return user info, or None."""
    from app.database import get_db_connection, release_db_connection
    conn = get_db_connection()
    if not conn:
        return None
    row = None
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT u.id, u.email, u.full_name, u.role, u.status "
            "FROM auth_sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.token = %s AND s.expires_at > CURRENT_TIMESTAMP",
            (token,),
        )
        row = cur.fetchone()
        cur.close()
    finally:
        release_db_connection(conn)
    if not row:
        return None
    return {"id": row[0], "email": row[1], "full_name": row[2], "role": row[3], "status": row[4]}


def invalidate_session_token(token: str) -> bool:
    """Delete a session token from auth_sessions upon logout."""
    from app.database import get_db_connection, release_db_connection
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_sessions WHERE token = %s", (token,))
        conn.commit()
        cur.close()
        return True
    except Exception:
        return False
    finally:
        release_db_connection(conn)

