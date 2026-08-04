import os

# Isolate tests from the real database BEFORE importing the app.
os.environ["POSTGRES_DB"] = "NticPlatformDb_test"

import pytest
import psycopg2
from fastapi.testclient import TestClient

from app.config import settings
from app.database import init_postgres_db
from app.main import app

TEST_DB = "NticPlatformDb_test"


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
        cur.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE);")
        cur.close()
        conn.close()
    except Exception:
        pass


@pytest.fixture(scope="session", autouse=True)
def test_database():
    _drop_test_db()
    ok, err = init_postgres_db()
    assert ok, f"Test DB init failed: {err}"
    yield
    _drop_test_db()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_token(client):
    resp = client.post("/api/login", json={
        "email": "admin@ntic.org.gh",
        "password": "Admin@Ntic2026!"
    })
    assert resp.status_code == 200
    return resp.json()["token"]
