import hashlib
import logging
import os
import secrets
import time
from collections import defaultdict
from fastapi import HTTPException, status, Request

_ITERATIONS = 600_000

# ── Session lifetime ────────────────────────────────────────────────────
# Sessions expire on INACTIVITY, not on a fixed schedule. `expires_at` is
# always "last activity + SESSION_IDLE_MINUTES", pushed forward by
# touch_session() whenever the user actually does something, and hard-capped
# at "created_at + SESSION_ABSOLUTE_DAYS" so a session can never live forever.
#
# Important: the extension is driven by an explicit heartbeat from the client,
# NOT by every authenticated request. The frontend polls in the background
# (ContentService runs a 5-minute safety-net sync), and sliding the expiry on
# those requests would keep an abandoned tab signed in indefinitely.
SESSION_IDLE_MINUTES = max(1, int(os.getenv("SESSION_IDLE_MINUTES", "30") or "30"))
SESSION_ABSOLUTE_DAYS = max(1, int(os.getenv("SESSION_ABSOLUTE_DAYS", "7") or "7"))

# ── Role model: single source of truth ─────────────────────────────
# Every role string used anywhere in the backend must appear in ALL_ROLES.
# The groups below are the ONLY thing endpoints should reference — never
# inline role-name literals at a call site.
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_SUPPORT_ADMIN = "support_admin"
ROLE_CONTENT_MANAGER = "content_manager"
ROLE_COMPETITION_MANAGER = "competition_manager"
ROLE_REVIEWER = "reviewer"
ROLE_JUDGE = "judge"
ROLE_INSTRUCTOR = "instructor"
ROLE_SCHOOL_ADMIN = "school_admin"
ROLE_SPONSOR = "sponsor"
ROLE_STUDENT = "student"
ROLE_MENTOR = "mentor"

ALL_ROLES = frozenset({
    ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SUPPORT_ADMIN, ROLE_CONTENT_MANAGER,
    ROLE_COMPETITION_MANAGER, ROLE_REVIEWER, ROLE_JUDGE, ROLE_INSTRUCTOR,
    ROLE_SCHOOL_ADMIN, ROLE_SPONSOR, ROLE_STUDENT, ROLE_MENTOR,
})

# Governance & administrative personnel
GOVERNANCE_ROLES = frozenset({
    ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SUPPORT_ADMIN, ROLE_CONTENT_MANAGER,
    ROLE_COMPETITION_MANAGER, ROLE_REVIEWER, ROLE_SCHOOL_ADMIN,
})

# Full platform administration.
ADMIN_ROLES = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN})
# May edit public site content (news, hero slides, stories, philosophy, HOF...).
CONTENT_ROLES = ADMIN_ROLES | {ROLE_CONTENT_MANAGER}
# May create/edit competitions, teams, events and schools.
COMPETITION_ROLES = ADMIN_ROLES | {ROLE_COMPETITION_MANAGER}
# May score submissions.
GRADING_ROLES = ADMIN_ROLES | {ROLE_JUDGE, ROLE_REVIEWER, ROLE_INSTRUCTOR}
# May approve or reject pending registrations.
APPROVAL_ROLES = ADMIN_ROLES | {ROLE_REVIEWER, ROLE_COMPETITION_MANAGER}
# May manage student records.
STUDENT_ADMIN_ROLES = ADMIN_ROLES | {ROLE_SCHOOL_ADMIN, ROLE_INSTRUCTOR}
# May administer support tickets.
SUPPORT_ROLES = ADMIN_ROLES | {ROLE_SUPPORT_ADMIN}
# May create and manage LMS courses and materials.
LMS_ROLES = ADMIN_ROLES | {ROLE_INSTRUCTOR, ROLE_CONTENT_MANAGER}

# Account statuses that must be denied access. Deny-list rather than
# requiring "Active" so that unexpected legacy values do not lock users out.
DISABLED_STATUSES = frozenset({
    "suspended", "inactive", "disabled", "revoked", "banned", "deleted",
    "rejected", "locked",
    # Public sign-ups are created 'pending' and must be activated by a reviewer.
    # Without this entry a self-registered judge/sponsor/student could log in
    # before any review took place, defeating the review gate entirely.
    "pending",
})


