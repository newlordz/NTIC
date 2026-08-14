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
        resp = client.post("/api/logout", json={"token": admin_token}, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestCompetitions:
    def test_list_competitions(self, client):
        resp = client.get("/api/competitions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_create_competition(self, client, admin_token):
        resp = client.post("/api/competitions", json={
            "title": "Test Competition 2026",
            "track": "Coding",
            "status": "active"
        }, headers=self._auth(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Test Competition 2026"
        assert "id" in data

    def test_update_competition(self, client, admin_token):
        resp = client.post("/api/competitions", json={
            "title": "Update Me",
            "track": "Robotics",
            "status": "draft"
        }, headers=self._auth(admin_token))
        comp_id = resp.json()["id"]
        resp2 = client.patch(f"/api/competitions/{comp_id}", json={
            "title": "Updated Competition",
            "status": "registration"
        }, headers=self._auth(admin_token))
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "updated"
        comps = client.get("/api/competitions").json()
        match = [c for c in comps if c["id"] == comp_id]
        assert len(match) == 1
        assert match[0]["title"] == "Updated Competition"
        assert match[0]["status"] == "registration"

    def test_delete_competition(self, client, admin_token):
        resp = client.post("/api/competitions", json={
            "title": "Delete Me",
            "status": "active"
        }, headers=self._auth(admin_token))
        comp_id = resp.json()["id"]
        resp2 = client.delete(f"/api/competitions/{comp_id}", headers=self._auth(admin_token))
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "deleted"


class TestTeams:
    def test_list_teams(self, client, admin_token):
        resp = client.get("/api/teams", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_team(self, client, admin_token):
        resp = client.post("/api/teams", json={
            "name": "Test Pytest Squad",
            "track": "Coding",
            "lead": "Test Lead",
            "members": 4,
            "status": "Active"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Pytest Squad"
        assert "id" in data

    def test_update_team(self, client, admin_token):
        resp = client.post("/api/teams", json={
            "name": "Update Team",
            "track": "Robotics"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        team_id = resp.json()["id"]
        resp2 = client.patch(f"/api/teams/{team_id}", json={
            "name": "Renamed Team",
            "status": "Qualified"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "updated"

    def test_delete_team(self, client, admin_token):
        resp = client.post("/api/teams", json={
            "name": "Delete Team"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        team_id = resp.json()["id"]
        resp2 = client.delete(f"/api/teams/{team_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "deleted"


class TestGrading:
    def test_grade_submission(self, client, admin_token):
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
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert grade_resp.status_code == 200
        assert grade_resp.json()["status"] == "graded"


class TestCORS:
    def test_options_has_cors(self, client):
        resp = client.options("/api/health", headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "GET"
        })
        assert resp.status_code == 204
        assert "access-control-allow-origin" in resp.headers


class TestShapes:
    def test_competition_get_shape(self, client, admin_token):
        resp = client.post("/api/competitions", json={
            "title": "Shape Check",
            "track": "Coding",
            "category": "Algorithms",
            "deadline": "2026-12-01",
            "status": "active",
            "description": "Test competition"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        comp_id = resp.json()["id"]
        resp_get = client.get("/api/competitions")
        assert resp_get.status_code == 200
        match = [c for c in resp_get.json() if c["id"] == comp_id]
        assert len(match) == 1
        data = match[0]
        expected = ["id", "title", "description", "track", "category", "deadline", "status", "created_at"]
        for key in expected:
            assert key in data, f"Missing key in GET response: {key}"

    def test_team_get_shape(self, client, admin_token):
        resp = client.post("/api/teams", json={
            "name": "Shape Team",
            "track": "Coding",
            "lead": "Test Lead",
            "members": 3,
            "status": "Active",
            "school_name": "Test School"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        team_id = resp.json()["id"]
        resp_get = client.get("/api/teams", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp_get.status_code == 200
        match = [t for t in resp_get.json() if t["id"] == team_id]
        assert len(match) == 1
        data = match[0]
        expected = ["id", "name", "track", "lead", "members", "status", "school_name"]
        for key in expected:
            assert key in data, f"Missing key in GET response: {key}"

    def test_student_shape(self, client, admin_token):
        resp = client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        if resp.json():
            data = resp.json()[0]
            expected = ["id", "first_name", "last_name", "email", "track", "consent_granted", "created_at"]
            for key in expected:
                assert key in data, f"Missing key: {key}"


class TestHof:
    def test_list_hof(self, client):
        resp = client.get("/api/hof")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_hof(self, client, admin_token):
        resp = client.post("/api/hof", json={
            "name": "Test Champion",
            "school": "Test School",
            "year": "2026",
            "badge": "Test Badge",
            "type": "individual",
            "track_class": "coding-track"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Champion"
        assert "id" in data

    def test_update_hof(self, client, admin_token):
        resp = client.post("/api/hof", json={
            "name": "Update HOF",
            "school": "School A",
            "year": "2025"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        hof_id = resp.json()["id"]
        resp2 = client.patch(f"/api/hof/{hof_id}", json={
            "name": "Updated Champion",
            "school": "School B",
            "year": "2025"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "updated"

    def test_delete_hof(self, client, admin_token):
        resp = client.post("/api/hof", json={
            "name": "Delete Me",
            "school": "School D"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        hof_id = resp.json()["id"]
        resp2 = client.delete(f"/api/hof/{hof_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "deleted"

    def test_hof_shape(self, client):
        resp = client.get("/api/hof")
        assert resp.status_code == 200
        expected = ["id", "type", "initials", "name", "team_name", "project_title", "members", "school", "year", "badge", "track_class"]


class TestNews:
    def test_list_news(self, client):
        resp = client.get("/api/news")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_news(self, client, admin_token):
        resp = client.post("/api/news", json={
            "headline": "Test News Headline",
            "tag": "Test",
            "date": "2026-08-01",
            "link": "#test"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["headline"] == "Test News Headline"
        assert "id" in data

    def test_delete_news(self, client, admin_token):
        resp = client.post("/api/news", json={
            "headline": "Delete News"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        news_id = resp.json()["id"]
        resp2 = client.delete(f"/api/news/{news_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "deleted"


class TestAuditLogs:
    def test_list_audit_logs(self, client, admin_token):
        resp = client.get("/api/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_audit_log(self, client, admin_token):
        resp = client.post("/api/audit-logs", json={
            "action": "Test action logged",
            "usr": "tester@test.com",
            "time": "2026-08-01T12:00:00",
            "type": "system"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "created"

    def test_prune_audit_logs(self, client, admin_token):
        resp = client.delete("/api/audit-logs/prune?days=90&preserve_critical=true", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "pruned_count" in data
        assert data["retained_days"] == 90
        assert data["preserved_critical"] is True


class TestUsers:
    def test_list_users(self, client, admin_token):
        resp = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_users_shape(self, client, admin_token):
        resp = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
        if resp.json():
            data = resp.json()[0]
            expected = ["id", "email", "full_name", "role", "ticket", "status", "created_at"]
            for key in expected:
                assert key in data, f"Missing key: {key}"


class TestLmsCourses:
    def test_list_lms_courses(self, client, admin_token):
        resp = client.get("/api/lms-courses", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_lms_course(self, client, admin_token):
        resp = client.post("/api/lms-courses", json={
            "title": "Test LMS Course",
            "track": "coding",
            "status": "active"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Test LMS Course"
        assert "id" in data


class TestBulkSync:
    def test_bulk_sync_hof(self, client, admin_token):
        resp = client.post("/api/bulk-sync", json={
            "collection": "hof",
            "items": [{
                "id": "hof-sync-1",
                "type": "individual",
                "name": "Synced Champion",
                "school": "Sync School",
                "year": "2025",
                "badge": "Sync Badge",
                "track_class": "ai-track"
            }]
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "synced"
        assert resp.json()["count"] == 1

    def test_bulk_sync_lms_courses(self, client, admin_token):
        resp = client.post("/api/bulk-sync", json={
            "collection": "lms_courses",
            "items": [{
                "id": "crs-sync-1",
                "title": "Synced Course",
                "track": "ai",
                "status": "active"
            }]
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "synced"

    def test_bulk_sync_news(self, client, admin_token):
        resp = client.post("/api/bulk-sync", json={
            "collection": "news",
            "items": [{
                "id": "news-sync-1",
                "headline": "Synced News",
                "tag": "Test"
            }]
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "synced"

    def test_bulk_sync_unsupported_collection(self, client, admin_token):
        resp = client.post("/api/bulk-sync", json={
            "collection": "unsupported",
            "items": [{"x": 1}]
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 400

    def test_bulk_sync_requires_auth(self, client):
        resp = client.post("/api/bulk-sync", json={
            "collection": "news",
            "items": [{"id": "x", "headline": "No Auth"}]
        })
        assert resp.status_code == 401


class TestUserCrud:
    def test_create_user(self, client, admin_token):
        email = f"newuser_{str(uuid.uuid4())[:8]}@test.com"
        resp = client.post("/api/users", json={
            "email": email,
            "full_name": "New User",
            "role": "reviewer",
            "password": "TestPass123!"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == email
        assert data["role"] == "reviewer"

    def test_update_user(self, client, admin_token):
        email = f"update_{str(uuid.uuid4())[:8]}@test.com"
        create_resp = client.post("/api/users", json={
            "email": email,
            "full_name": "Original Name",
            "role": "student"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        user_id = create_resp.json()["id"]
        resp = client.patch(f"/api/users/{user_id}", json={
            "email": email,
            "full_name": "Updated Name",
            "role": "instructor",
            "status": "Active"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "updated"

    def test_delete_user(self, client, admin_token):
        email = f"delete_{str(uuid.uuid4())[:8]}@test.com"
        create_resp = client.post("/api/users", json={
            "email": email,
            "full_name": "Delete Me",
            "role": "student"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        user_id = create_resp.json()["id"]
        resp = client.delete(f"/api/users/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    def test_create_user_requires_admin(self, client):
        resp = client.post("/api/users", json={
            "email": "hacker@test.com",
            "full_name": "Hacker",
            "role": "super_admin"
        })
        assert resp.status_code == 401
