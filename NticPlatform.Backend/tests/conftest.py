import os

TEST_DB = "NticPlatformDb_test"

# Isolate tests from the real database BEFORE importing the app.
os.environ["POSTGRES_DB"] = TEST_DB

# SAFETY GUARD -----------------------------------------------------------
# The connection layer prefers DATABASE_PRIVATE_URL / DATABASE_URL over the
# discrete PG* variables, so setting POSTGRES_DB above is NOT enough on its
# own. If one of those URLs is present and does not point at the test
# database, this suite would run its DELETEs, its audit-log prune and its
# admin re-seed against whatever that URL points at. Refuse to start.
for _url_key in ("DATABASE_PRIVATE_URL", "DATABASE_URL"):
    _url = os.environ.get(_url_key, "")
    if _url and TEST_DB not in _url:
        raise RuntimeError(
            f"{_url_key} is set and does not point at '{TEST_DB}'. "
            "Refusing to run the destructive test suite against a non-test "
            f"database. Unset {_url_key} or point it at {TEST_DB}."
        )

# The seeder no longer has a hardcoded fallback password, so tests must supply
# one explicitly. This value only ever exists inside the throwaway test DB.
ADMIN_PASSWORD = "test-only-admin-pw-4f3a91"
os.environ["NTIC_ADMIN_PASSWORD"] = ADMIN_PASSWORD

import pytest
import psycopg2
from fastapi.testclient import TestClient

from app.config import settings
from app.database import init_postgres_db
from app.main import app


def _drop_test_db():
    """Drop the test database so each run starts clean."""
    try:
        conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname="postgres",
        )
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        # The identifier MUST be double-quoted. Unquoted identifiers are folded
        # to lower case, so `DROP DATABASE IF EXISTS NticPlatformDb_test` targets
        # "nticplatformdb_test" -- a database that does not exist -- and reports
        # success while the real mixed-case database (created quoted in
        # database.py) survives. That silently made this suite non-hermetic.
        cur.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE);')
        cur.close()
        conn.close()
    except Exception as exc:
        # Surface the reason instead of silently proceeding against a dirty DB.
        print(f"[conftest] WARNING: could not drop {TEST_DB}: {exc}")


@pytest.fixture(scope="session", autouse=True)
def test_database():
    _drop_test_db()
    ok, err = init_postgres_db()
    assert ok, f"Test DB init failed: {err}"
    yield
    _drop_test_db()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """The whole suite shares one client IP, so the per-IP login throttle would
    otherwise start returning 429 a few tests in. Clear the in-memory counters
    before each test. Rate limiting itself is asserted explicitly where needed.
    """
    from app.security import clear_all_rate_limits
    clear_all_rate_limits()
    yield


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token(client):
    """Session-scoped: each login costs 600k PBKDF2 iterations, so logging in
    once per test would dominate the suite runtime.

    Do NOT revoke this token inside a test -- it is shared. Use
    `disposable_admin_token` for anything that logs out or revokes.
    """
    from app.security import clear_all_rate_limits
    clear_all_rate_limits()
    resp = client.post("/api/login", json={
        "email": "admin@ntic.org.gh",
        "password": ADMIN_PASSWORD,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


@pytest.fixture
def disposable_admin_token(client):
    """A fresh admin session that the test may safely revoke or log out."""
    from app.security import clear_all_rate_limits
    clear_all_rate_limits()
    resp = client.post("/api/login", json={
        "email": "admin@ntic.org.gh",
        "password": ADMIN_PASSWORD,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _make_user(client, admin_token, role: str, email: str, password: str):
    """Create a user with an arbitrary role and return a session token."""
    from app.security import clear_all_rate_limits
    resp = client.post(
        "/api/users",
        json={
            "email": email,
            "full_name": f"Test {role}",
            "role": role,
            "password": password,
            "status": "Active",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # A previous session may already have created this account.
    assert resp.status_code in (200, 201, 400, 409), resp.text
    clear_all_rate_limits()
    login = client.post("/api/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return login.json()["token"]


@pytest.fixture(scope="session")
def student_token(client, admin_token):
    """A logged-in, lowest-privilege account. Used to prove that role checks
    actually reject non-staff callers."""
    return _make_user(
        client, admin_token, "student", "rbac-student@ntic.test", "Kpando-Volta-River-71"
    )


@pytest.fixture(scope="session")
def judge_token(client, admin_token):
    return _make_user(
        client, admin_token, "judge", "rbac-judge@ntic.test", "Tamale-Harmattan-Kite-42"
    )


@pytest.fixture(scope="session")
def suspended_token(client, admin_token):
    """A token that was valid, then had its account suspended."""
    email = "rbac-suspended@ntic.test"
    token = _make_user(client, admin_token, "student", email, "Elmina-Castle-Lagoon-58")
    users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert users.status_code == 200
    user_id = next(u["id"] for u in users.json() if u["email"] == email)
    patch = client.patch(
        f"/api/users/{user_id}",
        json={
            "email": email,
            "full_name": "Test student",
            "role": "student",
            "status": "Suspended",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert patch.status_code == 200, patch.text
    return token