# ── Sliding-window rate limiting ───────────────────────────────────
# State lives in PostgreSQL so that it is shared by every replica. The old
# implementation used a process-local dict, which meant:
#   * with N replicas the effective limit was N times the intended one;
#   * every deploy reset all counters;
#   * a spoofed X-Forwarded-For could grow the dict without bound.
#
# The in-memory map below is only a fallback for when the database is
# unreachable, so a database outage cannot remove rate limiting entirely.
_RATE_LIMITS = defaultdict(list)

# Set to False to force the in-process limiter (used by the test suite for speed).
USE_SHARED_RATE_LIMIT = True

logger = logging.getLogger("ntic.security")


def _raise_429(retry_after: int):
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many requests. Please wait {retry_after} seconds before retrying.",
        headers={"Retry-After": str(retry_after)},
    )


def _check_rate_limit_local(key: str, max_attempts: int, window_seconds: int):
    now = time.time()
    attempts = [t for t in _RATE_LIMITS[key] if now - t < window_seconds]
    _RATE_LIMITS[key] = attempts
    if len(attempts) >= max_attempts:
        _raise_429(int(window_seconds - (now - attempts[0])) + 1)
    _RATE_LIMITS[key].append(now)


def _check_rate_limit_shared(key: str, max_attempts: int, window_seconds: int) -> bool:
    """Count-and-record in one round trip. Returns False if the DB was unusable.

    Raises HTTPException(429) when the limit is exceeded.
    """
    from app.database import get_db_connection, release_db_connection

    conn = get_db_connection()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        # Opportunistic cleanup keeps the table small without a separate job.
        # Rows older than any window we use are useless.
        cur.execute(
            "DELETE FROM rate_limit_hits "
            "WHERE bucket = %s AND hit_at < CURRENT_TIMESTAMP - (%s * INTERVAL '1 second')",
            (key, window_seconds),
        )
        cur.execute(
            "SELECT count(*), min(hit_at) FROM rate_limit_hits "
            "WHERE bucket = %s AND hit_at > CURRENT_TIMESTAMP - (%s * INTERVAL '1 second')",
            (key, window_seconds),
        )
        used, oldest = cur.fetchone()
        if used is not None and used >= max_attempts:
            retry_after = window_seconds
            if oldest is not None:
                cur.execute(
                    "SELECT GREATEST(1, CEIL(%s - EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - %s))))",
                    (window_seconds, oldest),
                )
                retry_after = int(cur.fetchone()[0] or window_seconds)
            conn.commit()
            cur.close()
            release_db_connection(conn)
            _raise_429(retry_after)
        cur.execute("INSERT INTO rate_limit_hits (bucket) VALUES (%s)", (key,))
        conn.commit()
        cur.close()
        return True
    except HTTPException:
        raise
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.warning(f"Shared rate limit unavailable, falling back to in-process: {e}")
        return False
    finally:
        release_db_connection(conn)


def check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 60):
    """Enforce a rate limit per IP or identifier. Raises HTTP 429 if exceeded."""
    if os.getenv("DISABLE_RATE_LIMITS", "").strip().lower() in ("1", "true", "yes"):
        return

    # In local development mode (NTIC_DEV_RELOAD / NTIC_DEV_MODE), extend limits by 100x
    # so developers testing OTPs/forms locally are not blocked by 429 throttling.
    if (
        os.getenv("NTIC_DEV_RELOAD", "").strip().lower() in ("1", "true", "yes")
        or os.getenv("NTIC_DEV_MODE", "").strip().lower() in ("1", "true", "yes")
        or os.getenv("ENVIRONMENT", "").strip().lower() in ("dev", "development", "local")
    ):
        multiplier = int(os.getenv("DEV_RATE_LIMIT_MULTIPLIER", "100") or "100")
        max_attempts = max_attempts * multiplier

    if USE_SHARED_RATE_LIMIT:
        if _check_rate_limit_shared(key, max_attempts, window_seconds):
            return
    _check_rate_limit_local(key, max_attempts, window_seconds)


def reset_rate_limit(key: str):
    """Clear a counter after a successful action (e.g. a valid login)."""
    _RATE_LIMITS.pop(key, None)
    if not USE_SHARED_RATE_LIMIT:
        return
    from app.database import get_db_connection, release_db_connection

    conn = get_db_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM rate_limit_hits WHERE bucket = %s", (key,))
        conn.commit()
        cur.close()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.warning(f"Could not clear the shared rate limit for {key}: {e}")
    finally:
        release_db_connection(conn)


def clear_all_rate_limits():
    """Wipe every counter. Intended for tests and local development only."""
    _RATE_LIMITS.clear()
    from app.database import get_db_connection, release_db_connection

    conn = get_db_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM rate_limit_hits")
        conn.commit()
        cur.close()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        release_db_connection(conn)


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


