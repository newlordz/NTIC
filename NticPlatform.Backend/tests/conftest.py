import pytest
from fastapi.testclient import TestClient
from app.main import app

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
