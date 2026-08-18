import pytest
import uuid

from tests.conftest import ADMIN_PASSWORD


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
            "password": ADMIN_PASSWORD
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

    def test_logout(self, client, disposable_admin_token):
        token = disposable_admin_token
        resp = client.post("/api/logout", json={"token": token}, headers={"Authorization": f"Bearer {token}"})
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
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert sub_resp.status_code == 201, sub_resp.text
        sub_id = sub_resp.json()["id"]

        grade_resp = client.patch(f"/api/submissions/{sub_id}/grade", json={
            "score": 88,
            "feedback": "Good work",
            "status": "Approved"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert grade_resp.status_code == 200
        assert grade_resp.json()["status"] == "graded"

    def test_creating_a_submission_requires_a_session(self, client):
        resp = client.post("/api/submissions", json={
            "student_id": "anyone",
            "source_code_path": "cheat.py",
            "video_url": ""
        })
        assert resp.status_code == 401


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


class TestRoleEnforcement:
    """A logged-in low-privilege account must be REJECTED (403), not merely
    challenged for a token (401). Before role checks existed, every one of
    these calls succeeded with a plain student session."""

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_student_cannot_grade_a_submission(self, client, student_token):
        resp = client.patch(
            "/api/submissions/does-not-matter/grade",
            json={"score": 100, "feedback": "self-awarded", "status": "graded"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 403

    def test_student_cannot_create_a_competition(self, client, student_token):
        resp = client.post(
            "/api/competitions",
            json={"name": "Fake Cup", "track": "Coding", "status": "active"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 403

    def test_student_cannot_delete_a_student_record(self, client, student_token):
        resp = client.delete(
            "/api/students/any-id", headers=self._auth(student_token)
        )
        assert resp.status_code == 403

    def test_student_cannot_approve_their_own_registration(self, client, student_token):
        resp = client.patch(
            "/api/approvals/any-id",
            json={"status": "approved"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 403

    def test_student_cannot_edit_the_leaderboard(self, client, student_token):
        resp = client.patch(
            "/api/schools/any-id",
            json={"name": "Cheat High", "score": 999999},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 403

    def test_student_cannot_publish_news(self, client, student_token):
        resp = client.post(
            "/api/news",
            json={"headline": "Defaced", "tag": "news"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 403

    def test_student_cannot_rewrite_platform_stats(self, client, student_token):
        resp = client.patch(
            "/api/platform-stats",
            json={"regions": 1, "mentors": 1, "schools": 1, "students": 1},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 403

    def test_student_cannot_empty_the_ticket_recycle_bin(self, client, student_token):
        resp = client.delete(
            "/api/tickets/recycle-bin/empty", headers=self._auth(student_token)
        )
        assert resp.status_code == 403

    def test_judge_may_reach_the_grading_endpoint(self, client, judge_token):
        """Positive control: the role check must not block legitimate graders.
        The submission does not exist, so a 404 proves we got past the guard."""
        resp = client.patch(
            "/api/submissions/no-such-submission/grade",
            json={"score": 50, "feedback": "ok", "status": "graded"},
            headers=self._auth(judge_token),
        )
        assert resp.status_code != 403

    def test_judge_cannot_manage_users(self, client, judge_token):
        resp = client.post(
            "/api/users",
            json={"email": "x@test.com", "full_name": "X", "role": "super_admin"},
            headers=self._auth(judge_token),
        )
        assert resp.status_code == 403


class TestApiDocsExposure:
    """/docs and /openapi.json publish the complete schema of every endpoint.

    They are useful in development and a free reconnaissance map in production,
    so they must be opt-in rather than always on.
    """

    def test_docs_visibility_follows_configuration(self, client):
        import app.main as main

        # conftest does not set NTIC_DEV_RELOAD or NTIC_ENABLE_DOCS, so the app
        # under test should have them disabled.
        expected_enabled = main._docs_enabled
        for path in ("/docs", "/openapi.json", "/redoc"):
            resp = client.get(path)
            if expected_enabled:
                assert resp.status_code == 200, f"{path} should be served"
            else:
                assert resp.status_code == 404, (
                    f"{path} returned {resp.status_code}; it must be hidden when docs are disabled"
                )
                # And it must not quietly serve the SPA shell instead.
                assert "swagger" not in resp.text.lower()
                assert "redoc" not in resp.text.lower()

    def test_docs_default_to_disabled_without_dev_reload(self):
        """The default must be closed, not open."""
        import app.main as main
        import os

        if os.getenv("NTIC_ENABLE_DOCS") or os.getenv("NTIC_DEV_RELOAD"):
            pytest.skip("docs are explicitly configured in this environment")
        assert main._docs_enabled is False


class TestSharedRateLimit:
    """Rate-limit state must be shared by every replica.

    It used to live in a process-local dict, so with N instances behind a load
    balancer the effective login limit was N times the intended one, and every
    deploy reset the counters. State now lives in PostgreSQL.
    """

    def test_state_is_persisted_in_the_database(self, client):
        from app.security import check_rate_limit, clear_all_rate_limits
        from app.database import get_db_connection, release_db_connection

        clear_all_rate_limits()
        check_rate_limit("probe:shared", max_attempts=10, window_seconds=60)

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM rate_limit_hits WHERE bucket = %s", ("probe:shared",))
        stored = cur.fetchone()[0]
        cur.close()
        release_db_connection(conn)
        assert stored == 1, "the hit was not recorded in shared storage"

    def test_a_second_process_sees_the_same_counter(self, client):
        """Simulates a second replica: the in-process dict is wiped, but the
        limit must still be enforced because the count lives in the database."""
        import app.security as security

        security.clear_all_rate_limits()
        for _ in range(3):
            security.check_rate_limit("probe:replica", max_attempts=3, window_seconds=60)

        # Replica B has an empty local dict but shares the database.
        security._RATE_LIMITS.clear()

        with pytest.raises(Exception) as exc:
            security.check_rate_limit("probe:replica", max_attempts=3, window_seconds=60)
        assert getattr(exc.value, "status_code", None) == 429, (
            "a fresh process was allowed past the limit - state is not shared"
        )

    def test_429_includes_a_retry_after_header(self, client):
        import app.security as security

        security.clear_all_rate_limits()
        security.check_rate_limit("probe:retry", max_attempts=1, window_seconds=60)
        with pytest.raises(Exception) as exc:
            security.check_rate_limit("probe:retry", max_attempts=1, window_seconds=60)
        headers = getattr(exc.value, "headers", {}) or {}
        assert "Retry-After" in headers
        assert int(headers["Retry-After"]) >= 1

    def test_reset_clears_shared_state(self, client):
        import app.security as security

        security.clear_all_rate_limits()
        security.check_rate_limit("probe:reset", max_attempts=1, window_seconds=60)
        security.reset_rate_limit("probe:reset")
        # Must not raise: the counter is genuinely gone, not just locally.
        security._RATE_LIMITS.clear()
        security.check_rate_limit("probe:reset", max_attempts=1, window_seconds=60)

    def test_login_is_rate_limited_end_to_end(self, client):
        from app.security import clear_all_rate_limits

        clear_all_rate_limits()
        statuses = [
            client.post(
                "/api/login", json={"email": "admin@ntic.org.gh", "password": "definitely-wrong"}
            ).status_code
            for _ in range(8)
        ]
        assert 429 in statuses, f"login was never throttled: {statuses}"
        clear_all_rate_limits()

    def test_falls_back_to_local_when_the_database_is_unavailable(self, client, monkeypatch):
        """A database outage must not silently remove rate limiting altogether."""
        import app.security as security

        security.clear_all_rate_limits()
        monkeypatch.setattr(security, "_check_rate_limit_shared", lambda *a, **k: False)

        security.check_rate_limit("probe:fallback", max_attempts=2, window_seconds=60)
        security.check_rate_limit("probe:fallback", max_attempts=2, window_seconds=60)
        with pytest.raises(Exception) as exc:
            security.check_rate_limit("probe:fallback", max_attempts=2, window_seconds=60)
        assert getattr(exc.value, "status_code", None) == 429


class TestAuditRetentionSafety:
    """Audit records must never be deleted unless they were archived somewhere
    that survives a redeploy.

    The old job wrote a gzip to the container filesystem, logged a warning if
    that failed, and then ran the DELETE regardless. Since a container's disk is
    discarded on the next deploy, the "compliance archive" and the rows both
    disappeared.
    """

    OLD_TIME = "2000-01-01T00:00:00+00:00"

    def _seed_old_rows(self, count=3):
        from app.database import get_db_connection, release_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        ids = []
        for i in range(count):
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s) RETURNING id",
                (f"retention probe {i}", "probe@ntic.test", self.OLD_TIME, "general"),
            )
            ids.append(cur.fetchone()[0])
        conn.commit()
        cur.close()
        release_db_connection(conn)
        return ids

    def _rows_exist(self, ids):
        from app.database import get_db_connection, release_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM audit_logs WHERE id = ANY(%s)", (ids,))
        n = cur.fetchone()[0]
        cur.close()
        release_db_connection(conn)
        return n

    def test_nothing_is_deleted_when_storage_is_not_durable(self, client, admin_token, monkeypatch):
        """No bucket and no explicit opt-in -> refuse to delete."""
        monkeypatch.delenv("S3_AUDIT_BUCKET", raising=False)
        monkeypatch.delenv("AWS_STORAGE_BUCKET_NAME", raising=False)
        monkeypatch.delenv("AUDIT_ALLOW_EPHEMERAL_ARCHIVE", raising=False)

        ids = self._seed_old_rows()
        resp = client.delete(
            "/api/audit-logs/prune?days=1", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["pruned_count"] == 0
        assert body["status"] == "skipped_not_durable"
        # And it says why, rather than reporting a silent 0.
        assert "S3_AUDIT_BUCKET" in body["detail"]
        assert self._rows_exist(ids) == len(ids), "rows were deleted despite no durable archive"

    def test_archives_then_deletes_when_operator_opts_in(self, client, admin_token, monkeypatch, tmp_path):
        import gzip
        import json

        monkeypatch.delenv("S3_AUDIT_BUCKET", raising=False)
        monkeypatch.delenv("AWS_STORAGE_BUCKET_NAME", raising=False)
        monkeypatch.setenv("AUDIT_ALLOW_EPHEMERAL_ARCHIVE", "true")
        monkeypatch.setenv("AUDIT_ARCHIVE_DIR", str(tmp_path))

        ids = self._seed_old_rows()
        resp = client.delete(
            "/api/audit-logs/prune?days=1", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "pruned", body
        assert body["pruned_count"] >= len(ids)
        assert self._rows_exist(ids) == 0

        archives = list(tmp_path.glob("audit_archive_*.json.gz"))
        assert archives, "no archive file was written"
        with gzip.open(archives[0], "rt", encoding="utf-8") as gz:
            archived = json.load(gz)
        archived_actions = {r["action"] for r in archived}
        for i in range(len(ids)):
            assert f"retention probe {i}" in archived_actions

        # A checksum manifest must accompany it.
        assert (tmp_path / (archives[0].name + ".sha256")).exists()

    def test_a_failed_upload_prevents_deletion(self, client, admin_token, monkeypatch, tmp_path):
        """If the object store rejects the archive, the rows must survive."""
        import app.main as main

        monkeypatch.setenv("S3_AUDIT_BUCKET", "ntic-audit-test")
        monkeypatch.setenv("AUDIT_ARCHIVE_DIR", str(tmp_path))
        monkeypatch.setattr(
            main, "_upload_audit_archive",
            lambda archive_file, sha_file: (False, "simulated upload failure"),
        )

        ids = self._seed_old_rows()
        resp = client.delete(
            "/api/audit-logs/prune?days=1", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["pruned_count"] == 0
        assert body["status"] == "archive_not_durable"
        assert "simulated upload failure" in body["detail"]
        assert self._rows_exist(ids) == len(ids), "rows were deleted after a failed upload"

    def test_successful_upload_allows_deletion(self, client, admin_token, monkeypatch, tmp_path):
        import app.main as main

        monkeypatch.setenv("S3_AUDIT_BUCKET", "ntic-audit-test")
        monkeypatch.setenv("AUDIT_ARCHIVE_DIR", str(tmp_path))
        uploaded = {}

        def fake_upload(archive_file, sha_file):
            uploaded["archive"] = archive_file
            uploaded["sha"] = sha_file
            return True, "uploaded and verified s3://ntic-audit-test/fake"

        monkeypatch.setattr(main, "_upload_audit_archive", fake_upload)

        ids = self._seed_old_rows()
        resp = client.delete(
            "/api/audit-logs/prune?days=1", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "pruned"
        assert self._rows_exist(ids) == 0
        # The upload must have been handed both the archive and its checksum.
        assert uploaded["archive"].endswith(".json.gz")
        assert uploaded["sha"].endswith(".sha256")

    def test_critical_events_are_preserved(self, client, admin_token, monkeypatch, tmp_path):
        from app.database import get_db_connection, release_db_connection

        monkeypatch.setenv("AUDIT_ALLOW_EPHEMERAL_ARCHIVE", "true")
        monkeypatch.setenv("AUDIT_ARCHIVE_DIR", str(tmp_path))

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s) RETURNING id",
            ("old security event", "probe@ntic.test", self.OLD_TIME, "security"),
        )
        security_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        release_db_connection(conn)

        resp = client.delete(
            "/api/audit-logs/prune?days=1&preserve_critical=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert self._rows_exist([security_id]) == 1, "a security event was pruned"

    def test_prune_requires_admin(self, client, student_token):
        resp = client.delete(
            "/api/audit-logs/prune", headers={"Authorization": f"Bearer {student_token}"}
        )
        assert resp.status_code == 403


class TestCorsPreflight:
    """Browsers deliberately omit Authorization from a CORS preflight.

    The auth middleware used to demand a bearer token on every request to
    /api/auth/verify regardless of method, so the preflight answered 401 with no
    CORS headers. The browser surfaced that as an opaque CORS error, and because
    the route guard calls /api/auth/verify, cross-origin login was impossible:
    you signed in, the guard could not verify, and you were bounced back.

    Same-origin deployments send no preflight, which is why this only appeared
    when the frontend ran on its own port.
    """

    PREFLIGHT_HEADERS = {
        "Origin": "http://localhost:4200",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
    }

    def test_preflight_for_auth_verify_is_not_rejected(self, client):
        resp = client.options("/api/auth/verify", headers=self.PREFLIGHT_HEADERS)
        assert resp.status_code < 400, (
            f"preflight returned {resp.status_code}; the browser will report this "
            f"as a CORS failure and the route guard will never verify the session"
        )
        assert resp.headers.get("access-control-allow-origin")

    def test_preflight_never_requires_authentication(self, client):
        """No preflight, for any protected route, may answer 401/403."""
        protected = [
            ("/api/auth/verify", "GET"),
            ("/api/users/me", "GET"),
            ("/api/users/me/change-password", "POST"),
            ("/api/users", "POST"),
            ("/api/competitions", "POST"),
            ("/api/submissions/x/grade", "PATCH"),
            ("/api/audit-logs", "POST"),
            ("/api/bulk-sync", "POST"),
            ("/api/send-email", "POST"),
            ("/api/system/telemetry", "GET"),
        ]
        for path, method in protected:
            headers = dict(self.PREFLIGHT_HEADERS)
            headers["Access-Control-Request-Method"] = method
            resp = client.options(path, headers=headers)
            assert resp.status_code not in (401, 403), (
                f"OPTIONS {path} returned {resp.status_code} - preflight must not "
                f"be authenticated"
            )

    def test_the_real_request_still_requires_authentication(self, client):
        """Allowing the preflight through must not weaken the actual request."""
        assert client.get("/api/auth/verify").status_code == 401
        assert client.get("/api/users/me").status_code == 401
        assert client.post("/api/competitions", json={"name": "x"}).status_code == 401


class TestWebSocket:
    """Real-time sync had two independent faults that made it never work:

    1. `ws_endpoint(ws)` had no type annotation, so FastAPI treated `ws` as a
       required query parameter and rejected every handshake with HTTP 403
       before the handler ran.
    2. `broadcast_async()` called `asyncio.get_running_loop()` from sync
       endpoints, which raises in Starlette's worker thread and was swallowed,
       so no broadcast from a `def` endpoint was ever sent.

    Neither had a test. These cover both.
    """

    def test_endpoint_is_annotated_as_a_websocket(self):
        """Guards against the 403-on-every-handshake regression."""
        import inspect
        from fastapi import WebSocket
        import app.main as main

        route = next(
            r for r in main.app.routes
            if getattr(r, "path", None) == "/api/ws" and hasattr(r, "endpoint")
        )
        params = inspect.signature(route.endpoint).parameters
        assert params, "/api/ws endpoint takes no parameters"
        first = next(iter(params.values()))
        assert first.annotation is WebSocket, (
            f"/api/ws first parameter must be annotated `WebSocket`, got "
            f"{first.annotation!r}. Without the annotation FastAPI treats it as a "
            f"query parameter and rejects every connection with 403."
        )

    def test_admin_can_connect_and_ping(self, client, admin_token):
        with client.websocket_connect(f"/api/ws?token={admin_token}") as ws:
            ws.send_text("ping")
            assert ws.receive_text() == "pong"

    def test_connection_without_a_token_is_rejected(self, client):
        from starlette.websockets import WebSocketDisconnect
        with pytest.raises(Exception) as exc:
            with client.websocket_connect("/api/ws") as ws:
                ws.receive_text()
        assert exc.value is not None

    def test_invalid_token_is_rejected(self, client):
        with pytest.raises(Exception):
            with client.websocket_connect("/api/ws?token=not-a-real-token") as ws:
                ws.receive_text()

    def test_low_privilege_role_is_rejected(self, client, student_token):
        """A student must not receive admin change notifications."""
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/ws?token={student_token}") as ws:
                ws.receive_text()

    def test_broadcast_from_a_sync_endpoint_reaches_the_client(self, client, admin_token):
        """The end-to-end behaviour the app actually depends on: an admin makes a
        normal (synchronous) REST write, and connected clients get told."""
        import json

        with client.websocket_connect(f"/api/ws?token={admin_token}") as ws:
            resp = client.post(
                "/api/news",
                json={"headline": "WS broadcast probe", "tag": "news"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp.status_code == 201, resp.text

            message = json.loads(ws.receive_text())
            assert message["type"] == "data_changed"


class TestAuditIntegrity:
    """Audit entries must be attributable. Previously the caller supplied `usr`,
    `time`, `ip` and `client`, so any authenticated user could blame someone else,
    forge a source IP and backdate the entry."""

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _latest(self, admin_client, admin_token):
        resp = admin_client.get("/api/audit-logs?limit=5", headers=self._auth(admin_token))
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_actor_is_taken_from_the_session_not_the_body(self, client, admin_token, student_token):
        resp = client.post(
            "/api/audit-logs",
            json={"action": "AUDIT-FORGERY-PROBE", "usr": "admin@ntic.org.gh", "type": "security"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 201, resp.text

        entry = next(
            e for e in self._latest(client, admin_token) if e["action"] == "AUDIT-FORGERY-PROBE"
        )
        assert entry["user"] == "rbac-student@ntic.test", (
            f"attributed to {entry['user']!r} - the body's `usr` was trusted"
        )

    def test_timestamp_cannot_be_backdated(self, client, student_token, admin_token):
        resp = client.post(
            "/api/audit-logs",
            json={"action": "AUDIT-BACKDATE-PROBE", "time": "1999-01-01T00:00:00+00:00"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 201, resp.text
        entry = next(
            e for e in self._latest(client, admin_token) if e["action"] == "AUDIT-BACKDATE-PROBE"
        )
        assert not str(entry["time"]).startswith("1999")

    def test_source_ip_cannot_be_spoofed(self, client, student_token, admin_token):
        resp = client.post(
            "/api/audit-logs",
            json={"action": "AUDIT-IP-PROBE", "ip": "203.0.113.99"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 201, resp.text
        entry = next(
            e for e in self._latest(client, admin_token) if e["action"] == "AUDIT-IP-PROBE"
        )
        assert entry["ip"] != "203.0.113.99"

    def test_unknown_event_type_is_normalised(self, client, student_token, admin_token):
        resp = client.post(
            "/api/audit-logs",
            json={"action": "AUDIT-TYPE-PROBE", "type": "not-a-real-category"},
            headers=self._auth(student_token),
        )
        assert resp.status_code == 201
        entry = next(
            e for e in self._latest(client, admin_token) if e["action"] == "AUDIT-TYPE-PROBE"
        )
        assert entry["type"] == "general"

    def test_creating_an_entry_requires_a_session(self, client):
        resp = client.post("/api/audit-logs", json={"action": "anonymous write"})
        assert resp.status_code == 401


class TestHonestMonitoring:
    """Health endpoints must report measurements, not invented constants."""

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_health_reports_measured_values(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["database"] == "connected"
        assert isinstance(body["database_latency_ms"], (int, float))
        assert body["uptime_seconds"] >= 0

    def test_health_does_not_leak_db_config(self, client):
        body = client.get("/api/health").json()
        for leaky in ("host", "port", "user", "db", "password"):
            assert leaky not in body

    def test_node_health_requires_admin(self, client, student_token):
        assert client.get("/api/system/nodes-health").status_code == 401
        assert client.get(
            "/api/system/nodes-health", headers=self._auth(student_token)
        ).status_code == 403

    def test_telemetry_requires_admin(self, client, student_token):
        assert client.get("/api/system/telemetry").status_code == 401
        assert client.get(
            "/api/system/telemetry", headers=self._auth(student_token)
        ).status_code == 403

    def test_node_health_reports_only_observable_components(self, client, admin_token):
        body = client.get(
            "/api/system/nodes-health", headers=self._auth(admin_token)
        ).json()
        names = {n["name"] for n in body["nodes"]}
        # These were invented; neither exists in this deployment.
        assert "LMS Storage Bucket" not in names
        assert "Compiler & Sandbox VM" not in names
        # No fabricated chart data.
        for node in body["nodes"]:
            assert "sparklineLine" not in node
            assert "sparklineArea" not in node
            assert "measured" in node

    def test_telemetry_has_no_fabricated_gauges(self, client, admin_token):
        body = client.get("/api/system/telemetry", headers=self._auth(admin_token)).json()
        # The old shape claimed CPU/memory/bandwidth gauges and a literal 99.98%
        # success rate. Those must never be invented.
        assert "gauges" not in body
        assert "throughput" not in body
        # Host metrics are not observable from inside this process, so they are
        # simply absent. The response must also NOT carry an "unavailable" /
        # "unavailableReason" notice: that is operator diagnostics, and the
        # dashboard previously rendered it verbatim to end users.
        assert "cpuUtilization" not in body
        assert "memoryUtilization" not in body
        assert "unavailable" not in body
        assert "unavailableReason" not in body

    def test_telemetry_reports_real_row_counts(self, client, admin_token):
        body = client.get("/api/system/telemetry", headers=self._auth(admin_token)).json()
        assert body["rowCountsError"] is None
        assert body["rowCounts"]["users"] >= 1
        assert body["database"]["reachable"] is True
        assert body["sessions"]["active"] >= 1


class TestSelfServicePassword:
    """A user must be able to change their own password, and a server-issued
    temporary password must not be allowed to become permanent."""

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _new_account(self, client, admin_token):
        email = f"pw_{str(uuid.uuid4())[:8]}@test.com"
        resp = client.post(
            "/api/users",
            json={"email": email, "full_name": "Pw Tester", "role": "student"},
            headers=self._auth(admin_token),
        )
        assert resp.status_code == 201, resp.text
        temp = resp.json()["temporary_password"]
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": temp})
        assert login.status_code == 200, login.text
        return email, temp, login.json()

    def test_login_flags_a_temporary_password(self, client, admin_token):
        _, _, session = self._new_account(client, admin_token)
        assert session["must_change_password"] is True

    def test_profile_reports_the_flag(self, client, admin_token):
        _, _, session = self._new_account(client, admin_token)
        me = client.get("/api/users/me", headers=self._auth(session["token"]))
        assert me.status_code == 200, me.text
        assert me.json()["must_change_password"] is True
        assert me.json()["password_min_length"] >= 8

    def test_user_can_change_their_own_password(self, client, admin_token):
        email, temp, session = self._new_account(client, admin_token)
        token = session["token"]

        resp = client.post(
            "/api/users/me/change-password",
            json={"current_password": temp, "new_password": "Kakum-Canopy-Walkway-33"},
            headers=self._auth(token),
        )
        assert resp.status_code == 200, resp.text

        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        assert client.post("/api/login", json={"email": email, "password": temp}).status_code == 401
        clear_all_rate_limits()
        after = client.post("/api/login", json={"email": email, "password": "Kakum-Canopy-Walkway-33"})
        assert after.status_code == 200
        # Flag must be cleared, so the user is not prompted forever.
        assert after.json()["must_change_password"] is False

    def test_forced_change_does_not_require_the_current_password(self, client, admin_token):
        """The session already proves they knew the temporary password."""
        _, _, session = self._new_account(client, admin_token)
        resp = client.post(
            "/api/users/me/change-password",
            json={"new_password": "Bosumtwi-Crater-Lake-24"},
            headers=self._auth(session["token"]),
        )
        assert resp.status_code == 200, resp.text

    def test_voluntary_change_requires_the_current_password(self, client, admin_token):
        _, temp, session = self._new_account(client, admin_token)
        token = session["token"]
        # Clear the forced flag first.
        assert client.post(
            "/api/users/me/change-password",
            json={"current_password": temp, "new_password": "Nzulezu-Stilt-Village-46"},
            headers=self._auth(token),
        ).status_code == 200

        missing = client.post(
            "/api/users/me/change-password",
            json={"new_password": "Wli-Waterfall-Agumatsa-19"},
            headers=self._auth(token),
        )
        assert missing.status_code == 400
        assert "current password" in missing.json()["detail"].lower()

        wrong = client.post(
            "/api/users/me/change-password",
            json={"current_password": "not-the-password-77", "new_password": "Wli-Waterfall-Agumatsa-19"},
            headers=self._auth(token),
        )
        assert wrong.status_code == 400

    def test_weak_passwords_are_rejected(self, client, admin_token):
        _, temp, session = self._new_account(client, admin_token)
        token = session["token"]
        for weak, why in [
            ("short", "too short"),
            ("1234567890123", "digits only"),
            ("password123", "common"),
            ("aaaaaaaaaaaa", "too few distinct characters"),
        ]:
            resp = client.post(
                "/api/users/me/change-password",
                json={"current_password": temp, "new_password": weak},
                headers=self._auth(token),
            )
            assert resp.status_code == 422, f"{why!r} was accepted: {weak!r}"

    def test_new_password_must_differ_from_the_current_one(self, client, admin_token):
        _, temp, session = self._new_account(client, admin_token)
        resp = client.post(
            "/api/users/me/change-password",
            json={"current_password": temp, "new_password": temp},
            headers=self._auth(session["token"]),
        )
        assert resp.status_code == 422
        assert "different" in resp.json()["detail"].lower()

    def test_changing_the_password_signs_out_other_devices(self, client, admin_token):
        email, temp, first = self._new_account(client, admin_token)
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        second = client.post("/api/login", json={"email": email, "password": temp})
        assert second.status_code == 200
        other_token = second.json()["token"]

        resp = client.post(
            "/api/users/me/change-password",
            json={"current_password": temp, "new_password": "Paga-Crocodile-Pond-88"},
            headers=self._auth(first["token"]),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["other_sessions_revoked"] >= 1

        # The other device is signed out; the caller's own session survives.
        assert client.get("/api/users/me", headers=self._auth(other_token)).status_code == 401
        assert client.get("/api/users/me", headers=self._auth(first["token"])).status_code == 200

    def test_admin_reset_forces_a_change_again(self, client, admin_token):
        email, temp, session = self._new_account(client, admin_token)
        assert client.post(
            "/api/users/me/change-password",
            json={"current_password": temp, "new_password": "Shai-Hills-Reserve-27"},
            headers=self._auth(session["token"]),
        ).status_code == 200

        me = client.get("/api/users/me", headers=self._auth(session["token"]))
        user_id = me.json()["id"]
        reset = client.post(
            f"/api/users/{user_id}/reset-password", headers=self._auth(admin_token)
        )
        assert reset.status_code == 200
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        relogin = client.post(
            "/api/login", json={"email": email, "password": reset.json()["temporary_password"]}
        )
        assert relogin.status_code == 200
        assert relogin.json()["must_change_password"] is True

    def test_change_password_requires_a_session(self, client):
        resp = client.post(
            "/api/users/me/change-password", json={"new_password": "Ada-Foah-Estuary-64"}
        )
        assert resp.status_code == 401

    def test_admin_cannot_set_a_weak_password_for_a_new_user(self, client, admin_token):
        resp = client.post(
            "/api/users",
            json={
                "email": f"weak_{str(uuid.uuid4())[:8]}@test.com",
                "full_name": "Weak Pw",
                "role": "student",
                "password": "123456",
            },
            headers=self._auth(admin_token),
        )
        assert resp.status_code == 422


class TestPublicSurface:
    """Locks down which endpoints an anonymous caller may write to.

    If a new public write endpoint is added, this test should be updated
    deliberately - not silently.
    """

    ANONYMOUS_WRITES_ALLOWED = {
        ("POST", "/api/login"),
        ("POST", "/api/logout"),
        ("POST", "/api/users/register"),
        ("POST", "/api/students"),
        ("POST", "/api/tickets"),
        ("POST", "/api/chat"),
        ("POST", "/api/auth/verify-contact"),
        ("POST", "/api/otp/request"),
        ("POST", "/api/otp/verify"),
        ("POST", "/api/drafts"),
        ("POST", "/api/notify/registration-received"),
    }

    def test_no_unexpected_anonymous_write_endpoints(self):
        from app.main import app as fastapi_app

        public = set()
        for route in fastapi_app.routes:
            methods = getattr(route, "methods", None) or set()
            for method in methods - {"HEAD", "OPTIONS"}:
                if method not in ("POST", "PUT", "PATCH", "DELETE"):
                    continue
                deps = getattr(getattr(route, "dependant", None), "dependencies", [])
                if any("require" in str(d.call) for d in deps):
                    continue
                public.add((method, route.path))

        unexpected = public - self.ANONYMOUS_WRITES_ALLOWED
        assert not unexpected, (
            "New anonymous write endpoint(s) detected. Add a role dependency, or "
            f"add them to ANONYMOUS_WRITES_ALLOWED on purpose: {sorted(unexpected)}"
        )

    def test_generic_email_sender_requires_a_session(self, client):
        resp = client.post("/api/send-email", json={
            "to_email": "victim@example.com",
            "subject": "Reset your NTIC password",
            "html_content": "<a href='https://evil.example'>click here</a>",
        })
        assert resp.status_code == 401

    def test_client_cannot_choose_the_email_sender(self, client, admin_token, monkeypatch):
        import app.main as main
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update(json or {})

            class _R:
                status_code = 201
                text = ""
            return _R()

        monkeypatch.setattr(main.httpx, "post", fake_post)
        resp = client.post(
            "/api/send-email",
            json={
                "sender_email": "ceo@ntic.org.gh",
                "sender_name": "The Boss",
                "to_email": "someone@example.com",
                "subject": "Hello",
                "html_content": "<p>hi</p>",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        assert captured["sender"]["email"] != "ceo@ntic.org.gh"
        assert captured["sender"]["email"] == main.settings.MAIL_FROM_EMAIL

    def test_lms_progress_requires_a_session(self, client):
        assert client.post("/api/lms/progress", json={
            "student_id": "x", "course_title": "y", "progress_pct": 100
        }).status_code == 401
        assert client.get("/api/lms/progress/anyone").status_code == 401

    def test_content_creation_requires_staff(self, client, student_token):
        headers = {"Authorization": f"Bearer {student_token}"}
        assert client.post("/api/events", json={"title": "Fake", "date": "2026-01-01"}, headers=headers).status_code == 403
        assert client.post("/api/stories", json={"title": "Fake", "excerpt": "x"}, headers=headers).status_code == 403
        assert client.post("/api/talent", json={"student_name": "Fake"}, headers=headers).status_code == 403
        assert client.post("/api/csr", json={"title": "Fake"}, headers=headers).status_code == 403

    def test_anonymous_ticket_cannot_claim_a_privileged_identity(self, client):
        resp = client.post("/api/tickets", json={
            "userId": "USR-000",
            "userName": "Admin",
            "userRole": "super_admin",
            "userEmail": "admin@ntic.org.gh",
            "chatHistory": [{"from": "user", "text": "hello"}],
        })
        assert resp.status_code == 201, resp.text
        ticket_id = resp.json()["id"]

        from app.database import get_db_connection, release_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT user_role FROM support_tickets WHERE id = %s", (ticket_id,))
        role = cur.fetchone()[0]
        cur.close()
        release_db_connection(conn)
        assert role == "guest", f"anonymous caller was recorded as '{role}'"


class TestDraftPrivacy:
    """A draft holds the full registration form. It must not be readable just by
    knowing someone's email address."""

    EMAIL = "draft-owner@ntic.test"
    DRAFT = {"fullName": "Ama Owusu", "phone": "+233201234567", "gps": "5.6,-0.18"}

    def _save(self, client):
        return client.post("/api/drafts", json={"email": self.EMAIL, "data": self.DRAFT})

    def test_anonymous_read_is_refused(self, client):
        assert self._save(client).status_code == 200
        resp = client.get(f"/api/drafts/{self.EMAIL}")
        assert resp.status_code == 403
        assert "verify" in resp.json()["detail"].lower()

    def test_a_bogus_resume_token_is_refused(self, client):
        assert self._save(client).status_code == 200
        resp = client.get(f"/api/drafts/{self.EMAIL}?resume_token=otp-not-real")
        assert resp.status_code == 403

    def test_a_verified_resume_token_unlocks_only_its_own_draft(self, client, monkeypatch):
        import re
        import app.main as main
        captured = {}
        monkeypatch.setattr(
            main, "_send_brevo_email",
            lambda to, name, subj, html: (captured.update(html=html), True)[1],
        )
        assert self._save(client).status_code == 200
        # Another person's draft, to prove the token is scoped to one address.
        assert client.post(
            "/api/drafts", json={"email": "other-owner@ntic.test", "data": {"secret": "nope"}}
        ).status_code == 200

        challenge = client.post("/api/otp/request", json={
            "purpose": "draft_resume", "channel": "email", "target": self.EMAIL
        })
        assert challenge.status_code == 200, challenge.text
        challenge_id = challenge.json()["challenge_id"]
        code = re.search(r">(\d{6})<", captured["html"]).group(1)

        verified = client.post(
            "/api/otp/verify", json={"challenge_id": challenge_id, "code": code}
        )
        assert verified.status_code == 200, verified.text
        token = verified.json()["resume_token"]
        assert token

        ok = client.get(f"/api/drafts/{self.EMAIL}?resume_token={token}")
        assert ok.status_code == 200, ok.text
        assert ok.json()["data"]["fullName"] == "Ama Owusu"

        # The same token must not open a different person's draft.
        denied = client.get(f"/api/drafts/other-owner@ntic.test?resume_token={token}")
        assert denied.status_code == 403

    def test_an_admin_may_read_drafts(self, client, admin_token):
        assert self._save(client).status_code == 200
        resp = client.get(
            f"/api/drafts/{self.EMAIL}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["phone"] == "+233201234567"

    def test_a_student_cannot_read_someone_elses_draft(self, client, student_token):
        assert self._save(client).status_code == 200
        resp = client.get(
            f"/api/drafts/{self.EMAIL}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert resp.status_code == 403


class TestServerSideCredentials:

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_created_user_gets_a_server_generated_password(self, client, admin_token):
        email = f"gen_{str(uuid.uuid4())[:8]}@test.com"
        resp = client.post(
            "/api/users",
            json={"email": email, "full_name": "Generated", "role": "student"},
            headers=self._auth(admin_token),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert "temporary_password" in body
        password = body["temporary_password"]
        assert len(password) >= 12, f"too short to resist brute force: {len(password)}"
        assert password != "changeme123"
        assert not password.isdigit(), "a purely numeric password is trivially guessable"

        # And it must actually work.
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text

    def test_generated_passwords_are_unique(self, client, admin_token):
        seen = set()
        for _ in range(3):
            email = f"uniq_{str(uuid.uuid4())[:8]}@test.com"
            resp = client.post(
                "/api/users",
                json={"email": email, "full_name": "Uniq", "role": "student"},
                headers=self._auth(admin_token),
            )
            assert resp.status_code == 201
            seen.add(resp.json()["temporary_password"])
        assert len(seen) == 3

    def test_an_explicit_password_is_still_honoured(self, client, admin_token):
        email = f"explicit_{str(uuid.uuid4())[:8]}@test.com"
        resp = client.post(
            "/api/users",
            json={
                "email": email,
                "full_name": "Explicit",
                "role": "student",
                "password": "Aburi-Gardens-Skyline-90",
            },
            headers=self._auth(admin_token),
        )
        assert resp.status_code == 201
        # Nothing is generated, so nothing is echoed back.
        assert "temporary_password" not in resp.json()
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post(
            "/api/login", json={"email": email, "password": "Aburi-Gardens-Skyline-90"}
        )
        assert login.status_code == 200

    def test_password_reset_issues_a_strong_password_and_kills_sessions(self, client, admin_token):
        email = f"reset_{str(uuid.uuid4())[:8]}@test.com"
        created = client.post(
            "/api/users",
            json={"email": email, "full_name": "Reset Me", "role": "student"},
            headers=self._auth(admin_token),
        )
        assert created.status_code == 201
        user_id = created.json()["id"]
        first_password = created.json()["temporary_password"]

        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        session = client.post("/api/login", json={"email": email, "password": first_password})
        assert session.status_code == 200
        old_token = session.json()["token"]

        reset = client.post(
            f"/api/users/{user_id}/reset-password", headers=self._auth(admin_token)
        )
        assert reset.status_code == 200, reset.text
        new_password = reset.json()["temporary_password"]
        assert len(new_password) >= 12
        assert not new_password.isdigit()
        assert new_password != first_password

        # The pre-reset session must be dead.
        stale = client.get("/api/students", headers=self._auth(old_token))
        assert stale.status_code == 401

        clear_all_rate_limits()
        assert client.post("/api/login", json={"email": email, "password": first_password}).status_code == 401
        clear_all_rate_limits()
        assert client.post("/api/login", json={"email": email, "password": new_password}).status_code == 200

    def test_generated_access_pass_is_unpredictable(self, client, admin_token):
        codes = set()
        for _ in range(5):
            resp = client.post(
                "/api/auth/token/generate",
                json={"role": "judge"},
                headers=self._auth(admin_token),
            )
            assert resp.status_code == 200, resp.text
            ticket = resp.json()["ticket"]
            assert ticket.startswith("NTIC-JDG-")
            codes.add(ticket)
        assert len(codes) == 5
        # 6 characters from a 32-char alphabet, not the old 4.
        assert len(codes.pop().split("-")[-1]) >= 6


class TestSuspendedAccounts:
    def test_suspended_account_cannot_log_in(self, client, suspended_token):
        resp = client.post(
            "/api/login",
            json={"email": "rbac-suspended@ntic.test", "password": "Elmina-Castle-Lagoon-58"},
        )
        assert resp.status_code == 403

    def test_suspended_account_existing_token_is_rejected(self, client, suspended_token):
        """Suspending a user must invalidate access immediately, not just block
        future logins."""
        resp = client.get(
            "/api/students", headers={"Authorization": f"Bearer {suspended_token}"}
        )
        assert resp.status_code == 403


class TestServerSideOtp:
    """The code must be generated and checked on the server, never returned to
    the caller, and stored only as a hash."""

    EMAIL = "otp-target@ntic.test"

    def _request(self, client, target=None, channel="email", purpose="contact_verification"):
        return client.post(
            "/api/otp/request",
            json={"purpose": purpose, "channel": channel, "target": target or self.EMAIL},
        )

    def _peek_code_hash(self, challenge_id):
        """Read the stored row directly. Used only to prove the plaintext code
        is not persisted and to drive a positive-path test."""
        from app.database import get_db_connection, release_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT code_hash, target, attempts, consumed_at FROM otp_challenges WHERE id = %s",
            (challenge_id,),
        )
        row = cur.fetchone()
        cur.close()
        release_db_connection(conn)
        return row

    def test_request_never_returns_the_code(self, client, monkeypatch):
        import app.main as main
        monkeypatch.setattr(main, "_send_brevo_email", lambda *a, **k: True)
        resp = self._request(client)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "challenge_id" in body
        # No field may carry the secret, under any name.
        assert "code" not in body and "otp" not in body
        assert body["target_masked"] != self.EMAIL
        assert body["channel"] == "email"

    def test_code_is_not_stored_in_plaintext(self, client, monkeypatch):
        import app.main as main
        captured = {}

        def fake_send(to_email, to_name, subject, html):
            captured["html"] = html
            return True

        monkeypatch.setattr(main, "_send_brevo_email", fake_send)
        resp = self._request(client)
        assert resp.status_code == 200
        challenge_id = resp.json()["challenge_id"]

        # Recover the real code from the email body the server rendered.
        import re
        code = re.search(r">(\d{6})<", captured["html"]).group(1)

        stored_hash, target, attempts, consumed = self._peek_code_hash(challenge_id)
        assert code not in stored_hash
        assert "$" in stored_hash  # salted PBKDF2 form
        assert target == self.EMAIL
        assert attempts == 0 and consumed is None

    def test_correct_code_verifies_and_is_single_use(self, client, monkeypatch):
        import app.main as main
        captured = {}
        monkeypatch.setattr(
            main, "_send_brevo_email",
            lambda to, name, subj, html: (captured.update(html=html), True)[1],
        )
        challenge_id = self._request(client).json()["challenge_id"]
        import re
        code = re.search(r">(\d{6})<", captured["html"]).group(1)

        ok = client.post(
            "/api/otp/verify", json={"challenge_id": challenge_id, "code": code}
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["verified"] is True
        assert ok.json()["target"] == self.EMAIL

        # Replay must fail.
        again = client.post(
            "/api/otp/verify", json={"challenge_id": challenge_id, "code": code}
        )
        assert again.status_code == 410

    def test_wrong_code_is_rejected_and_counted(self, client, monkeypatch):
        import app.main as main
        monkeypatch.setattr(main, "_send_brevo_email", lambda *a, **k: True)
        challenge_id = self._request(client).json()["challenge_id"]

        resp = client.post(
            "/api/otp/verify", json={"challenge_id": challenge_id, "code": "000000"}
        )
        assert resp.status_code in (400, 429)
        _, _, attempts, _ = self._peek_code_hash(challenge_id)
        assert attempts >= 1

    def test_attempts_are_capped(self, client, monkeypatch):
        import app.main as main
        monkeypatch.setattr(main, "_send_brevo_email", lambda *a, **k: True)
        challenge_id = self._request(client).json()["challenge_id"]
        codes = ["111111", "222222", "333333", "444444", "555555", "666666", "777777"]
        statuses = [
            client.post(
                "/api/otp/verify", json={"challenge_id": challenge_id, "code": c}
            ).status_code
            for c in codes
        ]
        assert 429 in statuses, statuses

    def test_unknown_challenge_id_is_rejected(self, client):
        resp = client.post(
            "/api/otp/verify", json={"challenge_id": "otp-does-not-exist", "code": "123456"}
        )
        assert resp.status_code == 404

    def test_invalid_purpose_and_channel_are_rejected(self, client):
        assert self._request(client, purpose="anything").status_code == 422
        assert self._request(client, channel="carrier-pigeon").status_code == 422

    def test_invalid_email_target_is_rejected(self, client):
        assert self._request(client, target="not-an-email").status_code == 422

    def test_phone_channel_fails_closed_without_a_gateway(self, client, monkeypatch):
        """With no SMS_GATEWAY_URL the server must refuse rather than pretend to
        have sent something."""
        monkeypatch.delenv("SMS_GATEWAY_URL", raising=False)
        resp = self._request(client, target="+233201234567", channel="phone")
        assert resp.status_code == 503
        assert "unavailable" in resp.json()["detail"].lower()

    def test_requesting_a_new_code_retires_the_previous_one(self, client, monkeypatch):
        import app.main as main
        seen = []

        def fake_send(to, name, subj, html):
            seen.append(html)
            return True

        monkeypatch.setattr(main, "_send_brevo_email", fake_send)
        first = self._request(client).json()["challenge_id"]
        second = self._request(client).json()["challenge_id"]
        assert first != second

        import re
        first_code = re.search(r">(\d{6})<", seen[0]).group(1)
        stale = client.post(
            "/api/otp/verify", json={"challenge_id": first, "code": first_code}
        )
        assert stale.status_code == 410


class TestIdleSessionExpiry:
    """Sessions must end after a period of INACTIVITY, not merely on a fixed
    schedule and not only when the tab is closed.

    The regression these guard against: a user walks away leaving the tab open,
    comes back hours later and is still signed in. Two ways that happens --
    (1) the session has a long absolute lifetime and nothing tracks idleness,
    (2) the app's own background polling keeps renewing the session for a user
    who is not there. Both are covered below.
    """

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _read_session(self, token):
        from app.database import get_db_connection, release_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT expires_at, created_at, "
            "EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)) "
            "FROM auth_sessions WHERE token = %s",
            (token,),
        )
        row = cur.fetchone()
        cur.close()
        release_db_connection(conn)
        return row

    def _set_session_times(self, token, expires_sql, created_sql=None):
        from app.database import get_db_connection, release_db_connection
        conn = get_db_connection()
        cur = conn.cursor()
        if created_sql:
            cur.execute(
                f"UPDATE auth_sessions SET expires_at = {expires_sql}, "
                f"created_at = {created_sql} WHERE token = %s",
                (token,),
            )
        else:
            cur.execute(
                f"UPDATE auth_sessions SET expires_at = {expires_sql} WHERE token = %s",
                (token,),
            )
        conn.commit()
        cur.close()
        release_db_connection(conn)

    def test_login_issues_idle_window_not_a_long_lived_session(self, client, disposable_admin_token):
        """A fresh token must expire in ~the idle window, not days later."""
        from app.security import SESSION_IDLE_MINUTES
        _expires, _created, seconds_left = self._read_session(disposable_admin_token)
        # Comfortably inside the idle window, and nowhere near a multi-day TTL.
        assert seconds_left <= SESSION_IDLE_MINUTES * 60 + 5
        assert seconds_left > 0

    def test_login_reports_idle_policy_to_client(self, client):
        from app.security import clear_all_rate_limits, SESSION_IDLE_MINUTES
        clear_all_rate_limits()
        resp = client.post("/api/login", json={
            "email": "admin@ntic.org.gh", "password": ADMIN_PASSWORD,
        })
        assert resp.status_code == 200
        # The client runs its countdown off this instead of a hardcoded copy.
        assert resp.json()["session_idle_seconds"] == SESSION_IDLE_MINUTES * 60

    def test_idle_session_is_rejected(self, client, disposable_admin_token):
        """Once the idle deadline passes the token must stop working."""
        token = disposable_admin_token
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 200
        self._set_session_times(token, "CURRENT_TIMESTAMP - INTERVAL '1 minute'")
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 401

    def test_heartbeat_extends_an_active_session(self, client, disposable_admin_token):
        token = disposable_admin_token
        # Nearly expired, but still alive.
        self._set_session_times(token, "CURRENT_TIMESTAMP + INTERVAL '30 seconds'")
        before = self._read_session(token)[2]
        resp = client.post("/api/auth/heartbeat", headers=self._auth(token))
        assert resp.status_code == 200
        after = self._read_session(token)[2]
        assert after > before
        assert resp.json()["expires_in_seconds"] > before

    def test_ordinary_requests_do_NOT_extend_the_session(self, client, disposable_admin_token):
        """The critical one.

        The frontend polls in the background (ContentService runs a 5-minute
        sweep, plus a WebSocket). If any authenticated request slid the deadline
        forward, an abandoned-but-open tab would stay signed in forever and the
        idle timeout would be decorative. Only an explicit heartbeat may extend.
        """
        token = disposable_admin_token
        self._set_session_times(token, "CURRENT_TIMESTAMP + INTERVAL '10 minutes'")
        expires_before = self._read_session(token)[0]

        for path in ("/api/users/me", "/api/competitions", "/api/auth/verify"):
            assert client.get(path, headers=self._auth(token)).status_code == 200

        expires_after = self._read_session(token)[0]
        assert expires_after == expires_before, (
            "A background/polling request extended the session deadline; an "
            "abandoned tab would never be signed out."
        )

    def test_heartbeat_requires_authentication(self, client):
        assert client.post("/api/auth/heartbeat").status_code == 401

    def test_heartbeat_on_expired_session_is_rejected(self, client, disposable_admin_token):
        token = disposable_admin_token
        self._set_session_times(token, "CURRENT_TIMESTAMP - INTERVAL '1 second'")
        assert client.post("/api/auth/heartbeat", headers=self._auth(token)).status_code == 401

    def test_session_cannot_outlive_the_absolute_cap(self, client, disposable_admin_token):
        """Continuous activity must not let one session live indefinitely."""
        from app.security import SESSION_ABSOLUTE_DAYS
        token = disposable_admin_token
        self._set_session_times(
            token,
            "CURRENT_TIMESTAMP + INTERVAL '5 minutes'",
            created_sql=f"CURRENT_TIMESTAMP - INTERVAL '{SESSION_ABSOLUTE_DAYS + 1} days'",
        )
        # Still active, but past the absolute cap -> the slide cannot help.
        assert client.post("/api/auth/heartbeat", headers=self._auth(token)).status_code == 401
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 401


class TestPersonnelRoster:
    """GET /api/admin/personnel -- the sponsor/judge/instructor monitoring feed.

    The point of these tests is that the roster reports only what the database
    can actually prove. Two sourcing traps are pinned down explicitly:
    signing out must not erase someone's login history, and role detail that
    has no column must not reappear as invented data.
    """

    ROLE_FIELDS = ("courses_authored", "courses_pending", "students_reached")
    # Must not contain any part of the test users' names -- the password policy
    # rejects that, correctly.
    PASSWORD = "Kp8$violetHarbor"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _fetch(self, client, admin_token):
        resp = client.get("/api/admin/personnel", headers=self._auth(admin_token))
        assert resp.status_code == 200
        return resp.json()

    def _make_user(self, client, admin_token, role, name):
        email = f"{role}-{uuid.uuid4().hex[:8]}@roster.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role,
            "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        return email

    def _find(self, data, email):
        return next((p for p in data["people"] if p["email"] == email), None)

    def test_requires_admin(self, client):
        assert client.get("/api/admin/personnel").status_code == 401

    def test_rejects_a_non_admin_who_is_on_the_roster(self, client, admin_token):
        """A judge appears in this roster; they must not be able to read it.

        It exposes every sponsor's and instructor's email, phone and login
        history, so being listed is not the same as being allowed to look.
        """
        from app.security import clear_all_rate_limits
        email = self._make_user(client, admin_token, "judge", "Kofi Boateng")
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200
        judge_token = login.json()["token"]
        resp = client.get("/api/admin/personnel", headers=self._auth(judge_token))
        assert resp.status_code == 403, "a judge could read the full personnel roster"

    def test_returns_only_the_three_monitored_roles(self, client, admin_token):
        data = self._fetch(client, admin_token)
        roles = {p["role"] for p in data["people"]}
        assert roles <= {"sponsor", "judge", "instructor"}
        assert set(data["summary"]) == {"sponsor", "judge", "instructor"}

    def test_includes_a_newly_created_instructor(self, client, admin_token):
        email = self._make_user(client, admin_token, "instructor", "Roster Instructor")
        person = self._find(self._fetch(client, admin_token), email)
        assert person is not None
        assert person["role"] == "instructor"
        assert person["full_name"] == "Roster Instructor"

    def test_never_logged_in_user_reports_no_login(self, client, admin_token):
        email = self._make_user(client, admin_token, "sponsor", "Roster Sponsor")
        person = self._find(self._fetch(client, admin_token), email)
        assert person["last_login_at"] is None
        assert person["login_count"] == 0
        assert person["is_online"] is False

    def test_login_history_survives_signing_out(self, client, admin_token):
        """The trap.

        `auth_sessions` rows are DELETEd on logout, so sourcing last_login_at
        from that table would report a properly-signed-out user as having never
        logged in. History must come from the durable audit log instead.
        """
        from app.security import clear_all_rate_limits
        email = self._make_user(client, admin_token, "judge", "Roster Judge")

        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": "Kp8$violetHarbor"})
        assert login.status_code == 200
        token = login.json()["token"]

        person = self._find(self._fetch(client, admin_token), email)
        assert person["is_online"] is True
        assert person["last_login_at"] is not None
        assert person["login_count"] >= 1

        client.post("/api/logout", headers=self._auth(token))

        after = self._find(self._fetch(client, admin_token), email)
        assert after["is_online"] is False, "signed-out user should not read as online"
        assert after["last_login_at"] is not None, (
            "logging out erased the login history -- last_login_at is being "
            "sourced from auth_sessions instead of audit_logs"
        )
        assert after["login_count"] >= 1

    def test_course_stats_are_null_for_non_instructors(self, client, admin_token):
        """Null, not 0.

        A sponsor has no course workload at all; reporting 0 would render as a
        real measurement of nothing. Null lets the UI hide the column.
        """
        data = self._fetch(client, admin_token)
        for person in data["people"]:
            if person["role"] == "instructor":
                assert all(person[f] is not None for f in self.ROLE_FIELDS)
            else:
                assert all(person[f] is None for f in self.ROLE_FIELDS), person["role"]

    def test_does_not_fabricate_absent_role_detail(self, client, admin_token):
        """judge expertise / sponsor tier, sector, payments have no column in
        `users` -- they only ever existed in localStorage. They must not be
        served as if the backend knew them."""
        data = self._fetch(client, admin_token)
        forbidden = {"tier", "sector", "package", "payments", "total",
                     "expertise", "bio", "track", "portfolio", "region"}
        for person in data["people"]:
            leaked = forbidden & set(person)
            assert not leaked, f"roster invented fields with no column: {leaked}"

    def test_online_window_is_the_real_idle_policy(self, client, admin_token):
        from app.security import SESSION_IDLE_MINUTES
        data = self._fetch(client, admin_token)
        assert data["online_window_minutes"] == SESSION_IDLE_MINUTES

    def test_summary_counts_match_the_people_list(self, client, admin_token):
        data = self._fetch(client, admin_token)
        for role, summary in data["summary"].items():
            group = [p for p in data["people"] if p["role"] == role]
            assert summary["total"] == len(group)
            assert summary["online"] == sum(1 for p in group if p["is_online"])
            assert summary["never_logged_in"] == sum(1 for p in group if not p["last_login_at"])



class TestJudgingWorkspace:
    """The judging pipeline: a shared queue, scoring, and grader attribution.

    Before this existed the `judge` role was in GRADING_ROLES but had no way to
    reach a submission, and a score landed in the database with nobody's name on
    it. These tests pin down the parts that are easy to get quietly wrong.
    """

    PASSWORD = "Qw4$lanternRidge"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _make_student(self, client, track="Coding"):
        resp = client.post("/api/students", json={
            "first_name": "Queue", "last_name": "Candidate",
            "email": f"stu-{uuid.uuid4().hex[:8]}@judge.test",
            "track": track, "consent_granted": True,
        })
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def _make_submission(self, client, admin_token, track="Coding"):
        stu_id = self._make_student(client, track)
        resp = client.post("/api/submissions", json={
            "student_id": stu_id, "source_code_path": "entry.py", "video_url": "",
        }, headers=self._auth(admin_token))
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def _make_judge(self, client, admin_token, name="Adjoa Nkrumah"):
        email = f"judge-{uuid.uuid4().hex[:8]}@judge.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": "judge",
            "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], login.json().get("user", {}).get("id"), email

    # ── access control ──────────────────────────────────────────
    def test_queue_requires_authentication(self, client):
        assert client.get("/api/judge/queue").status_code == 401

    def test_history_requires_authentication(self, client):
        assert client.get("/api/judge/history").status_code == 401

    def test_a_judge_can_reach_the_queue(self, client, admin_token):
        """The whole point: the judge role must actually be able to work."""
        token, _uid, _email = self._make_judge(client, admin_token)
        resp = client.get("/api/judge/queue", headers=self._auth(token))
        assert resp.status_code == 200, resp.text
        assert "submissions" in resp.json()

    def test_a_student_cannot_reach_the_queue(self, client, student_token):
        assert client.get("/api/judge/queue", headers=self._auth(student_token)).status_code == 403

    def test_a_student_cannot_reach_judging_history(self, client, student_token):
        assert client.get("/api/judge/history", headers=self._auth(student_token)).status_code == 403

    # ── the queue ───────────────────────────────────────────────
    def test_unscored_submission_appears_in_the_queue(self, client, admin_token):
        sub_id = self._make_submission(client, admin_token)
        data = client.get("/api/judge/queue", headers=self._auth(admin_token)).json()
        assert sub_id in [s["id"] for s in data["submissions"]]

    def test_scoring_removes_a_submission_from_the_queue(self, client, admin_token):
        """Guards the status trap.

        The grade endpoint used to leave status='Pending' when the caller did not
        pass a status. A scored-but-Pending entry would sit in the queue forever
        and be re-marked by the next judge who opened it.
        """
        sub_id = self._make_submission(client, admin_token)
        client.patch(f"/api/submissions/{sub_id}/grade",
                     json={"score": 74, "feedback": "Solid"},
                     headers=self._auth(admin_token))
        data = client.get("/api/judge/queue", headers=self._auth(admin_token)).json()
        assert sub_id not in [s["id"] for s in data["submissions"]], (
            "a scored submission is still in the judging queue"
        )

    def test_queue_carries_the_student_context_a_judge_needs(self, client, admin_token):
        sub_id = self._make_submission(client, admin_token, track="Robotics")
        data = client.get("/api/judge/queue", headers=self._auth(admin_token)).json()
        item = next(s for s in data["submissions"] if s["id"] == sub_id)
        assert item["student_name"] == "Queue Candidate"
        assert item["track"].lower() == "robotics"
        assert item["source_code_path"] == "entry.py"

    def test_queue_can_be_filtered_by_track(self, client, admin_token):
        coding = self._make_submission(client, admin_token, track="Coding")
        robotics = self._make_submission(client, admin_token, track="Robotics")
        data = client.get("/api/judge/queue?track=Robotics", headers=self._auth(admin_token)).json()
        ids = [s["id"] for s in data["submissions"]]
        assert robotics in ids
        assert coding not in ids

    # ── attribution ─────────────────────────────────────────────
    def test_grading_records_who_graded_it(self, client, admin_token):
        token, uid, _email = self._make_judge(client, admin_token)
        sub_id = self._make_submission(client, admin_token)
        resp = client.patch(f"/api/submissions/{sub_id}/grade",
                            json={"score": 91, "feedback": "Excellent"},
                            headers=self._auth(token))
        assert resp.status_code == 200
        history = client.get("/api/judge/history", headers=self._auth(token)).json()
        mine = next((g for g in history["graded"] if g["id"] == sub_id), None)
        assert mine is not None, "a judge's own grade is missing from their history"
        assert mine["score"] == 91
        assert mine["graded_at"] is not None

    def test_attribution_cannot_be_forged_via_the_request_body(self, client, admin_token):
        """A judge must not be able to file a score under someone else's name."""
        token, uid, _email = self._make_judge(client, admin_token)
        sub_id = self._make_submission(client, admin_token)
        client.patch(f"/api/submissions/{sub_id}/grade",
                     json={"score": 55, "feedback": "x",
                           "graded_by": "USR-somebody-else",
                           "graded_by_name": "Somebody Else"},
                     headers=self._auth(token))
        history = client.get("/api/judge/history", headers=self._auth(token)).json()
        assert sub_id in [g["id"] for g in history["graded"]], (
            "attribution was taken from the request body instead of the session"
        )

    def test_history_is_private_to_each_grader(self, client, admin_token):
        """Judge A's history must not contain Judge B's work."""
        token_a, _a, _ea = self._make_judge(client, admin_token, "Yaw Asante")
        token_b, _b, _eb = self._make_judge(client, admin_token, "Esi Owusu")
        sub_id = self._make_submission(client, admin_token)
        client.patch(f"/api/submissions/{sub_id}/grade",
                     json={"score": 60, "feedback": "ok"},
                     headers=self._auth(token_a))
        hist_b = client.get("/api/judge/history", headers=self._auth(token_b)).json()
        assert sub_id not in [g["id"] for g in hist_b["graded"]]
        hist_a = client.get("/api/judge/history", headers=self._auth(token_a)).json()
        assert sub_id in [g["id"] for g in hist_a["graded"]]

    def test_attribution_survives_the_graders_account_being_deleted(self, client, admin_token):
        """Why graded_by has no FK to users(id).

        A score can be disputed after a judge has left. If attribution were a FK
        with ON DELETE SET NULL, deleting the account would erase exactly the
        evidence needed to investigate.
        """
        from app.database import get_db_connection, release_db_connection
        token, uid, _email = self._make_judge(client, admin_token, "Kwabena Mensah")
        sub_id = self._make_submission(client, admin_token)
        client.patch(f"/api/submissions/{sub_id}/grade",
                     json={"score": 70, "feedback": "recorded"},
                     headers=self._auth(token))

        # Find and delete the grader's account.
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT graded_by, graded_by_name FROM assignment_submissions WHERE id = %s", (sub_id,))
        grader_id, grader_name = cur.fetchone()
        assert grader_id, "grade was not attributed at all"
        assert grader_name == "Kwabena Mensah"
        cur.execute("DELETE FROM users WHERE id = %s", (grader_id,))
        conn.commit()
        cur.execute("SELECT graded_by, graded_by_name, score FROM assignment_submissions WHERE id = %s", (sub_id,))
        after = cur.fetchone()
        cur.close()
        release_db_connection(conn)

        assert after[0] == grader_id, "deleting the grader erased the attribution"
        assert after[1] == "Kwabena Mensah"
        assert after[2] == 70

    # ── roster integration ──────────────────────────────────────
    def test_personnel_roster_reports_a_judges_output(self, client, admin_token):
        token, _uid, email = self._make_judge(client, admin_token, "Akosua Frimpong")
        sub_id = self._make_submission(client, admin_token)
        client.patch(f"/api/submissions/{sub_id}/grade",
                     json={"score": 83, "feedback": "counted"},
                     headers=self._auth(token))
        roster = client.get("/api/admin/personnel", headers=self._auth(admin_token)).json()
        person = next(p for p in roster["people"] if p["email"] == email)
        assert person["submissions_graded"] >= 1
        assert person["last_graded_at"] is not None

    def test_sponsors_have_no_grading_figure(self, client, admin_token):
        """Sponsors cannot grade, so the number must be null rather than 0."""
        roster = client.get("/api/admin/personnel", headers=self._auth(admin_token)).json()
        for p in roster["people"]:
            if p["role"] == "sponsor":
                assert p["submissions_graded"] is None
                assert p["last_graded_at"] is None


class TestSelfServiceProfile:
    """PATCH /api/users/me -- letting users save their own profile.

    Before this endpoint existed the profile-completion page had nowhere to
    save: submitProfile() wrote to localStorage behind a fake 1.5s delay, so a
    judge's expertise/bio and a sponsor's sector/tier were lost as soon as they
    signed in anywhere else.

    A self-service write endpoint is a classic privilege-escalation surface, so
    most of these tests are about what it must REFUSE to change.
    """

    PASSWORD = "Tz6#meadowGlint"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _make_user(self, client, admin_token, role="judge", name="Nii Armah"):
        email = f"self-{uuid.uuid4().hex[:8]}@profile.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role, "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _me(self, client, token):
        resp = client.get("/api/users/me", headers=self._auth(token))
        assert resp.status_code == 200, resp.text
        return resp.json()

    # ── it must work at all ─────────────────────────────────────
    def test_requires_authentication(self, client):
        assert client.patch("/api/users/me", json={"full_name": "Nobody"}).status_code == 401

    def test_saves_a_judges_profile(self, client, admin_token):
        token, _email = self._make_user(client, admin_token, "judge")
        resp = client.patch("/api/users/me", headers=self._auth(token), json={
            "full_name": "Nii Armah Quaye",
            "phone": "0244" + uuid.uuid4().hex[:6],
            "organization": "University of Ghana",
            "bio": "Fifteen years in embedded systems.",
            "expertise": "Robotics",
            "experience_level": "8-12",
        })
        assert resp.status_code == 200, resp.text
        me = self._me(client, token)
        assert me["full_name"] == "Nii Armah Quaye"
        assert me["organization"] == "University of Ghana"
        assert me["bio"] == "Fifteen years in embedded systems."
        assert me["expertise"] == "Robotics"
        assert me["experience_level"] == "8-12"

    def test_saves_a_sponsors_profile(self, client, admin_token):
        token, _email = self._make_user(client, admin_token, "sponsor", "Efua Danso")
        resp = client.patch("/api/users/me", headers=self._auth(token), json={
            "organization": "Kasapreko Ltd", "sector": "Manufacturing",
            "rep_name": "Efua Danso", "tier": "Gold Partner",
        })
        assert resp.status_code == 200, resp.text
        me = self._me(client, token)
        assert me["sector"] == "Manufacturing"
        assert me["rep_name"] == "Efua Danso"
        assert me["tier"] == "Gold Partner"

    def test_survives_a_reload(self, client, admin_token):
        """The actual bug being fixed: the value must come back from the server."""
        token, _email = self._make_user(client, admin_token)
        client.patch("/api/users/me", headers=self._auth(token),
                     json={"bio": "Persisted server-side."})
        assert self._me(client, token)["bio"] == "Persisted server-side."

    def test_only_touches_supplied_fields(self, client, admin_token):
        token, _email = self._make_user(client, admin_token)
        client.patch("/api/users/me", headers=self._auth(token),
                     json={"bio": "First", "expertise": "AI"})
        client.patch("/api/users/me", headers=self._auth(token), json={"bio": "Second"})
        me = self._me(client, token)
        assert me["bio"] == "Second"
        assert me["expertise"] == "AI", "an unsent field was wiped"

    # ── what it must REFUSE ─────────────────────────────────────
    def test_cannot_escalate_own_role(self, client, admin_token):
        """The one that matters most."""
        token, _email = self._make_user(client, admin_token, "judge")
        before = self._me(client, token)["role"]
        assert before == "judge"
        client.patch("/api/users/me", headers=self._auth(token), json={
            "full_name": "Still A Judge", "role": "super_admin",
        })
        assert self._me(client, token)["role"] == "judge", (
            "a user promoted themselves through the self-service profile endpoint"
        )

    def test_cannot_change_own_status(self, client, admin_token):
        token, _email = self._make_user(client, admin_token)
        client.patch("/api/users/me", headers=self._auth(token),
                     json={"bio": "x", "status": "Suspended"})
        assert self._me(client, token)["status"].lower() == "active"

    def test_cannot_change_own_email(self, client, admin_token):
        """Email is a login identifier; changing it here would bypass the
        uniqueness and verification handling in the admin path."""
        token, email = self._make_user(client, admin_token)
        client.patch("/api/users/me", headers=self._auth(token),
                     json={"bio": "x", "email": "hijack@evil.test"})
        assert self._me(client, token)["email"] == email

    def test_cannot_change_own_access_token(self, client, admin_token):
        token, _email = self._make_user(client, admin_token)
        original = self._me(client, token)["ticket"]
        client.patch("/api/users/me", headers=self._auth(token),
                     json={"bio": "x", "ticket": "NTIC-SUPER-0001"})
        assert self._me(client, token)["ticket"] == original

    def test_cannot_edit_another_account_by_passing_an_id(self, client, admin_token):
        """The row updated is always the session's user, never an id from the body."""
        victim_token, victim_email = self._make_user(client, admin_token, "judge", "Kojo Baah")
        victim_id = self._me(client, victim_token)["id"]
        attacker_token, _ae = self._make_user(client, admin_token, "judge", "Yaa Asantewaa")
        client.patch("/api/users/me", headers=self._auth(attacker_token), json={
            "id": victim_id, "full_name": "Overwritten By Attacker",
        })
        assert self._me(client, victim_token)["full_name"] == "Kojo Baah"

    # ── validation ──────────────────────────────────────────────
    def test_rejects_an_empty_request(self, client, admin_token):
        token, _email = self._make_user(client, admin_token)
        assert client.patch("/api/users/me", headers=self._auth(token), json={}).status_code == 400

    def test_rejects_a_blank_name(self, client, admin_token):
        token, _email = self._make_user(client, admin_token)
        resp = client.patch("/api/users/me", headers=self._auth(token), json={"full_name": "   "})
        assert resp.status_code == 422

    def test_blank_phone_is_stored_as_null_not_empty_string(self, client, admin_token):
        """`users.phone` is UNIQUE, so two accounts saving a blank phone would
        collide if '' were stored instead of NULL."""
        a_token, _a = self._make_user(client, admin_token, "judge", "First Person")
        b_token, _b = self._make_user(client, admin_token, "judge", "Second Person")
        assert client.patch("/api/users/me", headers=self._auth(a_token),
                            json={"phone": ""}).status_code == 200
        assert client.patch("/api/users/me", headers=self._auth(b_token),
                            json={"phone": ""}).status_code == 200

    def test_duplicate_phone_is_reported_clearly(self, client, admin_token):
        shared = "0209" + uuid.uuid4().hex[:6]
        a_token, _a = self._make_user(client, admin_token, "judge", "Phone Owner")
        b_token, _b = self._make_user(client, admin_token, "judge", "Phone Taker")
        assert client.patch("/api/users/me", headers=self._auth(a_token),
                            json={"phone": shared}).status_code == 200
        resp = client.patch("/api/users/me", headers=self._auth(b_token), json={"phone": shared})
        assert resp.status_code == 409
        assert "phone" in resp.json()["detail"].lower()

    def test_reports_which_fields_were_saved(self, client, admin_token):
        token, _email = self._make_user(client, admin_token)
        resp = client.patch("/api/users/me", headers=self._auth(token),
                            json={"bio": "b", "sector": "Technology"})
        assert resp.json()["updated"] == ["bio", "sector"]