def account_is_disabled(status: str | None) -> bool:
    """True when an account's status means it must be denied access."""
    return (status or "").strip().lower() in DISABLED_STATUSES


# ── Password policy ────────────────────────────────────────────────
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 200

# Passwords that are common enough to be tried first in any attack. Kept short
# and obvious deliberately; this is a floor, not a substitute for a real
# breached-password list.
_FORBIDDEN_PASSWORDS = frozenset({
    "password", "password1", "password123", "passw0rd", "p@ssword",
    "changeme", "changeme123", "letmein", "welcome", "welcome1",
    "qwerty", "qwerty123", "iloveyou", "abc123", "111111", "123456",
    "1234567", "12345678", "123456789", "1234567890", "admin", "admin123",
    "administrator", "root", "ntic", "ntic123", "ntic2026",
    # The old hardcoded bootstrap password, blocked so it can never be chosen again.
    "admin@ntic2026!",  # pragma: allowlist secret
    "test", "test123", "secret", "default",
})


def validate_password_strength(password: str, email: str = "", full_name: str = "") -> str | None:
    """Return an error message, or None when the password is acceptable.

    Deliberately favours length over character-class rules: a long passphrase is
    stronger than a short password with a symbol bolted on.
    """
    if not isinstance(password, str):
        return "Password must be text."
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be at most {MAX_PASSWORD_LENGTH} characters long."
    if password.strip() != password:
        return "Password must not start or end with a space."

    lowered = password.lower()
    if lowered in _FORBIDDEN_PASSWORDS:
        return "That password is too common. Please choose something harder to guess."
    if lowered.isdigit():
        return "Password must not be only numbers."
    if len(set(lowered)) < 5:
        return "Password must use at least 5 different characters."

    local_part = (email or "").split("@")[0].strip().lower()
    if local_part and len(local_part) >= 4 and local_part in lowered:
        return "Password must not contain your email address."
    for word in (full_name or "").lower().split():
        if len(word) >= 4 and word in lowered:
            return "Password must not contain your name."
    return None


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

    if account_is_disabled(row[4]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been disabled")

    return {"id": row[0], "email": row[1], "full_name": row[2], "role": row[3], "status": row[4]}


def require_admin(request: Request):
    user = require_auth(request)
    if user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_role(*allowed_roles):
    """Build a FastAPI dependency that allows only the given roles.

    Accepts individual role names and/or role groups:
        Depends(require_role(GRADING_ROLES))
        Depends(require_role(ADMIN_ROLES, ROLE_SUPPORT_ADMIN))
    """
    allowed: set[str] = set()
    for entry in allowed_roles:
        if isinstance(entry, str):
            allowed.add(entry)
        else:
            allowed.update(entry)

    unknown = allowed - ALL_ROLES
    if unknown:
        # Fail at import time rather than silently denying everyone at runtime.
        raise ValueError(f"require_role() got unknown role(s): {sorted(unknown)}")

    def _dependency(request: Request):
        user = require_auth(request)
        if user["role"] not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    _dependency.__name__ = f"require_role_{'_'.join(sorted(allowed))}"[:60]
    return _dependency


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
    if account_is_disabled(row[4]):
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


def touch_session(token: str) -> int | None:
    """Slide a live session's idle deadline forward.

    Returns the number of seconds the session has left, or None if the token is
    unknown or already expired (the caller should treat that as a 401).

    The new deadline is `min(now + idle window, created_at + absolute cap)`, so
    an active user is never signed out mid-work but a session still cannot
    outlive the absolute cap. Sessions issued before this behaviour existed had
    a flat 7-day `expires_at`; the LEAST() pulls those back onto the idle
    schedule the first time they are touched.
    """
    from app.database import get_db_connection, release_db_connection

    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE auth_sessions "
            "   SET expires_at = LEAST("
            "         CURRENT_TIMESTAMP + (%s * INTERVAL '1 minute'),"
            "         COALESCE(created_at, CURRENT_TIMESTAMP) + (%s * INTERVAL '1 day')"
            "       )"
            " WHERE token = %s"
            "   AND expires_at > CURRENT_TIMESTAMP"
            " RETURNING GREATEST(0, EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)))",
            (SESSION_IDLE_MINUTES, SESSION_ABSOLUTE_DAYS, token),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return int(row[0]) if row else None
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        release_db_connection(conn)

