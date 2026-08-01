import pytest
import uuid


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "database" in data
        assert "host" not in data


class TestLogin:
    def test_login_with_valid_credentials(self, client):
        resp = client.post("/api/login", json={
            "email": "admin@ntic.org.gh",
            "password": "Admin@Ntic2026!"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["role"] == "super_admin"
        assert data["email"] == "admin@ntic.org.gh"

    def test_login_with_wrong_password_returns_401(self, client):
        resp = client.post("/api/login", json={
            "email": "admin@ntic.org.gh",
            "password": "wrongpassword"
        })
        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]

    def test_login_with_unknown_email_returns_401(self, client):
        resp = client.post("/api/login", json={
            "email": "nobody@example.com",
            "password": "anything"
        })
        assert resp.status_code == 401

    def test_login_missing_fields_returns_422(self, client):
        resp = client.post("/api/login", json={})
        assert resp.status_code == 422

    def test_logout(self, client, admin_token):
        resp = client.post("/api/logout", json={"token": admin_token})
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestCompetitions:
    def test_list_competitions(self, client):
        resp = client.get("/api/competitions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_competition(self, client):
        resp = client.post("/api/competitions", json={
            "title": "Test Competition 2026",
            "track": "Coding",
            "status": "active"
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Test Competition 2026"
        assert "id" in data

    def test_update_competition(self, client):
        resp = client.post("/api/competitions", json={
            "title": "Update Me",
            "track": "Robotics",
            "status": "draft"
        })
        comp_id = resp.json()["id"]
        resp2 = client.patch(f"/api/competitions/{comp_id}", json={
            "title": "Updated Competition",
            "status": "registration"
        })
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "updated"
        comps = client.get("/api/competitions").json()
        match = [c for c in comps if c["id"] == comp_id]
        assert len(match) == 1
        assert match[0]["title"] == "Updated Competition"
        assert match[0]["status"] == "registration"

    def test_delete_competition(self, client):
        resp = client.post("/api/competitions", json={
            "title": "Delete Me",
            "status": "active"
        })
        comp_id = resp.json()["id"]
        resp2 = client.delete(f"/api/competitions/{comp_id}")
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "deleted"


class TestTeams:
    def test_list_teams(self, client):
        resp = client.get("/api/teams")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_team(self, client):
        resp = client.post("/api/teams", json={
            "name": "Test Pytest Squad",
            "track": "Coding",
            "lead": "Test Lead",
            "members": 4,
            "status": "Active"
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Pytest Squad"
        assert "id" in data

    def test_update_team(self, client):
        resp = client.post("/api/teams", json={
            "name": "Update Team",
            "track": "Robotics"
        })
        team_id = resp.json()["id"]
        resp2 = client.patch(f"/api/teams/{team_id}", json={
            "name": "Renamed Team",
            "status": "Qualified"
        })
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "updated"

    def test_delete_team(self, client):
        resp = client.post("/api/teams", json={
            "name": "Delete Team"
        })
        team_id = resp.json()["id"]
        resp2 = client.delete(f"/api/teams/{team_id}")
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "deleted"


class TestGrading:
    def test_grade_submission(self, client):
        email = f"test{str(uuid.uuid4())[:8]}@test.com"
        stu_resp = client.post("/api/students", json={
            "first_name": "Test",
            "last_name": "Student",
            "email": email,
            "track": "Coding",
            "consent_granted": True
        })
        assert stu_resp.status_code == 201, stu_resp.text
        stu_id = stu_resp.json()["id"]

        sub_resp = client.post("/api/submissions", json={
            "student_id": stu_id,
            "source_code_path": "test.py",
            "video_url": ""
        })
        assert sub_resp.status_code == 201, sub_resp.text
        sub_id = sub_resp.json()["id"]

        grade_resp = client.patch(f"/api/submissions/{sub_id}/grade", json={
            "score": 88,
            "feedback": "Good work",
            "status": "Approved"
        })
        assert grade_resp.status_code == 200
        assert grade_resp.json()["status"] == "graded"


class TestCORS:
    def test_options_has_cors(self, client):
        resp = client.options("/api/health", headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "GET"
        })
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers


class TestShapes:
    def test_competition_get_shape(self, client):
        resp = client.post("/api/competitions", json={
            "title": "Shape Check",
            "track": "Coding",
            "category": "Algorithms",
            "deadline": "2026-12-01",
            "status": "active",
            "description": "Test competition"
        })
        comp_id = resp.json()["id"]
        resp_get = client.get("/api/competitions")
        assert resp_get.status_code == 200
        match = [c for c in resp_get.json() if c["id"] == comp_id]
        assert len(match) == 1
        data = match[0]
        expected = ["id", "title", "description", "track", "category", "deadline", "status", "created_at"]
        for key in expected:
            assert key in data, f"Missing key in GET response: {key}"

    def test_team_get_shape(self, client):
        resp = client.post("/api/teams", json={
            "name": "Shape Team",
            "track": "Coding",
            "lead": "Test Lead",
            "members": 3,
            "status": "Active",
            "school_name": "Test School"
        })
        team_id = resp.json()["id"]
        resp_get = client.get("/api/teams")
        assert resp_get.status_code == 200
        match = [t for t in resp_get.json() if t["id"] == team_id]
        assert len(match) == 1
        data = match[0]
        expected = ["id", "name", "track", "lead", "members", "status", "school_name"]
        for key in expected:
            assert key in data, f"Missing key in GET response: {key}"

    def test_student_shape(self, client):
        resp = client.get("/api/students")
        assert resp.status_code == 200
        if resp.json():
            data = resp.json()[0]
            expected = ["id", "first_name", "last_name", "email", "track", "consent_granted", "created_at"]
            for key in expected:
                assert key in data, f"Missing key: {key}"
