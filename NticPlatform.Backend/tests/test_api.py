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
        # Preflight is handled by CORSMiddleware, which answers 200 (not 204).
        # The requirement is that it is not rejected and carries the CORS header.
        assert resp.status_code < 400
        assert "access-control-allow-origin" in resp.headers

    def test_disallowed_origin_is_not_reflected(self, client):
        resp = client.options("/api/health", headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET"
        })
        # A non-allowlisted origin must not be echoed back, otherwise any site
        # could read credentialed responses.
        assert resp.headers.get("access-control-allow-origin") != "https://evil.example.com"


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


class TestLmsCycleScoping:
    """The LMS was organised only by track; courses now carry a cycle."""

    def _instructor(self, client, admin_token):
        from app.security import clear_all_rate_limits
        email = f"instr-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Volta-Keta-Lagoon-99"
        resp = client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                           json={"email": email, "full_name": "Instructor",
                                 "role": "instructor", "password": password,
                                 "status": "Active"})
        assert resp.status_code in (200, 201), resp.text
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        return login.json()["token"]

    def _cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        return client.post("/api/competitions", headers=h,
                           json={"title": f"LMS Cycle {uuid.uuid4().hex[:6]}"}).json()["id"]

    def test_a_course_can_be_attached_to_a_cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        token = self._instructor(client, admin_token)
        cid = self._cycle(client, admin_token)
        ih = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/lms/courses", headers=ih,
                           json={"title": "Cycle Course", "competition_id": cid})
        assert resp.status_code == 201, resp.text
        assert resp.json()["competitionId"] == cid

    def test_a_course_with_no_cycle_is_evergreen(self, client, admin_token):
        token = self._instructor(client, admin_token)
        ih = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/lms/courses", headers=ih, json={"title": "Evergreen"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["competitionId"] is None

    def test_a_cycle_scoped_list_excludes_other_cycles(self, client, admin_token):
        token = self._instructor(client, admin_token)
        ih = {"Authorization": f"Bearer {token}"}
        a = self._cycle(client, admin_token)
        b = self._cycle(client, admin_token)
        client.post("/api/lms/courses", headers=ih,
                    json={"title": "For A", "competition_id": a})
        client.post("/api/lms/courses", headers=ih,
                    json={"title": "For B", "competition_id": b})

        scoped = client.get(f"/api/lms/my-courses?competition_id={a}", headers=ih).json()
        assert all(c["competitionId"] == a for c in scoped)
        assert any(c["title"] == "For A" for c in scoped)
        assert not any(c["title"] == "For B" for c in scoped)

    def test_a_bad_cycle_reference_is_rejected(self, client, admin_token):
        token = self._instructor(client, admin_token)
        ih = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/lms/courses", headers=ih,
                           json={"title": "Bad Ref", "competition_id": "comp-nope"})
        assert resp.status_code == 422, resp.text

    def test_the_public_browse_list_carries_the_cycle(self, client, admin_token):
        cid = self._cycle(client, admin_token)
        h = {"Authorization": f"Bearer {admin_token}"}
        client.post("/api/lms/courses", headers=h,
                    json={"title": "Browsable", "competition_id": cid})
        scoped = client.get(f"/api/lms-courses?competition_id={cid}", headers=h).json()
        assert all(c["competitionId"] == cid for c in scoped)
        assert any(c["title"] == "Browsable" for c in scoped)


class TestTeamMembership:
    """teams stored member *names* only, so nothing could join a student to a team."""

    def _student(self, client, admin_token):
        from app.security import clear_all_rate_limits
        email = f"stu-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Accra-Osu-Castle-77"
        resp = client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                           json={"email": email, "full_name": "Kofi Mensah",
                                 "role": "student", "password": password,
                                 "status": "Active"})
        assert resp.status_code in (200, 201), resp.text
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        return client.post("/api/competitions", headers=h,
                           json={"title": f"TM Cycle {uuid.uuid4().hex[:6]}"}).json()["id"]

    def test_team_members_are_resolved_from_emails(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        token, email = self._student(client, admin_token)
        team_id = client.post("/api/teams", headers=h, json={
            "name": "Roster Team", "lead": "Kofi Mensah",
            "lead_email": email, "competition_id": self._cycle(client, admin_token)
        }).json()["id"]
        # The membership row exists and is keyed to the student's account via the
        # email (the student account already exists in this test).
        import app.database as db
        conn = db.get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT student_id, email, is_lead FROM team_members WHERE team_id = %s",
                (team_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            db.release_db_connection(conn)
        assert any(r[0] is not None and (r[1] or "").lower() == email for r in rows), rows

    def test_enrolment_records_the_students_team(self, client, admin_token):
        """Enrolling in a cycle course should tag the student with their squad."""
        h = {"Authorization": f"Bearer {admin_token}"}
        stoken, email = self._student(client, admin_token)
        cid = self._cycle(client, admin_token)
        team_id = client.post("/api/teams", headers=h, json={
            "name": "Enrol Team", "lead": "Kofi Mensah", "lead_email": email,
            "competition_id": cid
        }).json()["id"]

        # Instructor creates a course for that cycle, and approves it.
        from app.security import clear_all_rate_limits
        iemail = f"inst-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": iemail, "full_name": "Instructor", "role": "instructor",
            "password": "Volta-Ho-Wli-44", "status": "Active"})
        clear_all_rate_limits()
        ilogin = client.post("/api/login", json={"email": iemail, "password": "Volta-Ho-Wli-44"})
        ih = {"Authorization": f"Bearer {ilogin.json()['token']}"}
        course = client.post("/api/lms/courses", headers=ih,
                             json={"title": "Cycle Course", "competition_id": cid}).json()
        client.patch(f"/api/lms/courses/{course['id']}/moderate", headers=h,
                     json={"approve": True})

        clear_all_rate_limits()
        # The student enrols; the roster must show their team.
        sh = {"Authorization": f"Bearer {stoken}"}
        client.post("/api/lms/enrollments", headers=sh,
                    json={"course_id": course["id"]})
        roster = client.get(f"/api/lms/courses/{course['id']}/students", headers=ih).json()
        assert any(r["team_id"] == team_id for r in roster), roster


class TestTeamAutoEnrollment:
    """Approving a team into a cycle should enrol its members on that cycle's courses."""

    def _student(self, client, admin_token, name="Kofi Mensah"):
        from app.security import clear_all_rate_limits
        email = f"ae-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Accra-Jamestown-51"
        client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                    json={"email": email, "full_name": name,
                          "role": "student", "password": password, "status": "Active"})
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        return login.json()["token"], email

    def _cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        return client.post("/api/competitions", headers=h,
                           json={"title": f"AE Cycle {uuid.uuid4().hex[:6]}"}).json()["id"]

    def _approved_course(self, client, admin_token, cid, title="AE Course"):
        from app.security import clear_all_rate_limits
        h = {"Authorization": f"Bearer {admin_token}"}
        iemail = f"aei-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": iemail, "full_name": "Instructor", "role": "instructor",
            "password": "Volta-Afadja-22", "status": "Active"})
        clear_all_rate_limits()
        ilogin = client.post("/api/login", json={"email": iemail, "password": "Volta-Afadja-22"})
        ih = {"Authorization": f"Bearer {ilogin.json()['token']}"}
        course = client.post("/api/lms/courses", headers=ih,
                             json={"title": title, "competition_id": cid}).json()
        client.patch(f"/api/lms/courses/{course['id']}/moderate", headers=h,
                     json={"approve": True})
        return course["id"]

    def test_creating_a_cycle_team_auto_enrols_its_members(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        token, email = self._student(client, admin_token)
        cid = self._cycle(client, admin_token)
        course_id = self._approved_course(client, admin_token, cid)

        client.post("/api/teams", headers=h, json={
            "name": "Auto Team", "lead": "Kofi Mensah", "lead_email": email,
            "competition_id": cid
        })

        roster = client.get(f"/api/lms/courses/{course_id}/students", headers=h).json()
        assert any(r["student_email"].lower() == email for r in roster), roster

    def test_members_are_not_enrolled_on_unapproved_courses(self, client, admin_token):
        from app.security import clear_all_rate_limits
        h = {"Authorization": f"Bearer {admin_token}"}
        token, email = self._student(client, admin_token)
        cid = self._cycle(client, admin_token)
        iemail = f"aei-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": iemail, "full_name": "Instructor", "role": "instructor",
            "password": "Volta-Afadja-22", "status": "Active"})
        clear_all_rate_limits()
        ilogin = client.post("/api/login", json={"email": iemail, "password": "Volta-Afadja-22"})
        ih = {"Authorization": f"Bearer {ilogin.json()['token']}"}
        course = client.post("/api/lms/courses", headers=ih,
                             json={"title": "Pending Course", "competition_id": cid}).json()
        # Deliberately NOT moderated: still pending.

        client.post("/api/teams", headers=h, json={
            "name": "No Enrol", "lead": "Kofi Mensah", "lead_email": email,
            "competition_id": cid
        })

        roster = client.get(f"/api/lms/courses/{course['id']}/students", headers=ih).json()
        assert not any(r["student_email"].lower() == email for r in roster), roster

    def test_evergreen_team_is_not_auto_enrolled(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        token, email = self._student(client, admin_token)
        cid = self._cycle(client, admin_token)
        course_id = self._approved_course(client, admin_token, cid)

        # No competition_id: an evergreen team, not tied to this cycle.
        client.post("/api/teams", headers=h, json={
            "name": "Evergreen Team", "lead": "Kofi Mensah", "lead_email": email
        })

        roster = client.get(f"/api/lms/courses/{course_id}/students", headers=h).json()
        assert not any(r["student_email"].lower() == email for r in roster), roster


class TestInstitutionAndMentors:
    """Institution student provisioning, credential reset scope, and mentors."""

    def _school_admin(self, client, admin_token, school):
        from app.security import clear_all_rate_limits
        email = f"sa-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Cape-Coast-Castle-88"
        client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                    json={"email": email, "full_name": "School Admin",
                          "role": "school_admin", "password": password,
                          "status": "Active", "organization": school})
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        return login.json()["token"], email

    def _instructor(self, client, admin_token, school):
        from app.security import clear_all_rate_limits
        email = f"in-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                    json={"email": email, "full_name": "Mentor Instructor",
                          "role": "instructor", "password": "Kumasi-Manhyia-19",
                          "status": "Active", "organization": school})
        clear_all_rate_limits()
        return email

    def test_provisioning_creates_student_accounts_for_members_with_emails(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Provision {uuid.uuid4().hex[:5]}"
        m1 = f"m1-{uuid.uuid4().hex[:8]}@ntic.test"
        m2 = f"m2-{uuid.uuid4().hex[:8]}@ntic.test"
        resp = client.post("/api/teams", headers=h, json={
            "name": "Provisioned Team", "lead": "Ama Owusu", "lead_email": m1,
            "members": 2, "roster_list": ["Ama Owusu", "Yaw Boateng"],
            "member_emails": [m2], "school_name": school
        })
        assert resp.status_code == 201, resp.text
        provisioned = resp.json()["provisioned_accounts"]
        assert {p["email"] for p in provisioned} == {m1, m2}
        assert all(p["temporary_password"] for p in provisioned)
        users = client.get("/api/users", headers=h).json()
        made = [u for u in users if u["email"] in (m1, m2)]
        assert len(made) == 2
        assert all(u["role"] == "student" for u in made)

    def test_provisioning_is_idempotent_for_existing_accounts(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Idem {uuid.uuid4().hex[:5]}"
        existing = f"exist-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": existing, "full_name": "Already Here", "role": "student",
            "password": "Sekondi-Takoradi-77", "status": "Active"})
        resp = client.post("/api/teams", headers=h, json={
            "name": "Idem Team", "lead": "Already Here", "lead_email": existing,
            "school_name": school
        })
        assert resp.status_code == 201, resp.text
        assert all(p["email"] != existing for p in resp.json()["provisioned_accounts"])

    def test_institution_sees_only_its_own_students(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        mine = f"Mine {uuid.uuid4().hex[:5]}"
        theirs = f"Theirs {uuid.uuid4().hex[:5]}"
        token, _ = self._school_admin(client, admin_token, mine)
        my_student = f"ms-{uuid.uuid4().hex[:8]}@ntic.test"
        their_student = f"ts-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/teams", headers=h, json={
            "name": "My Team", "lead": "S1", "lead_email": my_student, "school_name": mine})
        client.post("/api/teams", headers=h, json={
            "name": "Their Team", "lead": "S2", "lead_email": their_student, "school_name": theirs})

        seen = client.get("/api/institution/students",
                          headers={"Authorization": f"Bearer {token}"}).json()
        emails = {s["email"] for s in seen}
        assert my_student in emails
        assert their_student not in emails

    def test_credential_reset_is_scoped_to_own_institution(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        mine = f"RMine {uuid.uuid4().hex[:5]}"
        theirs = f"RTheirs {uuid.uuid4().hex[:5]}"
        token, _ = self._school_admin(client, admin_token, mine)
        their_student = f"rts-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/teams", headers=h, json={
            "name": "R Their Team", "lead": "S", "lead_email": their_student, "school_name": theirs})
        users = client.get("/api/users", headers=h).json()
        tid = next(u["id"] for u in users if u["email"] == their_student)
        resp = client.post(f"/api/institution/students/{tid}/reset-credentials",
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404, resp.text

    def test_credential_reset_returns_a_one_time_password(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Reset {uuid.uuid4().hex[:5]}"
        token, _ = self._school_admin(client, admin_token, school)
        student = f"rs-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/teams", headers=h, json={
            "name": "Reset Team", "lead": "S", "lead_email": student, "school_name": school})
        users = client.get("/api/users", headers=h).json()
        sid = next(u["id"] for u in users if u["email"] == student)
        resp = client.post(f"/api/institution/students/{sid}/reset-credentials",
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["temporary_password"]

    def test_a_non_instructor_cannot_be_a_mentor(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Ment {uuid.uuid4().hex[:5]}"
        team_id = client.post("/api/teams", headers=h,
                              json={"name": "Ment Team", "school_name": school}).json()["id"]
        student = f"nm-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": student, "full_name": "Not Mentor", "role": "student",
            "password": "Ho-Volta-Region-33", "status": "Active"})
        users = client.get("/api/users", headers=h).json()
        sid = next(u["id"] for u in users if u["email"] == student)
        resp = client.patch(f"/api/teams/{team_id}/mentor", headers=h,
                            json={"mentor_id": sid})
        assert resp.status_code == 400, resp.text

    def test_an_instructor_can_be_assigned_as_mentor(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Ment2 {uuid.uuid4().hex[:5]}"
        iemail = self._instructor(client, admin_token, school)
        users = client.get("/api/users", headers=h).json()
        iid = next(u["id"] for u in users if u["email"] == iemail)
        team_id = client.post("/api/teams", headers=h,
                              json={"name": "Ment2 Team", "school_name": school}).json()["id"]
        resp = client.patch(f"/api/teams/{team_id}/mentor", headers=h,
                            json={"mentor_id": iid})
        assert resp.status_code == 200, resp.text
        assert resp.json()["mentor_status"] == "assigned"

        # Unassigning clears the mentor
        resp_unassign = client.patch(f"/api/teams/{team_id}/mentor", headers=h,
                                     json={"mentor_id": None})
        assert resp_unassign.status_code == 200, resp_unassign.text
        assert resp_unassign.json()["mentor_status"] == "none"
        assert resp_unassign.json()["mentor_id"] is None

    def test_request_mentor_flags_a_team(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        team_id = client.post("/api/teams", headers=h,
                              json={"name": f"Req {uuid.uuid4().hex[:5]}"}).json()["id"]
        resp = client.post(f"/api/teams/{team_id}/request-mentor", headers=h)
        assert resp.status_code == 200, resp.text
        assert resp.json()["mentor_status"] == "requested"

    def test_auto_assign_covers_mentorless_teams(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Auto {uuid.uuid4().hex[:5]}"
        self._instructor(client, admin_token, school)
        team_id = client.post("/api/teams", headers=h,
                              json={"name": f"Auto Team {uuid.uuid4().hex[:5]}",
                                    "track": "coding"}).json()["id"]
        resp = client.post("/api/teams/auto-assign-mentors", headers=h)
        assert resp.status_code == 200, resp.text
        assert resp.json()["assigned"] >= 1
        teams = client.get("/api/teams", headers=h).json()
        mine = next(t for t in teams if t["id"] == team_id)
        assert mine["mentorId"] is not None
        assert mine["mentorStatus"] == "assigned"

    def test_adding_an_email_on_edit_provisions_the_account_later(self, client, admin_token):
        """A member added by name only must get an account when their email is
        supplied on a later edit -- not be stranded forever."""
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"LateEmail {uuid.uuid4().hex[:5]}"
        # Create with the lead recorded by NAME only -- no email, no account.
        team_id = client.post("/api/teams", headers=h, json={
            "name": "Late Team", "lead": "Esi Ansah", "members": 1,
            "school_name": school
        }).json()["id"]
        created_now = client.post("/api/teams", headers=h, json={
            "name": "Late Team", "lead": "Esi Ansah", "members": 1,
            "school_name": school
        }).json()
        assert created_now["provisioned_accounts"] == []

        # Now the email is known; edit the team to add it.
        late_email = f"esi-{uuid.uuid4().hex[:8]}@ntic.test"
        resp = client.patch(f"/api/teams/{team_id}", headers=h, json={
            "name": "Late Team", "lead": "Esi Ansah", "members": 1,
            "lead_email": late_email, "school_name": school
        })
        assert resp.status_code == 200, resp.text
        assert any(p["email"] == late_email for p in resp.json()["provisioned_accounts"])
        # And the account really exists as a student in that institution.
        users = client.get("/api/users", headers=h).json()
        made = next((u for u in users if u["email"] == late_email), None)
        assert made is not None and made["role"] == "student"


class TestSoloEntrantTeams:
    """Open/single entrants are modelled as a team of one (Option B), so mentors
    and LMS auto-enrolment work for them with no separate code path."""

    def _student(self, client, admin_token, name="Solo Runner"):
        from app.security import clear_all_rate_limits
        email = f"solo-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Larabanga-Mosque-64"
        client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                    json={"email": email, "full_name": name,
                          "role": "student", "password": password, "status": "Active"})
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        return login.json()["token"], email

    def _open_cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cid = client.post("/api/competitions", headers=h,
                          json={"title": f"Solo Cycle {uuid.uuid4().hex[:6]}"}).json()["id"]
        client.patch(f"/api/competitions/{cid}", headers=h,
                     json={"title": "x", "status": "registration"})
        return cid

    def test_registering_creates_a_solo_team(self, client, admin_token):
        token, email = self._student(client, admin_token)
        cid = self._open_cycle(client, admin_token)
        sh = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/competitions/register", headers=sh,
                           json={"competition_id": cid})
        assert resp.status_code == 201, resp.text
        solo_id = resp.json()["solo_team_id"]
        assert solo_id
        teams = client.get(f"/api/teams?competition_id={cid}",
                          headers={"Authorization": f"Bearer {admin_token}"}).json()
        solo = next(t for t in teams if t["id"] == solo_id)
        assert solo["isSolo"] is True
        assert solo["members"] == 1

    def test_registering_twice_reuses_the_same_solo_team(self, client, admin_token):
        token, email = self._student(client, admin_token)
        cid = self._open_cycle(client, admin_token)
        sh = {"Authorization": f"Bearer {token}"}
        first = client.post("/api/competitions/register", headers=sh,
                            json={"competition_id": cid}).json()["solo_team_id"]
        client.delete(f"/api/competitions/register/{cid}", headers=sh)
        second = client.post("/api/competitions/register", headers=sh,
                             json={"competition_id": cid}).json()["solo_team_id"]
        assert first == second

    def test_a_solo_team_can_be_auto_assigned_a_mentor(self, client, admin_token):
        from app.security import clear_all_rate_limits
        h = {"Authorization": f"Bearer {admin_token}"}
        token, email = self._student(client, admin_token)
        cid = self._open_cycle(client, admin_token)
        client.post("/api/users", headers=h, json={
            "email": f"si-{uuid.uuid4().hex[:8]}@ntic.test", "full_name": "Solo Mentor",
            "role": "instructor", "password": "Paga-Crocodile-88", "status": "Active"})
        clear_all_rate_limits()
        sh = {"Authorization": f"Bearer {token}"}
        solo_id = client.post("/api/competitions/register", headers=sh,
                             json={"competition_id": cid}).json()["solo_team_id"]
        client.post("/api/teams/auto-assign-mentors", headers=h)
        teams = client.get("/api/teams", headers=h).json()
        solo = next(t for t in teams if t["id"] == solo_id)
        assert solo["mentorId"] is not None

    def test_a_solo_entrant_can_request_a_mentor(self, client, admin_token):
        token, email = self._student(client, admin_token)
        cid = self._open_cycle(client, admin_token)
        sh = {"Authorization": f"Bearer {token}"}
        solo_id = client.post("/api/competitions/register", headers=sh,
                             json={"competition_id": cid}).json()["solo_team_id"]
        resp = client.post(f"/api/teams/{solo_id}/request-mentor", headers=sh)
        assert resp.status_code == 200, resp.text
        assert resp.json()["mentor_status"] == "requested"

    def test_a_solo_entrant_can_find_their_team(self, client, admin_token):
        token, email = self._student(client, admin_token)
        cid = self._open_cycle(client, admin_token)
        sh = {"Authorization": f"Bearer {token}"}
        solo_id = client.post("/api/competitions/register", headers=sh,
                             json={"competition_id": cid}).json()["solo_team_id"]
        mine = client.get("/api/teams/mine", headers=sh).json()
        found = next(t for t in mine if t["id"] == solo_id)
        assert found["isSolo"] is True
        assert found["isLead"] is True

    def test_one_entrant_cannot_request_anothers_mentor(self, client, admin_token):
        from app.security import clear_all_rate_limits
        token_a, _ = self._student(client, admin_token, "Runner A")
        token_b, _ = self._student(client, admin_token, "Runner B")
        cid = self._open_cycle(client, admin_token)
        clear_all_rate_limits()
        sa = {"Authorization": f"Bearer {token_a}"}
        a_solo = client.post("/api/competitions/register", headers=sa,
                            json={"competition_id": cid}).json()["solo_team_id"]
        clear_all_rate_limits()
        sb = {"Authorization": f"Bearer {token_b}"}
        resp = client.post(f"/api/teams/{a_solo}/request-mentor", headers=sb)
        assert resp.status_code == 404, resp.text


class TestCycleCloseAutoAssign:
    """Closing a cycle must not leave any entrant without a mentor."""

    def _instructor(self, client, admin_token, track="coding"):
        from app.security import clear_all_rate_limits
        email = f"ca-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                    json={"email": email, "full_name": "Cycle Instructor",
                          "role": "instructor", "password": "Mole-Park-Elephant-21",
                          "status": "Active", "track": track})
        clear_all_rate_limits()
        return email

    def _cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cid = client.post("/api/competitions", headers=h,
                          json={"title": f"Close Cycle {uuid.uuid4().hex[:6]}"}).json()["id"]
        client.patch(f"/api/competitions/{cid}", headers=h,
                     json={"title": "x", "status": "registration"})
        return cid

    def _close(self, client, admin_token, cid):
        """Walk the legal path registration -> active -> completed."""
        h = {"Authorization": f"Bearer {admin_token}"}
        client.patch(f"/api/competitions/{cid}", headers=h, json={"title": "x", "status": "active"})
        return client.patch(f"/api/competitions/{cid}", headers=h,
                            json={"title": "x", "status": "completed"})

    def test_closing_a_cycle_assigns_mentors_to_unmentored_teams(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        self._instructor(client, admin_token)
        cid = self._cycle(client, admin_token)
        team_id = client.post("/api/teams", headers=h, json={
            "name": f"Need Mentor {uuid.uuid4().hex[:5]}", "track": "coding",
            "competition_id": cid
        }).json()["id"]

        resp = self._close(client, admin_token, cid)
        assert resp.status_code == 200, resp.text
        assert resp.json()["mentors_assigned"] >= 1
        teams = client.get("/api/teams", headers=h).json()
        mine = next(t for t in teams if t["id"] == team_id)
        assert mine["mentorId"] is not None

    def test_closing_a_cycle_does_not_reassign_mentored_teams(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        iemail = self._instructor(client, admin_token)
        users = client.get("/api/users", headers=h).json()
        iid = next(u["id"] for u in users if u["email"] == iemail)
        cid = self._cycle(client, admin_token)
        team_id = client.post("/api/teams", headers=h, json={
            "name": f"Has Mentor {uuid.uuid4().hex[:5]}", "track": "coding",
            "competition_id": cid
        }).json()["id"]
        client.patch(f"/api/teams/{team_id}/mentor", headers=h, json={"mentor_id": iid})

        resp = self._close(client, admin_token, cid)
        assert resp.status_code == 200, resp.text
        teams = client.get("/api/teams", headers=h).json()
        mine = next(t for t in teams if t["id"] == team_id)
        assert mine["mentorId"] == iid


class TestFullHappyPath:
    """One end-to-end journey: institution registers a team -> student gets a
    login -> student logs in, sees their team, requests a mentor -> assigned.

    This is the automated stand-in for the manual click-through: it exercises the
    exact endpoints the institution portal, the student dashboard and the mentor
    flow call, so any wiring gap between them shows up here.
    """

    def test_full_journey(self, client, admin_token):
        from app.security import clear_all_rate_limits
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Happy {uuid.uuid4().hex[:5]}"
        iemail = f"hp-i-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": iemail, "full_name": "Happy Mentor", "role": "instructor",
            "password": "Shai-Hills-Reserve-55", "status": "Active", "track": "coding",
            "organization": school})
        clear_all_rate_limits()

        # 1. Institution creates a team with a lead email. The backend provisions
        #    the student account.
        lead_email = f"hp-s-{uuid.uuid4().hex[:8]}@ntic.test"
        team = client.post("/api/teams", headers=h, json={
            "name": "Happy Squad", "lead": "Efua Mensimah", "lead_email": lead_email,
            "members": 1, "school_name": school, "track": "coding"
        })
        assert team.status_code == 201, team.text
        provisioned = team.json()["provisioned_accounts"]
        assert provisioned and provisioned[0]["email"] == lead_email

        # 2. The institution's portal lists that student.
        sa_email = f"hp-sa-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": sa_email, "full_name": "Happy Admin", "role": "school_admin",
            "password": "Boti-Waterfalls-99", "status": "Active", "organization": school})
        clear_all_rate_limits()
        sa_login = client.post("/api/login", json={"email": sa_email, "password": "Boti-Waterfalls-99"})
        sah = {"Authorization": f"Bearer {sa_login.json()['token']}"}
        roster = client.get("/api/institution/students", headers=sah).json()
        assert any(s["email"] == lead_email for s in roster)

        # 3. The institution issues a login (reset credentials).
        users = client.get("/api/users", headers=h).json()
        sid = next(u["id"] for u in users if u["email"] == lead_email)
        reset = client.post(f"/api/institution/students/{sid}/reset-credentials", headers=sah)
        assert reset.status_code == 200, reset.text
        temp_pw = reset.json()["temporary_password"]

        # 4. The student logs in with the issued credentials.
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": lead_email, "password": temp_pw})
        assert login.status_code == 200, login.text
        sh = {"Authorization": f"Bearer {login.json()['token']}"}

        # 5. The student sees their team.
        mine = client.get("/api/teams/mine", headers=sh).json()
        assert any(t["name"] == "Happy Squad" for t in mine)

        # 6. The student requests a mentor.
        team_id = next(t["id"] for t in mine if t["name"] == "Happy Squad")
        req = client.post(f"/api/teams/{team_id}/request-mentor", headers=sh)
        assert req.status_code == 200, req.text

        # 7. An admin auto-assigns, and the student's team has a mentor.
        client.post("/api/teams/auto-assign-mentors", headers=h)
        teams = client.get("/api/teams", headers=h).json()
        happy = next(t for t in teams if t["id"] == team_id)
        assert happy["mentorId"] is not None
        assert happy["mentorStatus"] == "assigned"


class TestJudgeSeesLmsContext:
    """Option A of joining the grading paths: the judge sees a student's LMS
    coursework as read-only context, without it affecting the judge's score."""

    def test_queue_surfaces_instructor_grades_as_context(self, client, admin_token):
        from app.security import clear_all_rate_limits
        import app.database as db
        h = {"Authorization": f"Bearer {admin_token}"}

        email = f"jc-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": email, "full_name": "Context Student", "role": "student",
            "password": "Kakum-Canopy-Walk-31", "status": "Active"})
        clear_all_rate_limits()
        users = client.get("/api/users", headers=h).json()
        sid = next(u["id"] for u in users if u["email"] == email)
        conn = db.get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO students (id, tenant_id, first_name, last_name, email) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (sid, "default", "Context", "Student", email),
            )
            cur.execute(
                "INSERT INTO lms_courses (id, title, track, status, approval_status) "
                "VALUES ('jc-course', 'Judge Context Course', 'coding', 'active', 'approved')"
            )
            cur.execute(
                "INSERT INTO lms_assignments (id, course_id, title, status, approval_status) "
                "VALUES ('jc-assign', 'jc-course', 'HW 1', 'active', 'approved')"
            )
            cur.execute(
                "INSERT INTO lms_submissions (id, assignment_id, course_id, student_id, "
                "student_name, student_email, score, status) "
                "VALUES ('jc-sub', 'jc-assign', 'jc-course', %s, 'Context Student', %s, 88, 'graded')",
                (sid, email),
            )
            conn.commit()
            cur.close()
        finally:
            db.release_db_connection(conn)

        sub = client.post("/api/submissions", headers=h, json={
            "student_id": sid, "source_code_path": "https://example.com/project.zip",
            "tenant_id": "default"
        }).json()

        queue = client.get("/api/judge/queue", headers=h).json()
        mine = next(s for s in queue["submissions"] if s["id"] == sub["id"])
        ctx = mine.get("lms_context")
        assert ctx is not None
        assert ctx["assignments_submitted"] == 1
        assert ctx["average_score"] == 88
        assert ctx["assignments"][0]["score"] == 88

    def test_judge_score_is_not_derived_from_lms_context(self, client, admin_token):
        # A student with no LMS work gets empty context, and the judge's score is
        # their own input -- lms_context never feeds it.
        from app.security import clear_all_rate_limits
        import app.database as db
        h = {"Authorization": f"Bearer {admin_token}"}
        email = f"jc2-{uuid.uuid4().hex[:8]}@ntic.test"
        client.post("/api/users", headers=h, json={
            "email": email, "full_name": "No LMS Student", "role": "student",
            "password": "Wli-Waterfall-28", "status": "Active"})
        clear_all_rate_limits()
        users = client.get("/api/users", headers=h).json()
        sid = next(u["id"] for u in users if u["email"] == email)
        conn = db.get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO students (id, tenant_id, first_name, last_name, email) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (sid, "default", "No", "LMS", email),
            )
            conn.commit()
            cur.close()
        finally:
            db.release_db_connection(conn)

        sub = client.post("/api/submissions", headers=h, json={
            "student_id": sid, "source_code_path": "z.zip", "tenant_id": "default"
        }).json()
        queue = client.get("/api/judge/queue", headers=h).json()
        mine = next(s for s in queue["submissions"] if s["id"] == sub["id"])
        ctx = mine.get("lms_context") or {}
        assert ctx.get("assignments_submitted") == 0
        assert ctx.get("average_score") is None


class TestForgotPassword:
    """Forgot-password: email -> OTP -> new password, bound to a real account."""

    def _user(self, client, admin_token, name="Forgot User"):
        from app.security import clear_all_rate_limits
        email = f"fp-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Bole-Bamboi-Ferry-42"
        client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                    json={"email": email, "full_name": name, "role": "student",
                          "password": password, "status": "Active"})
        clear_all_rate_limits()
        return email, password

    def _capture_code(self, monkeypatch):
        import app.main as main
        captured = {}
        monkeypatch.setattr(
            main, "_send_brevo_email",
            lambda to, name, subj, html: (captured.update(html=html), True)[1],
        )
        return captured

    def test_full_flow_resets_the_password(self, client, admin_token, monkeypatch):
        import re
        from app.security import clear_all_rate_limits
        email, _old = self._user(client, admin_token)
        captured = self._capture_code(monkeypatch)

        clear_all_rate_limits()
        start = client.post("/api/auth/forgot-password", json={"email": email})
        assert start.status_code == 200, start.text
        challenge_id = start.json()["challenge_id"]
        assert challenge_id

        code = re.search(r">(\d{6})<", captured["html"]).group(1)
        clear_all_rate_limits()
        verify = client.post("/api/otp/verify", json={"challenge_id": challenge_id, "code": code})
        assert verify.status_code == 200, verify.text
        reset_token = verify.json()["reset_token"]
        assert reset_token

        clear_all_rate_limits()
        reset = client.post("/api/auth/forgot-password/reset",
                            json={"reset_token": reset_token, "new_password": "New-Kintampo-Falls-99"})
        assert reset.status_code == 200, reset.text

        # Old password no longer works; the new one does.
        clear_all_rate_limits()
        assert client.post("/api/login", json={"email": email, "password": _old}).status_code == 401
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": "New-Kintampo-Falls-99"})
        assert login.status_code == 200, login.text

    def test_unknown_email_returns_no_usable_challenge(self, client, admin_token, monkeypatch):
        import app.main as main
        sent = {"n": 0}
        monkeypatch.setattr(main, "_send_brevo_email", lambda *a, **k: (sent.update(n=sent["n"] + 1), True)[1])
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        resp = client.post("/api/auth/forgot-password",
                           json={"email": f"ghost-{uuid.uuid4().hex[:8]}@ntic.test"})
        assert resp.status_code == 200
        # The response shape matches a real account (anti-enumeration), but the
        # challenge is fake: no email was sent and it can never be verified.
        body = resp.json()
        assert body["challenge_id"]
        assert body["expires_in"]
        assert sent["n"] == 0
        clear_all_rate_limits()
        verify = client.post("/api/otp/verify",
                             json={"challenge_id": body["challenge_id"], "code": "000000"})
        # Same status as a wrong code on a real account: the fake challenge must
        # be indistinguishable, or the forgot-password flow becomes an oracle.
        assert verify.status_code == 400

    def test_reset_token_cannot_be_reused(self, client, admin_token, monkeypatch):
        import re
        from app.security import clear_all_rate_limits
        email, _ = self._user(client, admin_token)
        captured = self._capture_code(monkeypatch)
        clear_all_rate_limits()
        challenge_id = client.post("/api/auth/forgot-password", json={"email": email}).json()["challenge_id"]
        code = re.search(r">(\d{6})<", captured["html"]).group(1)
        clear_all_rate_limits()
        reset_token = client.post("/api/otp/verify", json={"challenge_id": challenge_id, "code": code}).json()["reset_token"]
        clear_all_rate_limits()
        first = client.post("/api/auth/forgot-password/reset",
                            json={"reset_token": reset_token, "new_password": "First-New-Password-1"})
        assert first.status_code == 200
        clear_all_rate_limits()
        replay = client.post("/api/auth/forgot-password/reset",
                             json={"reset_token": reset_token, "new_password": "Second-New-Password-2"})
        assert replay.status_code == 400, replay.text

    def test_invalid_token_is_rejected(self, client):
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        resp = client.post("/api/auth/forgot-password/reset",
                           json={"reset_token": "x" * 32, "new_password": "Whatever-Password-1"})
        assert resp.status_code == 400, resp.text


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

    def test_bulk_sync_users_handles_conflicts_gracefully(self, client, admin_token):
        resp = client.post("/api/bulk-sync", json={
            "collection": "users",
            "items": [
                {
                    "id": "USR-SYNC-1",
                    "email": "admin@ntic.org.gh",
                    "fullName": "Super Administrator",
                    "role": "super_admin",
                    "status": "Active"
                },
                {
                    "id": "USR-SYNC-2",
                    "email": "newsyncuser@example.com",
                    "fullName": "New Sync User",
                    "role": "student",
                    "status": "Active"
                }
            ]
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "synced"


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

        # Email must be immediately freed for check-availability and re-registration
        avail = client.get(f"/api/auth/check-availability?email={email}").json()
        assert avail["email_taken"] is False

        # Re-creating an account with the same email succeeds without conflict
        recreate_resp = client.post("/api/users", json={
            "email": email,
            "full_name": "Recreated User",
            "role": "student"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert recreate_resp.status_code == 201

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
        # Forgot-password: unauthenticated by definition. Rate limited, and the
        # reset token is only issued after OTP verification, so it cannot reset
        # an account without owning its email.
        ("POST", "/api/auth/forgot-password"),
        ("POST", "/api/auth/forgot-password/reset"),
        ("POST", "/api/drafts"),
        ("POST", "/api/notify/registration-received"),
        # The public registration form filing an application for review. Type is
        # allowlisted, status is forced to 'pending', the id is server-generated
        # and the handler is rate limited per IP. Added deliberately: before it,
        # applications only went to the admin-only POST /api/bulk-sync, so every
        # anonymous application 401'd and no reviewer ever saw it.
        ("POST", "/api/approvals/public"),
        # File/photo upload with IP rate limit and DB storage.
        ("POST", "/api/files/upload"),
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
        # The endpoint refuses with 503 unless a mail transport is configured, so
        # without this the test only passed on machines with a real key in .env
        # and failed in CI -- where a key deliberately does not exist. The
        # outbound call is already faked, so nothing is actually sent.
        monkeypatch.setattr(main.settings, "BREVO_API_KEY", "test-key-not-real", raising=False)
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
        assert resp.status_code == 400

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

    def test_returns_only_the_managed_roles(self, client, admin_token):
        data = self._fetch(client, admin_token)
        roles = {p["role"] for p in data["people"]}
        # Students were added so an administrator can manage every role from one
        # place. Internal/privileged roles stay out: those belong in User
        # Management, and listing them here would mix operational monitoring with
        # privilege administration.
        assert roles <= {"student", "sponsor", "judge", "instructor"}
        assert set(data["summary"]) == {"student", "sponsor", "judge", "instructor"}

    def test_excludes_privileged_roles(self, client, admin_token):
        data = self._fetch(client, admin_token)
        roles = {p["role"] for p in data["people"]}
        assert not roles & {"super_admin", "admin", "support_admin", "content_manager"}

    def test_includes_a_newly_created_student(self, client, admin_token):
        email = self._make_user(client, admin_token, "student", "Roster Student")
        person = self._find(self._fetch(client, admin_token), email)
        assert person is not None
        assert person["role"] == "student"
        # Learning figures start at a real zero, not null: a student genuinely has
        # zero enrolments, whereas a sponsor has no concept of one.
        assert person["courses_enrolled"] == 0
        assert person["work_submitted"] == 0
        assert person["competitions_registered"] == 0

    def test_student_learning_fields_are_null_for_others(self, client, admin_token):
        data = self._fetch(client, admin_token)
        for person in data["people"]:
            if person["role"] != "student":
                assert person["courses_enrolled"] is None
                assert person["average_score"] is None

    def test_sponsor_money_fields_are_null_for_others(self, client, admin_token):
        data = self._fetch(client, admin_token)
        for person in data["people"]:
            if person["role"] != "sponsor":
                assert person["amount_pledged"] is None
                assert person["amount_received"] is None

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
        """The roster must only report what the schema can prove.

        This originally forbade `tier`, `sector`, `expertise` and `track` too, because
        at the time they had no column and existed only in browser localStorage. They
        are real `users` columns now, so serving them is a measurement rather than an
        invention.

        Still forbidden are the fields the old UI displayed that have no column
        anywhere: a sponsor's `package` / `total`, an embedded `payments` array, an
        instructor `portfolio`, and `region`.
        """
        data = self._fetch(client, admin_token)
        forbidden = {"package", "payments", "total", "portfolio", "region"}
        for person in data["people"]:
            leaked = forbidden & set(person)
            assert not leaked, f"roster invented fields with no column: {leaked}"

    def test_reports_role_detail_that_now_has_a_column(self, client, admin_token):
        """Counterpart to the test above: these became real columns, so withholding
        them would hide data the backend genuinely holds."""
        data = self._fetch(client, admin_token)
        for person in data["people"]:
            for field in ("tier", "sector", "expertise", "track"):
                assert field in person

    def test_money_figures_are_strings_not_floats(self, client, admin_token):
        """Sponsor amounts come from NUMERIC columns. Emitting them as JSON floats
        would reintroduce the binary rounding the column type exists to avoid."""
        data = self._fetch(client, admin_token)
        for person in data["people"]:
            if person["role"] == "sponsor":
                assert isinstance(person["amount_pledged"], str)
                assert isinstance(person["amount_received"], str)

    def test_course_ownership_is_no_longer_a_name_guess(self, client, admin_token):
        """Instructor course counts used to match on the free-text `submitted_by`,
        which the LMS Manager hardcoded to 'Admin' -- so a real instructor's courses
        never counted. They now key on owner_id."""
        data = self._fetch(client, admin_token)
        assert data["courses_matched_by_name"] is False

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


class TestIdentityFoundation:
    """One identity, one id.

    Two separate defects made every non-admin account effectively anonymous:

    1. `GET /api/users` is admin-only, but the sidebar, the dashboard greeting,
       the LMS profile and the profile prefill all looked for the signed-in user
       in that list. For a student/judge/sponsor/instructor the lookup failed and
       each surface fell back to a hardcoded fixture -- a real student was
       greeted "Welcome back, Administrator".

    2. `assignment_submissions.student_id` is FK -> `students(id)`, but no
       `students` row was ever created for a normally-registered user, so every
       student submission failed with a 400. The client papered over it with
       `'NTIC-STU-' + Math.random()` *inside a getter*, yielding a different id
       on every read.

    GET /api/users/me is the fix for both: it is callable by every role and it
    provisions a stable `students` row keyed by the user's own id.
    """

    PASSWORD = "Qv4$harbourLine"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _make_user(self, client, admin_token, role="student", name="Adwoa Nyarko"):
        email = f"ident-{uuid.uuid4().hex[:8]}@id.test"
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

    # ── every role can identify itself ──────────────────────────────────

    @pytest.mark.parametrize("role", ["student", "judge", "sponsor", "instructor"])
    def test_every_role_can_read_its_own_identity(self, client, admin_token, role):
        """The bug: these roles cannot call GET /api/users, so without this
        endpoint they had no way to learn their own name."""
        token, email = self._make_user(client, admin_token, role, "Kofi Mensah")
        me = self._me(client, token)
        assert me["email"] == email
        assert me["full_name"] == "Kofi Mensah"
        assert me["role"] == role
        assert me["id"]

    def test_non_admin_still_cannot_list_all_users(self, client, admin_token):
        """/api/users/me must not become a way around the admin-only roster."""
        token, _e = self._make_user(client, admin_token, "student")
        assert client.get("/api/users", headers=self._auth(token)).status_code == 403

    def test_me_exposes_track_for_dashboard_filters(self, client, admin_token):
        """`track` is read by the student LMS profile and the judge dashboard but
        had no column, so those surfaces always saw undefined."""
        token, _e = self._make_user(client, admin_token, "judge", "Yaw Osei")
        assert self._me(client, token)["track"] == ""
        client.patch("/api/users/me", headers=self._auth(token), json={"track": "Robotics"})
        assert self._me(client, token)["track"] == "Robotics"

    # ── stable student id ───────────────────────────────────────────────

    def test_student_gets_a_student_id(self, client, admin_token):
        token, _e = self._make_user(client, admin_token, "student")
        assert self._me(client, token)["student_id"]

    def test_student_id_equals_user_id(self, client, admin_token):
        """Keyed by users.id deliberately, so one id means one person in
        students, assignment_submissions, enrolments, submissions and progress."""
        token, _e = self._make_user(client, admin_token, "student")
        me = self._me(client, token)
        assert me["student_id"] == me["id"]

    def test_student_id_is_stable_across_calls(self, client, admin_token):
        """The regression this locks down: the old client-side id was random per
        read, so progress was written under keys that were never read back."""
        token, _e = self._make_user(client, admin_token, "student")
        first = self._me(client, token)["student_id"]
        for _ in range(3):
            assert self._me(client, token)["student_id"] == first

    def test_provisioning_is_idempotent(self, client, admin_token):
        """Repeated calls must not pile up duplicate students rows."""
        token, email = self._make_user(client, admin_token, "student")
        for _ in range(3):
            self._me(client, token)
        listing = client.get("/api/students", headers=self._auth(token))
        assert listing.status_code == 200
        mine = [s for s in listing.json() if (s.get("email") or "").lower() == email.lower()]
        assert len(mine) == 1

    def test_student_record_carries_the_real_name(self, client, admin_token):
        """students splits into first/last (both NOT NULL); a single full_name
        must not blow up the insert."""
        token, email = self._make_user(client, admin_token, "student", "Akosua Boateng Mensah")
        self._me(client, token)
        listing = client.get("/api/students", headers=self._auth(token)).json()
        mine = next(s for s in listing if (s.get("email") or "").lower() == email.lower())
        assert mine["first_name"] == "Akosua"
        assert mine["last_name"] == "Boateng Mensah"

    def test_single_word_name_still_provisions(self, client, admin_token):
        """last_name is NOT NULL, so a mononym must not fail the insert."""
        token, email = self._make_user(client, admin_token, "student", "Adjoa")
        assert self._me(client, token)["student_id"]
        listing = client.get("/api/students", headers=self._auth(token)).json()
        mine = next(s for s in listing if (s.get("email") or "").lower() == email.lower())
        assert mine["first_name"] == "Adjoa"
        assert mine["last_name"]

    def test_non_students_get_no_student_id(self, client, admin_token):
        """A judge or sponsor is not a learner; provisioning them would pollute
        the students table and inflate every student count."""
        for role in ("judge", "sponsor", "instructor"):
            token, _e = self._make_user(client, admin_token, role)
            assert self._me(client, token)["student_id"] is None

    def test_existing_student_row_is_linked_not_duplicated(self, client, admin_token):
        """An imported/seeded students row for the same email must be adopted,
        not shadowed by a second row."""
        email = f"preexist-{uuid.uuid4().hex[:8]}@id.test"
        created = client.post("/api/students", headers=self._auth(admin_token), json={
            "first_name": "Esi", "last_name": "Owusu", "email": email, "track": "Coding",
        })
        assert created.status_code in (200, 201), created.text
        existing_id = created.json()["id"]

        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": "Esi Owusu", "role": "student",
            "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        token = client.post("/api/login", json={
            "email": email, "password": self.PASSWORD,
        }).json()["token"]

        assert self._me(client, token)["student_id"] == existing_id
        listing = client.get("/api/students", headers=self._auth(token)).json()
        assert len([s for s in listing if (s.get("email") or "").lower() == email.lower()]) == 1

    def test_me_requires_authentication(self, client):
        assert client.get("/api/users/me").status_code == 401

class TestSelfServiceOnboarding:
    """POST /api/approvals/mine -- a user filing their own profile for review.

    The profile-completion page always tried to do this, but it went through
    `contentService.saveApprovals()` -> `POST /api/bulk-sync`, which is
    admin-only. So for the judges and sponsors who actually complete that form the
    write 403'd, the error was discarded by `error: () => {}`, and their
    application never reached the admin queue -- while the UI reported success.
    """

    PASSWORD = "Rk8@lanternWade"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _make_user(self, client, admin_token, role="judge", name="Nana Adjei"):
        email = f"onboard-{uuid.uuid4().hex[:8]}@apr.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role, "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _pending_for(self, client, admin_token, email):
        rows = client.get("/api/approvals", headers=self._auth(admin_token)).json()
        return [r for r in rows if (r.get("contact") or "").lower() == email.lower()]

    def test_judge_onboarding_reaches_the_admin_queue(self, client, admin_token):
        token, email = self._make_user(client, admin_token, "judge")
        assert client.post("/api/approvals/mine", headers=self._auth(token),
                           json={}).status_code == 201
        rows = self._pending_for(client, admin_token, email)
        assert len(rows) == 1
        assert rows[0]["status"] == "pending"

    def test_judge_is_typed_as_judge_not_instructor(self, client, admin_token):
        """The old client sent type 'Instructor Access' for a judge, filing them
        in the wrong queue."""
        token, email = self._make_user(client, admin_token, "judge")
        client.post("/api/approvals/mine", headers=self._auth(token), json={})
        assert self._pending_for(client, admin_token, email)[0]["type"] == "Judge Access"

    def test_sponsor_is_typed_as_sponsor_not_team_addition(self, client, admin_token):
        """The old client sent 'Team Addition' for a sponsor, so sponsor
        onboarding appeared as a request to add a competition team."""
        token, email = self._make_user(client, admin_token, "sponsor")
        client.post("/api/approvals/mine", headers=self._auth(token), json={})
        assert self._pending_for(client, admin_token, email)[0]["type"] == "Sponsor Access"

    def test_instructor_is_typed_as_instructor(self, client, admin_token):
        token, email = self._make_user(client, admin_token, "instructor")
        client.post("/api/approvals/mine", headers=self._auth(token), json={})
        assert self._pending_for(client, admin_token, email)[0]["type"] == "Instructor Access"

    def test_details_come_from_the_saved_profile(self, client, admin_token):
        """The reviewer must see what the applicant actually saved, not whatever
        the client chose to send."""
        token, email = self._make_user(client, admin_token, "sponsor", "Efua Danso")
        client.patch("/api/users/me", headers=self._auth(token), json={
            "organization": "Voltic Ghana", "sector": "Manufacturing",
            "tier": "Gold Partner", "rep_name": "Efua Danso", "phone": "+233201234567",
        })
        client.post("/api/approvals/mine", headers=self._auth(token), json={})
        row = self._pending_for(client, admin_token, email)[0]
        assert row["entity"] == "Voltic Ghana"
        assert row["details"]["sector"] == "Manufacturing"
        assert row["details"]["tier"] == "Gold Partner"
        assert row["details"]["phone"] == "+233201234567"

    def test_identity_cannot_be_forged(self, client, admin_token):
        """Nothing identifying the applicant is read from the body, so extra
        fields cannot redirect the application to another account or role."""
        token, email = self._make_user(client, admin_token, "judge", "Real Judge")
        other = f"victim-{uuid.uuid4().hex[:6]}@apr.test"
        client.post("/api/approvals/mine", headers=self._auth(token), json={
            "notes": "x", "contact": other, "type": "Sponsor Access",
            "entity": "Not Mine", "role": "super_admin",
        })
        row = self._pending_for(client, admin_token, email)[0]
        assert row["type"] == "Judge Access"
        assert row["contact"] == email
        assert not self._pending_for(client, admin_token, other)

    def test_resubmitting_updates_instead_of_duplicating(self, client, admin_token):
        """A reviewer's queue must not fill with copies when someone edits and
        saves their profile repeatedly."""
        token, email = self._make_user(client, admin_token, "judge")
        for _ in range(3):
            assert client.post("/api/approvals/mine", headers=self._auth(token),
                               json={}).status_code == 201
        assert len(self._pending_for(client, admin_token, email)) == 1

    def test_notes_are_stored(self, client, admin_token):
        token, email = self._make_user(client, admin_token, "judge")
        client.post("/api/approvals/mine", headers=self._auth(token),
                    json={"notes": "Available weekends only"})
        row = self._pending_for(client, admin_token, email)[0]
        assert row["details"]["notes"] == "Available weekends only"

    def test_roles_without_onboarding_are_rejected(self, client, admin_token):
        """A student has no onboarding form; letting them file one would put
        meaningless rows in the reviewer's queue."""
        token, _e = self._make_user(client, admin_token, "student")
        resp = client.post("/api/approvals/mine", headers=self._auth(token), json={})
        assert resp.status_code == 400

    def test_requires_authentication(self, client):
        assert client.post("/api/approvals/mine", json={}).status_code == 401

    def test_applicant_cannot_read_the_review_queue(self, client, admin_token):
        """Filing an application must not grant sight of everyone else's."""
        token, _e = self._make_user(client, admin_token, "judge")
        client.post("/api/approvals/mine", headers=self._auth(token), json={})
        assert client.get("/api/approvals", headers=self._auth(token)).status_code == 403

class TestStudentSelfService:
    """The student LMS flow: enrol, see assignments, submit, read the grade.

    None of this worked before:

      * Enrolment did not exist. `lms_enrollments` was writable only via
        admin-only bulk-sync and the one function targeting it had zero call
        sites, so the student course list showed every course on the platform.
      * Submissions could not persist. The client posted to /api/submissions,
        whose student_id is FK -> students(id), sending a ticket string -- so every
        insert 400'd. The fallback went through admin-only bulk-sync and 403'd. A
        success banner was shown either way.
      * Grades could not reach the student: nothing ever read lms_submissions back.
      * Progress took student_id from the request body (anyone could write anyone's
        progress) and GET /api/lms/progress/{id} let any signed-in user read any
        student's progress.
    """

    PASSWORD = "Wm5!pineRidgeCove"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _student(self, client, admin_token, name="Yaa Asantewaa"):
        email = f"stu-{uuid.uuid4().hex[:8]}@lms.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": "student", "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _course(self, client, admin_token, title=None):
        title = title or f"Course {uuid.uuid4().hex[:6]}"
        cid = "crs-" + uuid.uuid4().hex[:8]
        resp = client.post("/api/bulk-sync", headers=self._auth(admin_token), json={
            "collection": "lms_courses",
            "items": [{"id": cid, "title": title, "track": "Coding", "icon": "code",
                       "level": "Intermediate", "description": "d", "modules": 4,
                       "status": "active", "approval_status": "approved"}],
        })
        assert resp.status_code in (200, 201), resp.text
        return cid, title

    def _assignment(self, client, admin_token, course_id, title="Build a parser"):
        aid = "asg-" + uuid.uuid4().hex[:8]
        resp = client.post("/api/bulk-sync", headers=self._auth(admin_token), json={
            "collection": "lms_assignments",
            "items": [{"id": aid, "courseId": course_id, "title": title,
                       "description": "spec", "due_date": "2026-09-01",
                       "maxScore": 100, "track": "Coding", "status": "active",
                       "approval_status": "approved"}],
        })
        assert resp.status_code in (200, 201), resp.text
        return aid

    # ── enrolment ───────────────────────────────────────────────────────

    def test_student_can_enrol(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid, title = self._course(client, admin_token)
        resp = client.post("/api/lms/enrollments", headers=self._auth(token),
                           json={"course_id": cid})
        assert resp.status_code == 201, resp.text
        assert resp.json()["course_title"] == title

    def test_my_enrollments_shows_only_my_courses(self, client, admin_token):
        """The regression: the student list showed every course on the platform."""
        token, _e = self._student(client, admin_token)
        mine, _t = self._course(client, admin_token)
        self._course(client, admin_token)  # someone else's course
        client.post("/api/lms/enrollments", headers=self._auth(token), json={"course_id": mine})
        rows = client.get("/api/lms/my-enrollments", headers=self._auth(token)).json()
        assert [r["course_id"] for r in rows] == [mine]

    def test_enrolling_twice_does_not_duplicate(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        for _ in range(3):
            client.post("/api/lms/enrollments", headers=self._auth(token), json={"course_id": cid})
        rows = client.get("/api/lms/my-enrollments", headers=self._auth(token)).json()
        assert len([r for r in rows if r["course_id"] == cid]) == 1

    def test_enrolment_updates_the_course_count(self, client, admin_token):
        """`enrolled` is shown to instructors, so it must not drift."""
        token, _e = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        resp = client.post("/api/lms/enrollments", headers=self._auth(token),
                           json={"course_id": cid})
        assert resp.json()["enrolled_total"] == 1
        courses = client.get("/api/lms-courses", headers=self._auth(token)).json()
        assert next(c for c in courses if c["id"] == cid)["enrolled"] == 1

    def test_withdrawing_removes_it_from_my_list(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        client.post("/api/lms/enrollments", headers=self._auth(token), json={"course_id": cid})
        assert client.delete(f"/api/lms/enrollments/{cid}",
                             headers=self._auth(token)).status_code == 200
        rows = client.get("/api/lms/my-enrollments", headers=self._auth(token)).json()
        assert cid not in [r["course_id"] for r in rows]

    def test_withdrawing_when_not_enrolled_is_404(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        assert client.delete(f"/api/lms/enrollments/{cid}",
                             headers=self._auth(token)).status_code == 404

    def test_cannot_enrol_on_unknown_course(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        assert client.post("/api/lms/enrollments", headers=self._auth(token),
                           json={"course_id": "does-not-exist"}).status_code == 404

    def test_non_student_cannot_enrol(self, client, admin_token):
        """A judge or sponsor is not a learner; enrolling them would corrupt every
        course roster and student count."""
        cid, _t = self._course(client, admin_token)
        for role in ("judge", "sponsor"):
            email = f"nonstu-{uuid.uuid4().hex[:6]}@lms.test"
            client.post("/api/users", headers=self._auth(admin_token), json={
                "email": email, "full_name": "Not A Student", "role": role,
                "password": self.PASSWORD,
            })
            from app.security import clear_all_rate_limits
            clear_all_rate_limits()
            tok = client.post("/api/login", json={
                "email": email, "password": self.PASSWORD}).json()["token"]
            assert client.post("/api/lms/enrollments", headers=self._auth(tok),
                               json={"course_id": cid}).status_code == 403

    def test_enrolment_requires_authentication(self, client):
        assert client.post("/api/lms/enrollments", json={"course_id": "x"}).status_code == 401

    # ── assignments ─────────────────────────────────────────────────────

    def test_student_can_see_assignments_for_a_course(self, client, admin_token):
        """Students previously had no way to know what to submit -- the assignment
        list lived only in localStorage with no GET endpoint."""
        token, _e = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        self._assignment(client, admin_token, cid, "Write a lexer")
        rows = client.get(f"/api/lms/assignments?course_id={cid}",
                          headers=self._auth(token)).json()
        assert [r["title"] for r in rows] == ["Write a lexer"]
        assert rows[0]["max_score"] == 100

    def test_assignment_list_is_scoped_by_course(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        a_course, _ = self._course(client, admin_token)
        b_course, _ = self._course(client, admin_token)
        self._assignment(client, admin_token, a_course, "A task")
        self._assignment(client, admin_token, b_course, "B task")
        rows = client.get(f"/api/lms/assignments?course_id={a_course}",
                          headers=self._auth(token)).json()
        assert [r["title"] for r in rows] == ["A task"]

    # ── submitting ──────────────────────────────────────────────────────

    def _enrolled_student_with_assignment(self, client, admin_token):
        token, email = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        aid = self._assignment(client, admin_token, cid)
        client.post("/api/lms/enrollments", headers=self._auth(token), json={"course_id": cid})
        return token, email, cid, aid

    def test_submission_persists(self, client, admin_token):
        """The whole point: before this, every student submission was silently
        discarded behind a success banner."""
        token, _e, _c, aid = self._enrolled_student_with_assignment(client, admin_token)
        resp = client.post("/api/lms/submissions", headers=self._auth(token), json={
            "assignment_id": aid, "content": "my answer", "url": "https://git.test/x",
        })
        assert resp.status_code == 201, resp.text
        rows = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()
        assert len(rows) == 1
        assert rows[0]["content"] == "my answer"
        assert rows[0]["status"] == "submitted"

    def test_submission_requires_enrolment(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid, _t = self._course(client, admin_token)
        aid = self._assignment(client, admin_token, cid)
        resp = client.post("/api/lms/submissions", headers=self._auth(token),
                           json={"assignment_id": aid, "content": "x"})
        assert resp.status_code == 403

    def test_empty_submission_is_rejected(self, client, admin_token):
        token, _e, _c, aid = self._enrolled_student_with_assignment(client, admin_token)
        resp = client.post("/api/lms/submissions", headers=self._auth(token),
                           json={"assignment_id": aid, "content": "   ", "url": ""})
        assert resp.status_code == 422

    def test_unknown_assignment_is_404(self, client, admin_token):
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        assert client.post("/api/lms/submissions", headers=self._auth(token),
                           json={"assignment_id": "nope", "content": "x"}).status_code == 404

    def test_resubmitting_replaces_rather_than_duplicating(self, client, admin_token):
        token, _e, _c, aid = self._enrolled_student_with_assignment(client, admin_token)
        client.post("/api/lms/submissions", headers=self._auth(token),
                    json={"assignment_id": aid, "content": "first"})
        client.post("/api/lms/submissions", headers=self._auth(token),
                    json={"assignment_id": aid, "content": "second"})
        rows = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()
        assert len(rows) == 1
        assert rows[0]["content"] == "second"

    def test_resubmitting_clears_a_previous_grade(self, client, admin_token):
        """Otherwise a student could be marked, resubmit different work, and keep
        the old score while the instructor never saw the change."""
        token, _e, _c, aid = self._enrolled_student_with_assignment(client, admin_token)
        client.post("/api/lms/submissions", headers=self._auth(token),
                    json={"assignment_id": aid, "content": "first"})
        sub_id = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()[0]["id"]
        client.post("/api/bulk-sync", headers=self._auth(admin_token), json={
            "collection": "lms_submissions",
            "items": [{"id": sub_id, "assignmentId": aid, "score": 88,
                       "status": "graded", "feedback": "Good"}],
        })
        graded = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()[0]
        assert graded["score"] == 88

        client.post("/api/lms/submissions", headers=self._auth(token),
                    json={"assignment_id": aid, "content": "revised"})
        after = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()[0]
        assert after["score"] is None
        assert after["status"] == "submitted"
        assert not after["feedback"]

    # ── grades reaching the student ──────────────────────────────────────

    def test_student_can_read_score_and_feedback(self, client, admin_token):
        """This path did not exist: lms_submissions had no GET endpoint, so a mark
        and written feedback were invisible to the student they were for."""
        token, _e, _c, aid = self._enrolled_student_with_assignment(client, admin_token)
        client.post("/api/lms/submissions", headers=self._auth(token),
                    json={"assignment_id": aid, "content": "answer"})
        sub_id = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()[0]["id"]
        client.post("/api/bulk-sync", headers=self._auth(admin_token), json={
            "collection": "lms_submissions",
            "items": [{"id": sub_id, "assignmentId": aid, "score": 74,
                       "status": "graded", "feedback": "Solid, tighten the parser."}],
        })
        row = client.get("/api/lms/my-submissions", headers=self._auth(token)).json()[0]
        assert row["score"] == 74
        assert row["feedback"] == "Solid, tighten the parser."
        assert row["assignment_title"]

    def test_my_submissions_shows_only_mine(self, client, admin_token):
        a_token, _ae, _ac, a_aid = self._enrolled_student_with_assignment(client, admin_token)
        b_token, _be, _bc, b_aid = self._enrolled_student_with_assignment(client, admin_token)
        client.post("/api/lms/submissions", headers=self._auth(a_token),
                    json={"assignment_id": a_aid, "content": "A work"})
        client.post("/api/lms/submissions", headers=self._auth(b_token),
                    json={"assignment_id": b_aid, "content": "B work"})
        rows = client.get("/api/lms/my-submissions", headers=self._auth(a_token)).json()
        assert [r["content"] for r in rows] == ["A work"]

    # ── progress ────────────────────────────────────────────────────────

    def test_progress_round_trips(self, client, admin_token):
        """Progress was write-only: reads came from localStorage under a random
        client-generated key, so it never survived a new device."""
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        courses = client.get("/api/lms/my-enrollments", headers=self._auth(token)).json()
        title = courses[0]["title"]
        assert client.post("/api/lms/progress", headers=self._auth(token), json={
            "course_title": title, "progress_pct": 60, "completed_modules": 3,
        }).status_code == 200
        rows = client.get("/api/lms/my-progress", headers=self._auth(token)).json()
        assert rows[0]["progress_pct"] == 60
        assert rows[0]["completed_modules"] == 3

    def test_progress_shows_on_my_enrollments(self, client, admin_token):
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        title = client.get("/api/lms/my-enrollments", headers=self._auth(token)).json()[0]["title"]
        client.post("/api/lms/progress", headers=self._auth(token), json={
            "course_title": title, "progress_pct": 45, "completed_modules": 2,
        })
        row = client.get("/api/lms/my-enrollments", headers=self._auth(token)).json()[0]
        assert row["progress_pct"] == 45
        assert row["completed_modules"] == 2

    def test_progress_ignores_a_student_id_in_the_body(self, client, admin_token):
        """The hole: student_id came from the body, so anyone could write progress
        onto another student's record."""
        victim_token, _ve, _vc, _va = self._enrolled_student_with_assignment(client, admin_token)
        victim_id = client.get("/api/users/me", headers=self._auth(victim_token)).json()["student_id"]
        attacker_token, _ae, _ac, _aa = self._enrolled_student_with_assignment(client, admin_token)

        client.post("/api/lms/progress", headers=self._auth(attacker_token), json={
            "student_id": victim_id, "course_title": "Injected", "progress_pct": 99,
        })
        victim_rows = client.get("/api/lms/my-progress", headers=self._auth(victim_token)).json()
        assert "Injected" not in [r["course_title"] for r in victim_rows]
        attacker_rows = client.get("/api/lms/my-progress", headers=self._auth(attacker_token)).json()
        assert "Injected" in [r["course_title"] for r in attacker_rows]

    def test_progress_percentage_is_clamped(self, client, admin_token):
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        client.post("/api/lms/progress", headers=self._auth(token), json={
            "course_title": "Clamp me", "progress_pct": 5000,
        })
        row = next(r for r in client.get("/api/lms/my-progress",
                                        headers=self._auth(token)).json()
                   if r["course_title"] == "Clamp me")
        assert row["progress_pct"] == 100

    def test_progress_rejects_non_numeric(self, client, admin_token):
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        assert client.post("/api/lms/progress", headers=self._auth(token), json={
            "course_title": "x", "progress_pct": "lots",
        }).status_code == 422

    def test_cannot_read_another_students_progress(self, client, admin_token):
        """Was a plain IDOR: any signed-in user could read any student's progress
        by putting their id in the path."""
        victim_token, _ve, _vc, _va = self._enrolled_student_with_assignment(client, admin_token)
        victim_id = client.get("/api/users/me", headers=self._auth(victim_token)).json()["student_id"]
        nosy_token, _ne = self._student(client, admin_token)
        resp = client.get(f"/api/lms/progress/{victim_id}", headers=self._auth(nosy_token))
        assert resp.status_code == 403

    def test_student_can_read_their_own_progress_by_id(self, client, admin_token):
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        my_id = client.get("/api/users/me", headers=self._auth(token)).json()["student_id"]
        assert client.get(f"/api/lms/progress/{my_id}",
                          headers=self._auth(token)).status_code == 200

    def test_staff_may_read_a_students_progress(self, client, admin_token):
        """Instructors legitimately need this for their course roster."""
        token, _e, _c, _a = self._enrolled_student_with_assignment(client, admin_token)
        my_id = client.get("/api/users/me", headers=self._auth(token)).json()["student_id"]
        assert client.get(f"/api/lms/progress/{my_id}",
                          headers=self._auth(admin_token)).status_code == 200

class TestCompetitionRegistration:
    """Student sign-up for a competition cycle.

    registerStudentForCycle() was one line in the frontend --
    `this.studentRegisteredMap[comp.id] = true` -- with no HTTP call, no storage and
    no table. A student pressed "Register Squad", got a REGISTERED badge, and lost
    it on refresh. No organiser ever saw the sign-up.
    """

    PASSWORD = "Jd3^cobaltFerry"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _student(self, client, admin_token, name="Kojo Antwi"):
        email = f"creg-{uuid.uuid4().hex[:8]}@comp.test"
        client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": "student", "password": self.PASSWORD,
        })
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _competition(self, client, admin_token, status_value="registration"):
        # POST /api/competitions generates its own id and ignores one in the body,
        # so use whatever it returns.
        resp = client.post("/api/competitions", headers=self._auth(admin_token), json={
            "title": f"Cycle {uuid.uuid4().hex[:4]}", "description": "d",
            "track": "Coding", "status": status_value,
        })
        assert resp.status_code in (200, 201), resp.text
        return resp.json()["id"]

    def test_registration_persists(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token)
        assert client.post("/api/competitions/register", headers=self._auth(token),
                           json={"competition_id": cid}).status_code == 201
        rows = client.get("/api/competitions/my-registrations", headers=self._auth(token)).json()
        assert [r["competition_id"] for r in rows] == [cid]

    def test_registering_twice_does_not_duplicate(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token)
        for _ in range(3):
            client.post("/api/competitions/register", headers=self._auth(token),
                        json={"competition_id": cid})
        rows = client.get("/api/competitions/my-registrations", headers=self._auth(token)).json()
        assert len([r for r in rows if r["competition_id"] == cid]) == 1

    def test_organiser_sees_the_registration(self, client, admin_token):
        """The point of persisting it: somebody has to be able to run the event."""
        token, email = self._student(client, admin_token, "Adjoa Mensimah")
        cid = self._competition(client, admin_token)
        client.post("/api/competitions/register", headers=self._auth(token),
                    json={"competition_id": cid})
        rows = client.get(f"/api/competitions/{cid}/registrations",
                          headers=self._auth(admin_token)).json()
        assert len(rows) == 1
        assert rows[0]["student_email"] == email
        assert rows[0]["student_name"] == "Adjoa Mensimah"

    def test_withdrawing_removes_it(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token)
        client.post("/api/competitions/register", headers=self._auth(token),
                    json={"competition_id": cid})
        assert client.delete(f"/api/competitions/register/{cid}",
                             headers=self._auth(token)).status_code == 200
        rows = client.get("/api/competitions/my-registrations", headers=self._auth(token)).json()
        assert cid not in [r["competition_id"] for r in rows]
        organiser = client.get(f"/api/competitions/{cid}/registrations",
                               headers=self._auth(admin_token)).json()
        assert organiser == []

    def test_can_re_register_after_withdrawing(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token)
        client.post("/api/competitions/register", headers=self._auth(token),
                    json={"competition_id": cid})
        client.delete(f"/api/competitions/register/{cid}", headers=self._auth(token))
        assert client.post("/api/competitions/register", headers=self._auth(token),
                           json={"competition_id": cid}).status_code == 201
        rows = client.get("/api/competitions/my-registrations", headers=self._auth(token)).json()
        assert cid in [r["competition_id"] for r in rows]

    def test_withdrawing_when_not_registered_is_404(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token)
        assert client.delete(f"/api/competitions/register/{cid}",
                             headers=self._auth(token)).status_code == 404

    def test_unknown_competition_is_404(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        assert client.post("/api/competitions/register", headers=self._auth(token),
                           json={"competition_id": "nope"}).status_code == 404

    def test_cannot_register_for_a_draft_cycle(self, client, admin_token):
        """Draft cycles are not public; registering for one would leak unreleased
        events into a student's schedule."""
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token, status_value="draft")
        assert client.post("/api/competitions/register", headers=self._auth(token),
                           json={"competition_id": cid}).status_code == 409

    def test_cannot_register_for_a_completed_cycle(self, client, admin_token):
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token, status_value="completed")
        assert client.post("/api/competitions/register", headers=self._auth(token),
                           json={"competition_id": cid}).status_code == 409

    def test_non_student_cannot_register(self, client, admin_token):
        cid = self._competition(client, admin_token)
        email = f"nonstu-{uuid.uuid4().hex[:6]}@comp.test"
        client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": "A Judge", "role": "judge",
            "password": self.PASSWORD,
        })
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        tok = client.post("/api/login", json={
            "email": email, "password": self.PASSWORD}).json()["token"]
        assert client.post("/api/competitions/register", headers=self._auth(tok),
                           json={"competition_id": cid}).status_code == 403

    def test_my_registrations_shows_only_mine(self, client, admin_token):
        a_token, _ae = self._student(client, admin_token)
        b_token, _be = self._student(client, admin_token)
        a_cycle = self._competition(client, admin_token)
        b_cycle = self._competition(client, admin_token)
        client.post("/api/competitions/register", headers=self._auth(a_token),
                    json={"competition_id": a_cycle})
        client.post("/api/competitions/register", headers=self._auth(b_token),
                    json={"competition_id": b_cycle})
        rows = client.get("/api/competitions/my-registrations", headers=self._auth(a_token)).json()
        assert [r["competition_id"] for r in rows] == [a_cycle]

    def test_students_cannot_read_the_full_roster(self, client, admin_token):
        """A student must not be able to enumerate every other entrant's email."""
        token, _e = self._student(client, admin_token)
        cid = self._competition(client, admin_token)
        client.post("/api/competitions/register", headers=self._auth(token),
                    json={"competition_id": cid})
        assert client.get(f"/api/competitions/{cid}/registrations",
                          headers=self._auth(token)).status_code == 403

    def test_registration_requires_authentication(self, client):
        assert client.post("/api/competitions/register",
                           json={"competition_id": "x"}).status_code == 401

class TestInstructorAuthoring:
    """Instructor authoring, rostering, grading and moderation.

    The instructor had a full CRUD interface at /lms-manager in which NOTHING
    persisted: every save went through POST /api/bulk-sync (require_admin), so each
    write 403'd and ContentService swallowed the error with `error: () => {}`. The
    UI reported success while the data lived only in that browser's localStorage.

    Three further defects covered here:
      * `submitted_by` was hardcoded to the literal 'Admin' on create, so content an
        instructor made never matched their own "My Courses" filter.
      * `submitted_by` AND `approval_status` were accepted from the request body, so
        authorship could be forged and content self-published without review.
      * Grading mutated a local object; the student had no way to see the mark.
    """

    PASSWORD = "Hy7&quarryBend"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _user(self, client, admin_token, role, name):
        email = f"{role}-{uuid.uuid4().hex[:8]}@auth.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role, "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _instructor(self, client, admin_token, name="Efua Mensah"):
        return self._user(client, admin_token, "instructor", name)

    def _course(self, client, token, title=None):
        resp = client.post("/api/lms/courses", headers=self._auth(token), json={
            "title": title or f"Course {uuid.uuid4().hex[:6]}", "track": "Coding",
            "level": "Intermediate", "description": "d", "modules": 4,
        })
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    # ── authoring persists ──────────────────────────────────────────────

    def test_instructor_can_create_a_course_that_persists(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token, "Graph Algorithms")
        rows = client.get("/api/lms/my-courses", headers=self._auth(token)).json()
        assert [c["id"] for c in rows] == [course_id]
        assert rows[0]["title"] == "Graph Algorithms"

    def test_authorship_is_the_real_instructor(self, client, admin_token):
        """The bug: submitted_by was hardcoded to 'Admin', so an instructor's own
        content never appeared in their own list."""
        unique = f"Author {uuid.uuid4().hex[:8]}"
        token, _e = self._instructor(client, admin_token, unique)
        self._course(client, token)
        courses = client.get("/api/lms-courses", headers=self._auth(token)).json()
        mine = [c for c in courses if c["submitted_by"] == unique]
        assert len(mine) == 1

    def test_my_courses_shows_only_my_own(self, client, admin_token):
        a_token, _a = self._instructor(client, admin_token, "Author A")
        b_token, _b = self._instructor(client, admin_token, "Author B")
        a_course = self._course(client, a_token)
        self._course(client, b_token)
        rows = client.get("/api/lms/my-courses", headers=self._auth(a_token)).json()
        assert [c["id"] for c in rows] == [a_course]

    def test_instructor_can_edit_their_own_course(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        resp = client.patch(f"/api/lms/courses/{course_id}", headers=self._auth(token), json={
            "title": "Renamed", "track": "AI", "level": "Advanced",
            "description": "new", "modules": 6,
        })
        assert resp.status_code == 200, resp.text
        row = client.get("/api/lms/my-courses", headers=self._auth(token)).json()[0]
        assert row["title"] == "Renamed"
        assert row["modules"] == 6

    def test_instructor_cannot_edit_someone_elses_course(self, client, admin_token):
        a_token, _a = self._instructor(client, admin_token, "Author A")
        b_token, _b = self._instructor(client, admin_token, "Author B")
        a_course = self._course(client, a_token)
        resp = client.patch(f"/api/lms/courses/{a_course}", headers=self._auth(b_token), json={
            "title": "Hijacked", "modules": 1,
        })
        assert resp.status_code == 403

    def test_instructor_cannot_delete_someone_elses_course(self, client, admin_token):
        a_token, _a = self._instructor(client, admin_token, "Author A")
        b_token, _b = self._instructor(client, admin_token, "Author B")
        a_course = self._course(client, a_token)
        assert client.delete(f"/api/lms/courses/{a_course}",
                             headers=self._auth(b_token)).status_code == 403

    def test_instructor_can_delete_their_own_empty_course(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        assert client.delete(f"/api/lms/courses/{course_id}",
                             headers=self._auth(token)).status_code == 200
        assert client.get("/api/lms/my-courses", headers=self._auth(token)).json() == []

    def test_students_cannot_author_courses(self, client, admin_token):
        token, _e = self._user(client, admin_token, "student", "A Student")
        assert client.post("/api/lms/courses", headers=self._auth(token),
                           json={"title": "Mine now"}).status_code == 403

    # ── review is mandatory and cannot be self-served ───────────────────

    def test_instructor_content_starts_pending(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        resp = client.post("/api/lms/courses", headers=self._auth(token),
                           json={"title": "Needs review"})
        assert resp.json()["approval_status"] == "pending"

    def test_staff_content_is_published_directly(self, client, admin_token):
        resp = client.post("/api/lms/courses", headers=self._auth(admin_token),
                           json={"title": "Staff course"})
        assert resp.json()["approval_status"] == "approved"

    def test_instructor_cannot_self_publish_via_the_body(self, client, admin_token):
        """The hole: approval_status came from the request body, so an instructor
        could publish their own course without review."""
        token, _e = self._instructor(client, admin_token)
        resp = client.post("/api/lms-courses", headers=self._auth(token), json={
            "title": "Sneaky", "approval_status": "approved", "submitted_by": "Admin",
        })
        assert resp.status_code == 201
        assert resp.json()["approval_status"] == "pending"

    def test_authorship_cannot_be_forged_via_the_body(self, client, admin_token):
        token, _e = self._instructor(client, admin_token, "Real Author")
        client.post("/api/lms-courses", headers=self._auth(token), json={
            "title": "Forged", "submitted_by": "Someone Else",
        })
        rows = client.get("/api/lms/my-courses", headers=self._auth(token)).json()
        assert [c["title"] for c in rows] == ["Forged"]

    def test_reviewer_cannot_approve_their_own_content(self, client, admin_token):
        """An instructor was shown the shared admin approvals queue with no owner
        scoping, so they could approve their own submission."""
        # An admin authors a course, then tries to review it themselves.
        resp = client.post("/api/lms/courses", headers=self._auth(admin_token),
                           json={"title": "Self review"})
        course_id = resp.json()["id"]
        moderated = client.patch(f"/api/lms/courses/{course_id}/moderate",
                                 headers=self._auth(admin_token),
                                 json={"approve": True})
        assert moderated.status_code == 403

    def test_another_reviewer_can_approve(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        resp = client.patch(f"/api/lms/courses/{course_id}/moderate",
                            headers=self._auth(admin_token), json={"approve": True})
        assert resp.status_code == 200
        assert resp.json()["approval_status"] == "approved"

    def test_rejection_requires_a_reason(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        assert client.patch(f"/api/lms/courses/{course_id}/moderate",
                            headers=self._auth(admin_token),
                            json={"approve": False, "reason": "  "}).status_code == 422

    def test_rejection_reason_reaches_the_author(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        client.patch(f"/api/lms/courses/{course_id}/moderate",
                     headers=self._auth(admin_token),
                     json={"approve": False, "reason": "Add worked examples"})
        row = client.get("/api/lms/my-courses", headers=self._auth(token)).json()[0]
        assert row["approval_status"] == "rejected"
        assert row["rejection_reason"] == "Add worked examples"

    def test_moderation_queue_excludes_own_submissions(self, client, admin_token):
        own = client.post("/api/lms/courses", headers=self._auth(admin_token),
                          json={"title": "My own"}).json()["id"]
        client.patch(f"/api/lms/courses/{own}", headers=self._auth(admin_token),
                     json={"title": "My own", "modules": 1})
        token, _e = self._instructor(client, admin_token)
        theirs = self._course(client, token)
        queue = client.get("/api/lms/moderation-queue", headers=self._auth(admin_token)).json()
        ids = [c["id"] for c in queue]
        assert theirs in ids
        assert own not in ids

    def test_students_cannot_see_unapproved_courses(self, client, admin_token):
        """Pending content must not leak to learners."""
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        student_token, _s = self._user(client, admin_token, "student", "A Learner")
        resp = client.post("/api/lms/enrollments", headers=self._auth(student_token),
                           json={"course_id": course_id})
        assert resp.status_code == 409

    # ── modules / materials / assignments ───────────────────────────────

    def test_modules_persist_and_read_back(self, client, admin_token):
        """These tables existed and were indexed but had no endpoint at all."""
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        resp = client.post("/api/lms/modules", headers=self._auth(token), json={
            "course_id": course_id, "title": "Dijkstra", "order_num": 1,
        })
        assert resp.status_code == 201, resp.text
        client.patch(f"/api/lms/courses/{course_id}/moderate",
                     headers=self._auth(admin_token), json={"approve": True})
        rows = client.get(f"/api/lms/modules?course_id={course_id}",
                          headers=self._auth(admin_token)).json()
        assert [m["title"] for m in rows] == ["Dijkstra"]

    def test_cannot_add_a_module_to_another_authors_course(self, client, admin_token):
        a_token, _a = self._instructor(client, admin_token, "Author A")
        b_token, _b = self._instructor(client, admin_token, "Author B")
        a_course = self._course(client, a_token)
        assert client.post("/api/lms/modules", headers=self._auth(b_token), json={
            "course_id": a_course, "title": "Intruder",
        }).status_code == 403

    def test_materials_persist(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        resp = client.post("/api/lms/materials", headers=self._auth(token), json={
            "course_id": course_id, "title": "Slides", "type": "link",
            "url": "https://x.test/s.pdf",
        })
        assert resp.status_code == 201, resp.text

    def test_assignments_persist_and_students_can_see_them(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        resp = client.post("/api/lms/assignments", headers=self._auth(token), json={
            "course_id": course_id, "title": "Implement BFS", "max_score": 50,
        })
        assert resp.status_code == 201, resp.text
        client.patch(f"/api/lms/courses/{course_id}/moderate",
                     headers=self._auth(admin_token), json={"approve": True})
        rows = client.get(f"/api/lms/assignments?course_id={course_id}",
                          headers=self._auth(admin_token)).json()
        assert rows[0]["max_score"] == 50

    def test_cannot_delete_an_assignment_with_submissions(self, client, admin_token):
        """Deleting it would orphan work a student already handed in."""
        token, email, course_id, assignment_id, student_token = \
            self._course_with_submission(client, admin_token)
        resp = client.delete(f"/api/lms/assignments/{assignment_id}", headers=self._auth(token))
        assert resp.status_code == 409

    # ── roster ──────────────────────────────────────────────────────────

    def _course_with_submission(self, client, admin_token):
        token, email = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        assignment = client.post("/api/lms/assignments", headers=self._auth(token), json={
            "course_id": course_id, "title": "Task", "max_score": 100,
        }).json()["id"]
        client.patch(f"/api/lms/courses/{course_id}/moderate",
                     headers=self._auth(admin_token), json={"approve": True})
        student_token, _s = self._user(client, admin_token, "student", "Ama Serwaa")
        client.post("/api/lms/enrollments", headers=self._auth(student_token),
                    json={"course_id": course_id})
        client.post("/api/lms/submissions", headers=self._auth(student_token),
                    json={"assignment_id": assignment, "content": "my work"})
        return token, email, course_id, assignment, student_token

    def test_instructor_sees_the_enrolled_roster(self, client, admin_token):
        """The "Students" tab read lmsEnrollments, which defaults to [] and had no
        backend GET -- permanently empty."""
        token, _e, course_id, _a, _st = self._course_with_submission(client, admin_token)
        rows = client.get(f"/api/lms/courses/{course_id}/students",
                          headers=self._auth(token)).json()
        assert len(rows) == 1
        assert rows[0]["student_name"] == "Ama Serwaa"
        assert rows[0]["submissions"] == 1

    def test_roster_is_owner_scoped(self, client, admin_token):
        token, _e, course_id, _a, _st = self._course_with_submission(client, admin_token)
        other_token, _o = self._instructor(client, admin_token, "Nosy Author")
        assert client.get(f"/api/lms/courses/{course_id}/students",
                          headers=self._auth(other_token)).status_code == 403

    def test_my_courses_reports_real_counts(self, client, admin_token):
        token, _e, course_id, _a, _st = self._course_with_submission(client, admin_token)
        row = next(c for c in client.get("/api/lms/my-courses",
                                        headers=self._auth(token)).json()
                   if c["id"] == course_id)
        assert row["enrolled_count"] == 1
        assert row["assignment_count"] == 1
        assert row["awaiting_grading"] == 1

    # ── grading reaches the student ─────────────────────────────────────

    def test_grading_queue_shows_real_student_work(self, client, admin_token):
        token, _e, course_id, _a, _st = self._course_with_submission(client, admin_token)
        queue = client.get("/api/lms/grading-queue", headers=self._auth(token)).json()
        assert len(queue) == 1
        assert queue[0]["content"] == "my work"
        assert queue[0]["student_name"] == "Ama Serwaa"

    def test_grading_queue_is_owner_scoped(self, client, admin_token):
        self._course_with_submission(client, admin_token)
        other_token, _o = self._instructor(client, admin_token, "Other Author")
        assert client.get("/api/lms/grading-queue", headers=self._auth(other_token)).json() == []

    def test_grade_reaches_the_student(self, client, admin_token):
        """The whole point. gradeLmsSubmission() mutated a local object and pushed it
        through admin-only bulk-sync, so the mark never left the browser -- and no
        read path existed for the student anyway."""
        token, _e, _c, _a, student_token = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        resp = client.patch(f"/api/lms/submissions/{submission_id}/grade",
                            headers=self._auth(token),
                            json={"score": 82, "feedback": "Clear and efficient."})
        assert resp.status_code == 200, resp.text
        student_view = client.get("/api/lms/my-submissions",
                                  headers=self._auth(student_token)).json()[0]
        assert student_view["score"] == 82
        assert student_view["feedback"] == "Clear and efficient."

    def test_graded_work_leaves_the_queue(self, client, admin_token):
        token, _e, _c, _a, _st = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        client.patch(f"/api/lms/submissions/{submission_id}/grade",
                     headers=self._auth(token), json={"score": 70})
        assert client.get("/api/lms/grading-queue", headers=self._auth(token)).json() == []

    def test_cannot_grade_work_on_another_authors_course(self, client, admin_token):
        token, _e, _c, _a, _st = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        other_token, _o = self._instructor(client, admin_token, "Other Author")
        assert client.patch(f"/api/lms/submissions/{submission_id}/grade",
                            headers=self._auth(other_token),
                            json={"score": 100}).status_code == 403

    def test_score_cannot_exceed_the_assignment_maximum(self, client, admin_token):
        token, _e = self._instructor(client, admin_token)
        course_id = self._course(client, token)
        assignment = client.post("/api/lms/assignments", headers=self._auth(token), json={
            "course_id": course_id, "title": "Small task", "max_score": 20,
        }).json()["id"]
        client.patch(f"/api/lms/courses/{course_id}/moderate",
                     headers=self._auth(admin_token), json={"approve": True})
        student_token, _s = self._user(client, admin_token, "student", "Learner")
        client.post("/api/lms/enrollments", headers=self._auth(student_token),
                    json={"course_id": course_id})
        client.post("/api/lms/submissions", headers=self._auth(student_token),
                    json={"assignment_id": assignment, "content": "w"})
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        resp = client.patch(f"/api/lms/submissions/{submission_id}/grade",
                            headers=self._auth(token), json={"score": 95})
        assert resp.status_code == 422
        assert "20" in resp.json()["detail"]

    def test_students_cannot_grade(self, client, admin_token):
        token, _e, _c, _a, student_token = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        assert client.patch(f"/api/lms/submissions/{submission_id}/grade",
                            headers=self._auth(student_token),
                            json={"score": 100}).status_code == 403

    def test_grading_is_audited(self, client, admin_token):
        """A mark must not be able to exist without a record of who gave it."""
        token, email, _c, _a, _st = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        client.patch(f"/api/lms/submissions/{submission_id}/grade",
                     headers=self._auth(token), json={"score": 64})
        logs = client.get("/api/audit-logs", headers=self._auth(admin_token)).json()
        assert any(l.get("type") == "grading" and email in (l.get("user") or l.get("usr") or "")
                   for l in logs)
    # ── returning work for revision ─────────────────────────────────────

    def test_returning_work_reaches_the_student(self, client, admin_token):
        """Was requestSubmissionRevision()/rejectLmsSubmission(): a local mutation
        pushed through admin-only bulk-sync, so the student was never told anything
        and the work sat in the queue looking untouched."""
        token, _e, _c, _a, student_token = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        resp = client.patch(f"/api/lms/submissions/{submission_id}/return",
                            headers=self._auth(token),
                            json={"feedback": "Handle the empty-input case."})
        assert resp.status_code == 200, resp.text
        student_view = client.get("/api/lms/my-submissions",
                                  headers=self._auth(student_token)).json()[0]
        assert student_view["feedback"] == "Handle the empty-input case."
        assert student_view["score"] is None

    def test_returned_work_stays_outstanding(self, client, admin_token):
        """No score is recorded, so it must remain in the grading queue rather than
        disappearing as if it were done."""
        token, _e, _c, _a, _st = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        client.patch(f"/api/lms/submissions/{submission_id}/return",
                     headers=self._auth(token), json={"feedback": "Redo section 2."})
        queue = client.get("/api/lms/grading-queue", headers=self._auth(token)).json()
        assert [s["id"] for s in queue] == [submission_id]

    def test_returning_requires_feedback(self, client, admin_token):
        """Sending work back with no explanation is useless to the student."""
        token, _e, _c, _a, _st = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        assert client.patch(f"/api/lms/submissions/{submission_id}/return",
                            headers=self._auth(token),
                            json={"feedback": ""}).status_code == 422

    def test_cannot_return_work_on_another_authors_course(self, client, admin_token):
        token, _e, _c, _a, _st = self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        other_token, _o = self._instructor(client, admin_token, "Other Author")
        assert client.patch(f"/api/lms/submissions/{submission_id}/return",
                            headers=self._auth(other_token),
                            json={"feedback": "x"}).status_code == 403

    def test_student_can_resubmit_after_a_revision_request(self, client, admin_token):
        """Closes the loop: the student fixes the work and it returns as pending."""
        token, _e, _c, assignment_id, student_token = \
            self._course_with_submission(client, admin_token)
        submission_id = client.get("/api/lms/grading-queue",
                                   headers=self._auth(token)).json()[0]["id"]
        client.patch(f"/api/lms/submissions/{submission_id}/return",
                     headers=self._auth(token), json={"feedback": "Add tests."})
        client.post("/api/lms/submissions", headers=self._auth(student_token),
                    json={"assignment_id": assignment_id, "content": "now with tests"})
        row = client.get("/api/lms/my-submissions", headers=self._auth(student_token)).json()[0]
        assert row["status"] == "submitted"
        assert row["content"] == "now with tests"
        assert not row["feedback"]

class TestSponsorshipsAndPayments:
    """Sponsor commitments, payments and the ecosystem aggregates.

    Neither table existed before. The consequences:
      * The whole "Sponsorship & Partner Ecosystem" panel was a hardcoded array --
        MTN/Tullow/GCB/Voltic, GH 350,000 tier totals, a "disbursed" figure computed
        as `totalCommitted * 0.72`, and a literal `impactScore: '98.4%'`.
      * A sponsor recording a payment went through saveUsers() -> bulk-sync
        (admin-only), so it 403'd and the reference stayed in that browser.
      * The UI wrote status 'Confirmed' on submit, telling sponsors their money had
        been received when nothing had checked a bank statement.
    """

    PASSWORD = "Vt9%harbourMoss"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _user(self, client, admin_token, role, name):
        email = f"{role}-{uuid.uuid4().hex[:8]}@spon.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role, "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _sponsor(self, client, admin_token, name="Voltic Ghana"):
        token, email = self._user(client, admin_token, "sponsor", name)
        client.patch("/api/users/me", headers=self._auth(token), json={
            "organization": name, "sector": "Manufacturing", "tier": "Gold",
        })
        return token, email

    def _pledge(self, client, token, amount="50000.00", tier="Gold"):
        resp = client.post("/api/sponsorships", headers=self._auth(token), json={
            "tier": tier, "sector": "Manufacturing", "amount_pledged": amount,
        })
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def _activate(self, client, admin_token, sponsorship_id):
        resp = client.patch(f"/api/sponsorships/{sponsorship_id}/status",
                            headers=self._auth(admin_token), json={"status": "active"})
        assert resp.status_code == 200, resp.text

    # ── pledges ─────────────────────────────────────────────────────────

    def test_sponsor_can_record_a_pledge(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        self._pledge(client, token, "75000.00")
        rows = client.get("/api/sponsorships/mine", headers=self._auth(token)).json()
        assert len(rows) == 1
        assert rows[0]["amount_pledged"] == "75000.00"

    def test_amount_keeps_exact_decimal_value(self, client, admin_token):
        """Money is NUMERIC, not float: 0.1+0.2 problems must not reach a ledger."""
        token, _e = self._sponsor(client, admin_token)
        self._pledge(client, token, "12345.67")
        row = client.get("/api/sponsorships/mine", headers=self._auth(token)).json()[0]
        assert row["amount_pledged"] == "12345.67"

    def test_pledge_starts_pending_not_active(self, client, admin_token):
        """A pledge nobody has confirmed must not count towards public totals."""
        token, _e = self._sponsor(client, admin_token)
        self._pledge(client, token)
        assert client.get("/api/sponsorships/mine",
                          headers=self._auth(token)).json()[0]["status"] == "pending"

    def test_sponsor_cannot_activate_their_own_pledge(self, client, admin_token):
        """Otherwise a sponsor could inflate the committed figure at will."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        assert client.patch(f"/api/sponsorships/{sponsorship_id}/status",
                            headers=self._auth(token),
                            json={"status": "active"}).status_code == 403

    def test_negative_pledge_is_rejected(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        assert client.post("/api/sponsorships", headers=self._auth(token),
                           json={"amount_pledged": "-500"}).status_code == 422

    def test_non_sponsor_cannot_pledge(self, client, admin_token):
        token, _e = self._user(client, admin_token, "student", "A Student")
        assert client.post("/api/sponsorships", headers=self._auth(token),
                           json={"amount_pledged": "100"}).status_code == 403

    def test_sponsor_sees_only_their_own_pledges(self, client, admin_token):
        a_token, _a = self._sponsor(client, admin_token, "Sponsor A")
        b_token, _b = self._sponsor(client, admin_token, "Sponsor B")
        a_pledge = self._pledge(client, a_token, "1000.00")
        self._pledge(client, b_token, "2000.00")
        rows = client.get("/api/sponsorships/mine", headers=self._auth(a_token)).json()
        assert [r["id"] for r in rows] == [a_pledge]

    def test_sponsors_cannot_read_the_full_sponsorship_list(self, client, admin_token):
        """Commercial data: one sponsor must not see another's commitments."""
        token, _e = self._sponsor(client, admin_token)
        self._pledge(client, token)
        assert client.get("/api/sponsorships", headers=self._auth(token)).status_code == 403

    # ── payments are claims until verified ──────────────────────────────

    def test_payment_persists(self, client, admin_token):
        """Previously the reference never left the browser (bulk-sync 403)."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        resp = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                           headers=self._auth(token),
                           json={"amount": "25000.00", "reference": "TXN-1001"})
        assert resp.status_code == 201, resp.text
        rows = client.get("/api/sponsorships/payments/mine", headers=self._auth(token)).json()
        assert len(rows) == 1
        assert rows[0]["reference"] == "TXN-1001"

    def test_payment_starts_pending_verification(self, client, admin_token):
        """The core correction: nothing here contacts a bank, so a submitted
        reference is a claim. The old UI marked it 'Confirmed' immediately."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        resp = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                           headers=self._auth(token),
                           json={"amount": "500.00", "reference": "TXN-2002"})
        assert resp.json()["status"] == "pending_verification"

    def test_unverified_payment_does_not_count_as_received(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token, "10000.00")
        client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                    headers=self._auth(token),
                    json={"amount": "4000.00", "reference": "TXN-3003"})
        row = client.get("/api/sponsorships/mine", headers=self._auth(token)).json()[0]
        assert row["amount_received"] == "0.00"
        assert row["amount_pending"] == "4000.00"

    def test_verified_payment_counts_as_received(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token, "10000.00")
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "4000.00", "reference": "TXN-4004"}).json()["id"]
        assert client.patch(f"/api/sponsorships/payments/{payment}/verify",
                            headers=self._auth(admin_token),
                            json={"verified": True}).status_code == 200
        row = client.get("/api/sponsorships/mine", headers=self._auth(token)).json()[0]
        assert row["amount_received"] == "4000.00"
        assert row["amount_pending"] == "0.00"

    def test_sponsor_cannot_verify_their_own_payment(self, client, admin_token):
        """This is the whole point of the verification step."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "100.00", "reference": "TXN-5005"}).json()["id"]
        assert client.patch(f"/api/sponsorships/payments/{payment}/verify",
                            headers=self._auth(token),
                            json={"verified": True}).status_code == 403

    def test_rejecting_a_payment_requires_a_reason(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "100.00", "reference": "TXN-6006"}).json()["id"]
        assert client.patch(f"/api/sponsorships/payments/{payment}/verify",
                            headers=self._auth(admin_token),
                            json={"verified": False, "reason": " "}).status_code == 422

    def test_rejection_reason_reaches_the_sponsor(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "100.00", "reference": "TXN-7007"}).json()["id"]
        client.patch(f"/api/sponsorships/payments/{payment}/verify",
                     headers=self._auth(admin_token),
                     json={"verified": False, "reason": "No matching bank credit"})
        row = client.get("/api/sponsorships/payments/mine", headers=self._auth(token)).json()[0]
        assert row["status"] == "rejected"
        assert row["rejection_reason"] == "No matching bank credit"

    def test_verification_records_who_acted(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "100.00", "reference": "TXN-8008"}).json()["id"]
        client.patch(f"/api/sponsorships/payments/{payment}/verify",
                     headers=self._auth(admin_token), json={"verified": True})
        row = client.get("/api/sponsorships/payments/mine", headers=self._auth(token)).json()[0]
        assert row["verified_by_name"]
        assert row["verified_at"]

    def test_verification_is_audited(self, client, admin_token):
        """A change to money state must not be able to happen unrecorded."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "321.00", "reference": "TXN-9009"}).json()["id"]
        client.patch(f"/api/sponsorships/payments/{payment}/verify",
                     headers=self._auth(admin_token), json={"verified": True})
        logs = client.get("/api/audit-logs", headers=self._auth(admin_token)).json()
        assert any("TXN-9009" in (l.get("action") or "") for l in logs)

    def test_duplicate_reference_is_rejected(self, client, admin_token):
        """Almost always a double-submit; two rows would double-count the money."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        body = {"amount": "100.00", "reference": "TXN-SAME"}
        assert client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                           headers=self._auth(token), json=body).status_code == 201
        assert client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                           headers=self._auth(token), json=body).status_code == 409

    def test_cannot_pay_against_another_sponsors_pledge(self, client, admin_token):
        a_token, _a = self._sponsor(client, admin_token, "Sponsor A")
        b_token, _b = self._sponsor(client, admin_token, "Sponsor B")
        a_pledge = self._pledge(client, a_token)
        assert client.post(f"/api/sponsorships/{a_pledge}/payments",
                           headers=self._auth(b_token),
                           json={"amount": "1.00", "reference": "X"}).status_code == 403

    def test_zero_payment_is_rejected(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        assert client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                           headers=self._auth(token),
                           json={"amount": "0", "reference": "Z"}).status_code == 422

    def test_reference_is_required(self, client, admin_token):
        """Without a reference an administrator has nothing to check against."""
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        assert client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                           headers=self._auth(token),
                           json={"amount": "10.00", "reference": ""}).status_code == 422

    def test_admin_sees_the_verification_queue(self, client, admin_token):
        token, email = self._sponsor(client, admin_token, "Queue Co")
        sponsorship_id = self._pledge(client, token)
        client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                    headers=self._auth(token),
                    json={"amount": "999.00", "reference": "TXN-QUEUE"})
        queue = client.get("/api/sponsorships/payments/pending",
                           headers=self._auth(admin_token)).json()
        mine = [p for p in queue if p["reference"] == "TXN-QUEUE"]
        assert len(mine) == 1
        assert mine[0]["sponsor_email"] == email

    def test_verified_payment_leaves_the_queue(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "1.00", "reference": "TXN-LEAVE"}).json()["id"]
        client.patch(f"/api/sponsorships/payments/{payment}/verify",
                     headers=self._auth(admin_token), json={"verified": True})
        queue = client.get("/api/sponsorships/payments/pending",
                           headers=self._auth(admin_token)).json()
        assert "TXN-LEAVE" not in [p["reference"] for p in queue]

    def test_sponsors_cannot_read_the_verification_queue(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        assert client.get("/api/sponsorships/payments/pending",
                          headers=self._auth(token)).status_code == 403

    # ── ecosystem aggregates ────────────────────────────────────────────

    def test_summary_counts_only_active_pledges(self, client, admin_token):
        """A pending pledge is not a commitment anyone has confirmed."""
        before = client.get("/api/sponsorships/summary",
                            headers=self._auth(admin_token)).json()
        token, _e = self._sponsor(client, admin_token)
        self._pledge(client, token, "8000.00")
        after = client.get("/api/sponsorships/summary",
                           headers=self._auth(admin_token)).json()
        assert after["total_committed"] == before["total_committed"]
        assert after["pending_pledges"] == before["pending_pledges"] + 1

    def test_summary_reflects_activated_pledges(self, client, admin_token):
        before = client.get("/api/sponsorships/summary",
                            headers=self._auth(admin_token)).json()
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token, "8000.00")
        self._activate(client, admin_token, sponsorship_id)
        after = client.get("/api/sponsorships/summary",
                           headers=self._auth(admin_token)).json()
        delta = float(after["total_committed"]) - float(before["total_committed"])
        assert abs(delta - 8000.0) < 0.001
        assert after["partner_count"] == before["partner_count"] + 1

    def test_summary_received_reflects_only_verified_money(self, client, admin_token):
        """Replaces the hardcoded `totalCommitted * 0.72` "disbursed" figure."""
        before = client.get("/api/sponsorships/summary",
                            headers=self._auth(admin_token)).json()
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token, "10000.00")
        self._activate(client, admin_token, sponsorship_id)
        payment = client.post(f"/api/sponsorships/{sponsorship_id}/payments",
                              headers=self._auth(token),
                              json={"amount": "2500.00", "reference": "TXN-SUM"}).json()["id"]
        mid = client.get("/api/sponsorships/summary", headers=self._auth(admin_token)).json()
        assert mid["total_received"] == before["total_received"]
        assert float(mid["awaiting_verification"]) >= 2500.0

        client.patch(f"/api/sponsorships/payments/{payment}/verify",
                     headers=self._auth(admin_token), json={"verified": True})
        after = client.get("/api/sponsorships/summary", headers=self._auth(admin_token)).json()
        delta = float(after["total_received"]) - float(before["total_received"])
        assert abs(delta - 2500.0) < 0.001

    def test_summary_groups_by_tier(self, client, admin_token):
        token, _e = self._sponsor(client, admin_token)
        sponsorship_id = self._pledge(client, token, "6000.00", tier="Platinum")
        self._activate(client, admin_token, sponsorship_id)
        summary = client.get("/api/sponsorships/summary",
                             headers=self._auth(admin_token)).json()
        platinum = [t for t in summary["tiers"] if t["tier"] == "Platinum"]
        assert platinum
        assert float(platinum[0]["amount"]) >= 6000.0
        # Percentages must be derived, not asserted.
        assert 0 <= platinum[0]["pct"] <= 100

    def test_summary_needs_authentication(self, client):
        assert client.get("/api/sponsorships/summary").status_code == 401

class TestJudgeScoreRevision:
    """Revising a score, and protecting another judge's mark.

    Two defects: the queue was `score IS NULL` only and history was read-only, so a
    judge who mistyped a score had no way to correct it. Meanwhile the grade endpoint
    let ANY judge overwrite ANY existing score with no protection at all, which makes
    a scoring dispute impossible to resolve. `score` was also an unbounded int.
    """

    PASSWORD = "Bq2*lanternKeep"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _user(self, client, admin_token, role, name):
        email = f"{role}-{uuid.uuid4().hex[:8]}@rev.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role, "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email

    def _submission(self, client, admin_token, source="entry.py"):
        student = client.post("/api/students", headers=self._auth(admin_token), json={
            "first_name": "Kofi", "last_name": "Test",
            "email": f"sub-{uuid.uuid4().hex[:8]}@rev.test", "track": "Coding",
        })
        assert student.status_code in (200, 201), student.text
        resp = client.post("/api/submissions", headers=self._auth(admin_token), json={
            "student_id": student.json()["id"], "source_code_path": source, "video_url": "",
        })
        assert resp.status_code in (200, 201), resp.text
        return resp.json()["id"]

    def test_judge_can_score(self, client, admin_token):
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        sub = self._submission(client, admin_token)
        assert client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                            json={"score": 70}).status_code == 200

    def test_judge_can_revise_their_own_score(self, client, admin_token):
        """A mistyped score had no correction path: the queue excludes scored work
        and history was read-only."""
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        sub = self._submission(client, admin_token)
        client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                     json={"score": 40})
        resp = client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                            json={"score": 85, "feedback": "Re-checked the edge cases."})
        assert resp.status_code == 200, resp.text
        history = client.get("/api/judge/history", headers=self._auth(token)).json()
        mine = next(g for g in history["graded"] if g["id"] == sub)
        assert mine["score"] == 85
        assert mine["feedback"] == "Re-checked the edge cases."

    def test_judge_cannot_overwrite_another_judges_score(self, client, admin_token):
        """The integrity hole: any judge could silently replace another's mark."""
        a_token, _a = self._user(client, admin_token, "judge", "Judge A")
        b_token, _b = self._user(client, admin_token, "judge", "Judge B")
        sub = self._submission(client, admin_token)
        assert client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(a_token),
                            json={"score": 60}).status_code == 200
        resp = client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(b_token),
                            json={"score": 95})
        assert resp.status_code == 409
        assert "Judge A" in resp.json()["detail"]

    def test_the_original_score_survives_a_blocked_overwrite(self, client, admin_token):
        a_token, _a = self._user(client, admin_token, "judge", "Judge A")
        b_token, _b = self._user(client, admin_token, "judge", "Judge B")
        sub = self._submission(client, admin_token)
        client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(a_token),
                     json={"score": 60})
        client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(b_token),
                     json={"score": 95})
        history = client.get("/api/judge/history", headers=self._auth(a_token)).json()
        assert next(g for g in history["graded"] if g["id"] == sub)["score"] == 60

    def test_admin_can_override_a_judges_score(self, client, admin_token):
        """Someone must be able to settle a dispute."""
        token, _e = self._user(client, admin_token, "judge", "Judge A")
        sub = self._submission(client, admin_token)
        client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                     json={"score": 60})
        assert client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(admin_token),
                            json={"score": 75}).status_code == 200

    def test_revision_is_audited_with_the_previous_score(self, client, admin_token):
        """Without the old value in the record, a change cannot be reconstructed."""
        token, email = self._user(client, admin_token, "judge", "Judge One")
        sub = self._submission(client, admin_token)
        client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                     json={"score": 30})
        client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                     json={"score": 90})
        logs = client.get("/api/audit-logs", headers=self._auth(admin_token)).json()
        revisions = [l for l in logs
                     if "revised" in (l.get("action") or "") and sub in (l.get("action") or "")]
        assert revisions
        assert "was 30" in revisions[0]["action"]

    def test_score_above_the_maximum_is_rejected(self, client, admin_token):
        """`score` was an unbounded int, so 9999 would skew every average."""
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        sub = self._submission(client, admin_token)
        assert client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                            json={"score": 9999}).status_code == 422

    def test_negative_score_is_rejected(self, client, admin_token):
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        sub = self._submission(client, admin_token)
        assert client.patch(f"/api/submissions/{sub}/grade", headers=self._auth(token),
                            json={"score": -5}).status_code == 422

    def test_queue_reports_whether_the_artifact_is_reachable(self, client, admin_token):
        """A bare filename cannot be opened -- there is no file-serving endpoint. The
        judge UI rendered it as inert text, which reads as a broken link."""
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        self._submission(client, admin_token, source="entry.py")
        queue = client.get("/api/judge/queue", headers=self._auth(token)).json()
        filenames = [s for s in queue["submissions"] if s["source_code_path"] == "entry.py"]
        assert filenames
        assert filenames[0]["source_is_url"] is False

    def test_queue_flags_a_real_url_as_linkable(self, client, admin_token):
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        self._submission(client, admin_token, source="https://github.test/entry")
        queue = client.get("/api/judge/queue", headers=self._auth(token)).json()
        urls = [s for s in queue["submissions"]
                if s["source_code_path"] == "https://github.test/entry"]
        assert urls
        assert urls[0]["source_is_url"] is True

    def test_queue_exposes_the_score_maximum(self, client, admin_token):
        token, _e = self._user(client, admin_token, "judge", "Judge One")
        self._submission(client, admin_token)
        queue = client.get("/api/judge/queue", headers=self._auth(token)).json()
        assert queue["submissions"][0]["max_score"] == 100


class TestPersonnelManagement:
    """Managing people from the Personnel Monitor.

    The monitor was read-only: an administrator could see that somebody needed
    attention but had to leave for User Management to act, and there was no way at
    all to end a session or force a password rotation.
    """

    PASSWORD = "Nf6@templeGrove"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _user(self, client, admin_token, role="judge", name="Managed Person"):
        email = f"mng-{uuid.uuid4().hex[:8]}@pm.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": name, "role": role, "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": self.PASSWORD})
        assert login.status_code == 200, login.text
        return login.json()["token"], email, resp.json().get("id")

    def _person(self, client, admin_token, email):
        data = client.get("/api/admin/personnel", headers=self._auth(admin_token)).json()
        return next((p for p in data["people"]
                     if (p["email"] or "").lower() == email.lower()), None)

    # ── suspend / reactivate ────────────────────────────────────────────

    def test_admin_can_suspend_an_account(self, client, admin_token):
        token, email, uid = self._user(client, admin_token)
        resp = client.patch(f"/api/admin/personnel/{uid}/status",
                            headers=self._auth(admin_token),
                            json={"status": "Suspended", "reason": "Policy breach"})
        assert resp.status_code == 200, resp.text
        assert self._person(client, admin_token, email)["status"] == "Suspended"

    def test_suspending_revokes_live_sessions(self, client, admin_token):
        """Without this the person keeps working until their idle timeout expires,
        which defeats the point of suspending them."""
        token, email, uid = self._user(client, admin_token)
        # Session is live right now.
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 200
        resp = client.patch(f"/api/admin/personnel/{uid}/status",
                            headers=self._auth(admin_token), json={"status": "Suspended"})
        assert resp.json()["sessions_revoked"] >= 1
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 401

    def test_suspended_account_cannot_log_back_in(self, client, admin_token):
        token, email, uid = self._user(client, admin_token)
        client.patch(f"/api/admin/personnel/{uid}/status",
                     headers=self._auth(admin_token), json={"status": "Suspended"})
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        assert client.post("/api/login", json={
            "email": email, "password": self.PASSWORD}).status_code in (401, 403)

    def test_admin_can_reactivate(self, client, admin_token):
        token, email, uid = self._user(client, admin_token)
        client.patch(f"/api/admin/personnel/{uid}/status",
                     headers=self._auth(admin_token), json={"status": "Suspended"})
        client.patch(f"/api/admin/personnel/{uid}/status",
                     headers=self._auth(admin_token), json={"status": "Active"})
        assert self._person(client, admin_token, email)["status"] == "Active"
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        assert client.post("/api/login", json={
            "email": email, "password": self.PASSWORD}).status_code == 200

    def test_admin_cannot_suspend_themselves(self, client, admin_token):
        """A self-lockout would need database access to undo."""
        me = client.get("/api/users/me", headers=self._auth(admin_token)).json()
        resp = client.patch(f"/api/admin/personnel/{me['id']}/status",
                            headers=self._auth(admin_token), json={"status": "Suspended"})
        assert resp.status_code == 409

    def test_invalid_status_is_rejected(self, client, admin_token):
        _t, _e, uid = self._user(client, admin_token)
        assert client.patch(f"/api/admin/personnel/{uid}/status",
                            headers=self._auth(admin_token),
                            json={"status": "Deleted"}).status_code == 422

    def test_status_change_is_audited(self, client, admin_token):
        _t, email, uid = self._user(client, admin_token)
        client.patch(f"/api/admin/personnel/{uid}/status",
                     headers=self._auth(admin_token),
                     json={"status": "Suspended", "reason": "Spam"})
        logs = client.get("/api/audit-logs", headers=self._auth(admin_token)).json()
        assert any(email in (l.get("action") or "") and "Suspended" in (l.get("action") or "")
                   for l in logs)

    def test_non_admin_cannot_change_status(self, client, admin_token):
        victim_token, _ve, victim_id = self._user(client, admin_token, "judge")
        attacker_token, _ae, _aid = self._user(client, admin_token, "instructor")
        assert client.patch(f"/api/admin/personnel/{victim_id}/status",
                            headers=self._auth(attacker_token),
                            json={"status": "Suspended"}).status_code == 403

    def test_unknown_user_is_404(self, client, admin_token):
        assert client.patch("/api/admin/personnel/nope/status",
                            headers=self._auth(admin_token),
                            json={"status": "Active"}).status_code == 404

    # ── force password change ───────────────────────────────────────────

    def test_admin_can_require_a_password_change(self, client, admin_token):
        token, email, uid = self._user(client, admin_token)
        resp = client.post(f"/api/admin/personnel/{uid}/require-password-change",
                           headers=self._auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert self._person(client, admin_token, email)["must_change_password"] is True

    def test_requiring_a_password_change_ends_sessions(self, client, admin_token):
        """Otherwise the requirement only bites whenever they next happen to sign in."""
        token, _e, uid = self._user(client, admin_token)
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 200
        resp = client.post(f"/api/admin/personnel/{uid}/require-password-change",
                           headers=self._auth(admin_token))
        assert resp.json()["sessions_revoked"] >= 1
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 401

    def test_non_admin_cannot_force_a_password_change(self, client, admin_token):
        _vt, _ve, victim_id = self._user(client, admin_token, "judge")
        attacker_token, _ae, _aid = self._user(client, admin_token, "sponsor")
        assert client.post(f"/api/admin/personnel/{victim_id}/require-password-change",
                           headers=self._auth(attacker_token)).status_code == 403

    # ── revoke sessions ─────────────────────────────────────────────────

    def test_admin_can_sign_someone_out_everywhere(self, client, admin_token):
        token, _e, uid = self._user(client, admin_token)
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 200
        resp = client.post(f"/api/admin/personnel/{uid}/revoke-sessions",
                           headers=self._auth(admin_token))
        assert resp.json()["sessions_revoked"] >= 1
        assert client.get("/api/users/me", headers=self._auth(token)).status_code == 401

    def test_revoking_does_not_disable_the_account(self, client, admin_token):
        """Signing someone out is not the same as suspending them."""
        token, email, uid = self._user(client, admin_token)
        client.post(f"/api/admin/personnel/{uid}/revoke-sessions",
                    headers=self._auth(admin_token))
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        assert client.post("/api/login", json={
            "email": email, "password": self.PASSWORD}).status_code == 200

    # ── detail drawer ───────────────────────────────────────────────────

    def test_detail_returns_the_person(self, client, admin_token):
        _t, email, uid = self._user(client, admin_token, "judge", "Detail Judge")
        detail = client.get(f"/api/admin/personnel/{uid}",
                            headers=self._auth(admin_token)).json()
        assert detail["email"] == email
        assert detail["full_name"] == "Detail Judge"

    def test_detail_lists_an_instructors_courses(self, client, admin_token):
        token, _e, uid = self._user(client, admin_token, "instructor", "Detail Instructor")
        client.post("/api/lms/courses", headers=self._auth(token),
                    json={"title": "Detail Course", "modules": 2})
        detail = client.get(f"/api/admin/personnel/{uid}",
                            headers=self._auth(admin_token)).json()
        assert [c["title"] for c in detail["courses"]] == ["Detail Course"]
        assert detail["courses"][0]["approval_status"] == "pending"

    def test_detail_lists_a_sponsors_pledges_and_payments(self, client, admin_token):
        token, _e, uid = self._user(client, admin_token, "sponsor", "Detail Sponsor")
        pledge = client.post("/api/sponsorships", headers=self._auth(token),
                             json={"amount_pledged": "4200.50", "tier": "Silver"}).json()["id"]
        client.post(f"/api/sponsorships/{pledge}/payments", headers=self._auth(token),
                    json={"amount": "1200.25", "reference": "TXN-DETAIL"})
        detail = client.get(f"/api/admin/personnel/{uid}",
                            headers=self._auth(admin_token)).json()
        assert detail["pledges"][0]["amount_pledged"] == "4200.50"
        assert detail["payments"][0]["reference"] == "TXN-DETAIL"
        # Still a claim, not money received.
        assert detail["payments"][0]["status"] == "pending_verification"

    def test_detail_lists_a_students_enrolments(self, client, admin_token):
        # An instructor publishes a course for the student to join.
        inst_token, _ie, _iid = self._user(client, admin_token, "instructor", "Course Owner")
        course = client.post("/api/lms/courses", headers=self._auth(inst_token),
                             json={"title": "Detail Track", "modules": 1}).json()["id"]
        client.patch(f"/api/lms/courses/{course}/moderate",
                     headers=self._auth(admin_token), json={"approve": True})

        stu_token, _se, stu_id = self._user(client, admin_token, "student", "Detail Student")
        client.post("/api/lms/enrollments", headers=self._auth(stu_token),
                    json={"course_id": course})
        detail = client.get(f"/api/admin/personnel/{stu_id}",
                            headers=self._auth(admin_token)).json()
        assert [e["course_title"] for e in detail["enrolments"]] == ["Detail Track"]

    def test_detail_requires_admin(self, client, admin_token):
        _vt, _ve, victim_id = self._user(client, admin_token, "judge")
        attacker_token, _ae, _aid = self._user(client, admin_token, "student")
        assert client.get(f"/api/admin/personnel/{victim_id}",
                          headers=self._auth(attacker_token)).status_code == 403

    def test_detail_unknown_user_is_404(self, client, admin_token):
        assert client.get("/api/admin/personnel/nope",
                          headers=self._auth(admin_token)).status_code == 404

class TestPublicPartnerWall:
    """GET /api/partners -- the public landing-page partner wall.

    Replaces a hardcoded wall of brand cards in landing.component.html (MTN, Tullow,
    GCB, Fidelity, Stanbic, Voltic, Coca-Cola, HP, EPP, Printex) with tier pills like
    "In-Kind - 1,500 Packs Water". None of it had a source, so the homepage named
    partners the platform had no record of.

    This endpoint is PUBLIC, so what it withholds matters as much as what it returns.
    """

    PASSWORD = "Cx4!beaconRise"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _sponsor(self, client, admin_token, org):
        email = f"pw-{uuid.uuid4().hex[:8]}@partner.test"
        resp = client.post("/api/users", headers=self._auth(admin_token), json={
            "email": email, "full_name": org, "role": "sponsor", "password": self.PASSWORD,
        })
        assert resp.status_code in (200, 201), resp.text
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()
        token = client.post("/api/login", json={
            "email": email, "password": self.PASSWORD}).json()["token"]
        client.patch("/api/users/me", headers=self._auth(token), json={"organization": org})
        return token, email

    def _pledge(self, client, token, tier="Gold", sector="Technology", amount="10000.00"):
        resp = client.post("/api/sponsorships", headers=self._auth(token), json={
            "tier": tier, "sector": sector, "amount_pledged": amount,
        })
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def _names(self, client):
        resp = client.get("/api/partners")
        assert resp.status_code == 200, resp.text
        return [p["organization"] for p in resp.json()["partners"]]

    def test_endpoint_is_public(self, client):
        """It feeds the homepage, which anonymous visitors see."""
        assert client.get("/api/partners").status_code == 200

    def test_unconfirmed_pledge_is_not_published(self, client, admin_token):
        """The core protection: anyone with a sponsor account could otherwise
        publish themselves onto the homepage as an official partner."""
        org = f"Unconfirmed Co {uuid.uuid4().hex[:4]}"
        token, _e = self._sponsor(client, admin_token, org)
        self._pledge(client, token)
        assert org not in self._names(client)

    def test_confirmed_pledge_is_published(self, client, admin_token):
        org = f"Confirmed Co {uuid.uuid4().hex[:4]}"
        token, _e = self._sponsor(client, admin_token, org)
        pledge = self._pledge(client, token)
        client.patch(f"/api/sponsorships/{pledge}/status",
                     headers=self._auth(admin_token), json={"status": "active"})
        assert org in self._names(client)

    def test_cancelled_partner_is_removed(self, client, admin_token):
        org = f"Cancelled Co {uuid.uuid4().hex[:4]}"
        token, _e = self._sponsor(client, admin_token, org)
        pledge = self._pledge(client, token)
        client.patch(f"/api/sponsorships/{pledge}/status",
                     headers=self._auth(admin_token), json={"status": "active"})
        assert org in self._names(client)
        client.patch(f"/api/sponsorships/{pledge}/status",
                     headers=self._auth(admin_token), json={"status": "cancelled"})
        assert org not in self._names(client)

    def test_completed_partner_stays_credited(self, client, admin_token):
        """A finished sponsorship was still real; removing them would erase history."""
        org = f"Completed Co {uuid.uuid4().hex[:4]}"
        token, _e = self._sponsor(client, admin_token, org)
        pledge = self._pledge(client, token)
        client.patch(f"/api/sponsorships/{pledge}/status",
                     headers=self._auth(admin_token), json={"status": "completed"})
        assert org in self._names(client)

    def test_no_money_or_contact_data_is_exposed(self, client, admin_token):
        """Amounts, emails and payment state are commercial data. This is a public
        endpoint, so leaking them would publish every sponsor's finances."""
        org = f"Private Co {uuid.uuid4().hex[:4]}"
        token, email = self._sponsor(client, admin_token, org)
        pledge = self._pledge(client, token, amount="987654.00")
        client.patch(f"/api/sponsorships/{pledge}/status",
                     headers=self._auth(admin_token), json={"status": "active"})

        payload = client.get("/api/partners").json()
        import json as _json
        blob = _json.dumps(payload)
        assert "987654" not in blob
        assert email not in blob
        for p in payload["partners"]:
            assert set(p) == {"organization", "tier", "sector", "since"}

    def test_one_logo_per_organisation(self, client, admin_token):
        """A partner with several commitments is one logo on the wall, not three."""
        org = f"Multi Co {uuid.uuid4().hex[:4]}"
        token, _e = self._sponsor(client, admin_token, org)
        for _ in range(3):
            pledge = self._pledge(client, token)
            client.patch(f"/api/sponsorships/{pledge}/status",
                         headers=self._auth(admin_token), json={"status": "active"})
        assert self._names(client).count(org) == 1

    def test_platinum_is_ordered_before_gold(self, client, admin_token):
        plat_org = f"AAA Platinum {uuid.uuid4().hex[:4]}"
        gold_org = f"ZZZ Gold {uuid.uuid4().hex[:4]}"
        # Deliberately alphabetically inverted, so ordering cannot pass by accident.
        for org, tier in ((gold_org, "Gold"), (plat_org, "Platinum")):
            token, _e = self._sponsor(client, admin_token, org)
            pledge = self._pledge(client, token, tier=tier)
            client.patch(f"/api/sponsorships/{pledge}/status",
                         headers=self._auth(admin_token), json={"status": "active"})
        names = self._names(client)
        assert names.index(plat_org) < names.index(gold_org)

    def test_total_matches_the_list(self, client):
        payload = client.get("/api/partners").json()
        assert payload["total"] == len(payload["partners"])

    def test_missing_tier_falls_back_rather_than_blank(self, client, admin_token):
        org = f"NoTier Co {uuid.uuid4().hex[:4]}"
        token, _e = self._sponsor(client, admin_token, org)
        pledge = client.post("/api/sponsorships", headers=self._auth(token), json={
            "amount_pledged": "500.00",
        }).json()["id"]
        client.patch(f"/api/sponsorships/{pledge}/status",
                     headers=self._auth(admin_token), json={"status": "active"})
        row = next(p for p in client.get("/api/partners").json()["partners"]
                   if p["organization"] == org)
        assert row["tier"]


class TestPartnerCopyIsEditable:
    """The two partner-wall headings were hardcoded in the template, so a page
    manager had no way to change them."""

    def test_partner_copy_keys_are_seeded(self, client):
        copy = client.get("/api/landing-copy").json()
        for key in ("partners.eyebrow", "partners.heading", "partners.cta", "partners.empty"):
            assert key in copy, f"{key} missing -- page manager cannot edit it"

    def test_defaults_match_the_original_wording(self, client):
        """Seeding must not silently change the live page."""
        copy = client.get("/api/landing-copy").json()
        assert copy["partners.eyebrow"] == "Official Corporate & Resource Ecosystem"
        assert copy["partners.heading"] == \
            "Powered by Ghana's Foremost Technology & Industry Leaders"

    def test_a_content_manager_can_edit_partner_copy(self, client, admin_token):
        resp = client.put("/api/landing-copy",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"partners.heading": "Backed by Industry"})
        assert resp.status_code == 200, resp.text
        assert client.get("/api/landing-copy").json()["partners.heading"] == "Backed by Industry"

    def test_partner_copy_edit_requires_permission(self, client):
        assert client.put("/api/landing-copy",
                          json={"partners.heading": "Hijacked"}).status_code in (401, 403)


class TestGatewayCopyIsEditable:
    """The Championship Entry Gateway headings and options are editable via Page Manager."""

    def test_gateway_copy_keys_are_seeded(self, client):
        copy = client.get("/api/landing-copy").json()
        keys = (
            "gateway.brandName", "gateway.brandSub", "gateway.backHome",
            "gateway.accountLogin", "gateway.sub", "gateway.heading",
            "gateway.lead", "gateway.card1.title", "gateway.card1.body",
            "gateway.card1.f1", "gateway.card1.f2", "gateway.card1.f3",
            "gateway.card1.btn", "gateway.card2.title", "gateway.card2.body",
            "gateway.card2.f1", "gateway.card2.f2", "gateway.card2.f3",
            "gateway.card2.btnResume", "gateway.card2.btnTrack"
        )
        for key in keys:
            assert key in copy, f"{key} missing -- page manager cannot edit it"

    def test_gateway_defaults_match_the_original_wording(self, client):
        copy = client.get("/api/landing-copy").json()
        assert copy["gateway.heading"] == "Championship Entry Gateway"
        assert copy["gateway.card1.title"] == "New Registration"
        assert copy["gateway.card2.title"] == "Resume Registration"

    def test_a_content_manager_can_edit_gateway_copy(self, client, admin_token):
        resp = client.put("/api/landing-copy",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"gateway.heading": "National Finals Entry Portal"})
        assert resp.status_code == 200, resp.text
        assert client.get("/api/landing-copy").json()["gateway.heading"] == "National Finals Entry Portal"


class TestCycleLifecycle:
    """The competition cycle state machine (app/lifecycle.py).

    A cycle is a competitions row. These pin the contract the whole UI relies
    on: the status column used to accept any string, and nothing enforced the
    transitions the panels offered.
    """

    def _make_cycle(self, client, admin_token, **overrides):
        body = {"title": f"Cycle {uuid.uuid4()}"}
        body.update(overrides)
        resp = client.post("/api/competitions",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json=body)
        assert resp.status_code == 201, resp.text
        return resp.json()

    def test_new_cycle_defaults_to_draft_not_active(self, client, admin_token):
        # Creating a cycle must never publish it to entrants immediately.
        assert self._make_cycle(client, admin_token)["status"] == "draft"

    def test_invalid_status_is_rejected(self, client, admin_token):
        resp = client.post("/api/competitions",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"title": "Bad", "status": "totally-made-up"})
        assert resp.status_code == 422, resp.text
        assert "Invalid cycle status" in resp.json()["detail"]

    def test_status_is_case_and_whitespace_normalised(self, client, admin_token):
        assert self._make_cycle(client, admin_token, status="  DRAFT ")["status"] == "draft"

    def test_legal_transition_is_accepted(self, client, admin_token):
        cycle = self._make_cycle(client, admin_token)
        resp = client.patch(f"/api/competitions/{cycle['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={"title": "x", "status": "registration"})
        assert resp.status_code == 200, resp.text

    def test_illegal_transition_is_refused(self, client, admin_token):
        # draft -> completed skips the whole lifecycle.
        cycle = self._make_cycle(client, admin_token)
        resp = client.patch(f"/api/competitions/{cycle['id']}",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={"title": "x", "status": "completed"})
        assert resp.status_code == 409, resp.text
        assert "Cannot move a cycle" in resp.json()["detail"]

    def test_completed_cycle_cannot_reopen_registration(self, client, admin_token):
        # The case that matters: results are out, entrants must not be let back in.
        cycle = self._make_cycle(client, admin_token)
        h = {"Authorization": f"Bearer {admin_token}"}
        for nxt in ("registration", "active", "completed"):
            assert client.patch(f"/api/competitions/{cycle['id']}", headers=h,
                                json={"title": "x", "status": nxt}).status_code == 200
        resp = client.patch(f"/api/competitions/{cycle['id']}", headers=h,
                            json={"title": "x", "status": "registration"})
        assert resp.status_code == 409, resp.text

    def test_archive_is_reachable_from_any_live_state(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        for start in ("draft", "registration", "active"):
            cycle = self._make_cycle(client, admin_token)
            if start != "draft":
                client.patch(f"/api/competitions/{cycle['id']}", headers=h,
                             json={"title": "x", "status": "registration"})
            if start == "active":
                client.patch(f"/api/competitions/{cycle['id']}", headers=h,
                             json={"title": "x", "status": "active"})
            resp = client.patch(f"/api/competitions/{cycle['id']}", headers=h,
                                json={"title": "x", "status": "archived"})
            assert resp.status_code == 200, f"{start} -> archived: {resp.text}"

    def test_draft_cycle_refuses_student_registration(self, client, admin_token, student_token):
        cycle = self._make_cycle(client, admin_token)
        resp = client.post("/api/competitions/register",
                           headers={"Authorization": f"Bearer {student_token}"},
                           json={"competition_id": cycle["id"]})
        assert resp.status_code == 409, resp.text

    def test_open_cycle_accepts_student_registration(self, client, admin_token, student_token):
        cycle = self._make_cycle(client, admin_token)
        client.patch(f"/api/competitions/{cycle['id']}",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     json={"title": "x", "status": "registration"})
        resp = client.post("/api/competitions/register",
                           headers={"Authorization": f"Bearer {student_token}"},
                           json={"competition_id": cycle["id"]})
        assert resp.status_code in (200, 201), resp.text

    def test_deleting_a_cycle_detaches_its_registrations(self, client, admin_token, student_token):
        cycle = self._make_cycle(client, admin_token)
        h = {"Authorization": f"Bearer {admin_token}"}
        client.patch(f"/api/competitions/{cycle['id']}", headers=h,
                     json={"title": "x", "status": "registration"})
        client.post("/api/competitions/register",
                    headers={"Authorization": f"Bearer {student_token}"},
                    json={"competition_id": cycle["id"]})
        assert client.delete(f"/api/competitions/{cycle['id']}", headers=h).status_code == 200
        mine = client.get("/api/competitions/my-registrations",
                          headers={"Authorization": f"Bearer {student_token}"}).json()
        assert all(r["competition_id"] != cycle["id"] for r in mine)


class TestApprovalProvisioning:
    """Approving an application must create the account it entitles.

    Previously PATCH /api/approvals only flipped a status column, so an
    applicant could be "approved" and still have no way to sign in.
    """

    def _submit(self, client, admin_token, approval_type, contact, entity="Test Entity"):
        approval_id = f"APR-{uuid.uuid4().hex[:10]}"
        resp = client.post("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"id": approval_id, "type": approval_type,
                                 "entity": entity, "contact": contact,
                                 "details": {}, "status": "pending"})
        assert resp.status_code in (200, 201), resp.text
        return approval_id

    def _approve(self, client, admin_token, approval_id):
        resp = client.patch(f"/api/approvals/{approval_id}",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={"status": "approved", "reviewer": "admin@ntic.org.gh"})
        assert resp.status_code == 200, resp.text
        return resp.json()

    @pytest.mark.parametrize("approval_type,expected_role", [
        ("School Registration", "school_admin"),
        ("Instructor Access", "instructor"),
        ("Team Addition", "student"),
    ])
    def test_approval_provisions_account_with_mapped_role(
            self, client, admin_token, approval_type, expected_role):
        email = f"prov-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = self._submit(client, admin_token, approval_type, email)
        account = self._approve(client, admin_token, approval_id)["account"]
        assert account["temporary_password"]
        assert account.get("ticket") and account["ticket"].startswith("NTIC-")
        # Ensure the user roster in GET /api/users reflects the exact same ticket
        users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"}).json()
        matching = [u for u in users if u.get("email") == email]
        assert len(matching) == 1
        assert matching[0]["ticket"] == account["ticket"]

    def test_provisioned_account_can_sign_in(self, client, admin_token):
        email = f"signin-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = self._submit(client, admin_token, "Instructor Access", email)
        account = self._approve(client, admin_token, approval_id)["account"]
        resp = client.post("/api/login", json={
            "email": email, "password": account["temporary_password"]})
        assert resp.status_code == 200, resp.text
        assert resp.json()["role"] == "instructor"

    def test_reapproving_does_not_create_a_second_account(self, client, admin_token):
        email = f"idem-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = self._submit(client, admin_token, "Instructor Access", email)
        assert self._approve(client, admin_token, approval_id)["account"]["provisioned"] is True
        again = self._approve(client, admin_token, approval_id)["account"]
        assert again["provisioned"] is False

    def test_rejection_provisions_nothing(self, client, admin_token):
        email = f"reject-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = self._submit(client, admin_token, "Instructor Access", email)
        resp = client.patch(f"/api/approvals/{approval_id}",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={"status": "rejected", "reviewer": "admin@ntic.org.gh"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["account"]["provisioned"] is False
        assert client.post("/api/login", json={
            "email": email, "password": "irrelevant"}).status_code == 401

    def test_approval_without_contact_email_still_records_decision(self, client, admin_token):
        # The reviewer must always be able to record a decision, even when the
        # application is too incomplete to provision from.
        approval_id = self._submit(client, admin_token, "Instructor Access", "")
        account = self._approve(client, admin_token, approval_id)["account"]
        assert account["provisioned"] is False
        assert "contact email" in account["reason"]

    def test_unknown_approval_type_records_decision_without_provisioning(self, client, admin_token):
        approval_id = self._submit(client, admin_token, "Mystery Type",
                                   f"unknown-{uuid.uuid4().hex[:8]}@example.com")
        account = self._approve(client, admin_token, approval_id)["account"]
        assert account["provisioned"] is False
        assert "No role mapping" in account["reason"]

    def test_approving_missing_approval_returns_404(self, client, admin_token):
        resp = client.patch("/api/approvals/APR-does-not-exist",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={"status": "approved"})
        assert resp.status_code == 404

    def test_approving_school_registration_creates_teams_server_side(self, client, admin_token):
        email = f"teams-{uuid.uuid4().hex[:8]}@example.com"
        lead_email = f"lead-{uuid.uuid4().hex[:6]}@example.com"
        approval_id = f"APR-{uuid.uuid4().hex[:10]}"
        resp = client.post("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"id": approval_id, "type": "School Registration",
                                 "entity": "Nationwide School", "contact": email,
                                 "details": {"teamsList": [
                                     {"name": "Squad One", "track": "Coding",
                                      "leadName": "Lead A", "leadEmail": lead_email,
                                      "member2Name": "Member B",
                                      "member2Email": f"m2-{uuid.uuid4().hex[:6]}@example.com"}
                                 ]}, "status": "pending"})
        assert resp.status_code in (200, 201), resp.text
        result = self._approve(client, admin_token, approval_id)
        assert result["teams"]["applied"] is True
        teams = client.get("/api/teams", headers={"Authorization": f"Bearer {admin_token}"}).json()
        assert any(t.get("name") == "Squad One" for t in teams), \
            "approving a school registration did not create its team server-side"

    def test_approving_team_addition_creates_team_and_member_accounts(self, client, admin_token):
        lead_email = f"addlead-{uuid.uuid4().hex[:8]}@example.com"
        member_email = f"addmem-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = f"APR-{uuid.uuid4().hex[:10]}"
        resp = client.post("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"id": approval_id, "type": "Team Addition",
                                 "entity": "Independent Squad", "contact": lead_email,
                                 "details": {"track": "Robotics", "lead": "Lead A",
                                             "members": ["Lead A", "Member B"],
                                             "leadEmail": lead_email,
                                             "memberEmails": [lead_email, member_email]},
                                 "status": "pending"})
        assert resp.status_code in (200, 201), resp.text
        result = self._approve(client, admin_token, approval_id)
        assert result["teams"]["applied"] is True
        teams = client.get("/api/teams", headers={"Authorization": f"Bearer {admin_token}"}).json()
        assert any(t.get("name") == "Independent Squad" for t in teams), \
            "approving a team addition did not create the team server-side"
        # Member accounts are minted server-side too.
        users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"}).json()
        emails = {u.get("email") for u in users}
        assert lead_email in emails and member_email in emails, \
            "team member accounts were not provisioned server-side"

    def test_approving_school_registration_surfaces_member_credentials(self, client, admin_token):
        """School/team approvals mint student accounts whose one-time passwords
        must reach the institution. Previously _provision_team_member_accounts
        returned them but the caller discarded the result, so the school had the
        logins without ever learning the initial passwords."""
        email = f"surf-{uuid.uuid4().hex[:8]}@example.com"
        lead_email = f"surflead-{uuid.uuid4().hex[:8]}@example.com"
        member_emails = {
            "member2": f"surfm2-{uuid.uuid4().hex[:8]}@example.com",
            "member3": f"surfm3-{uuid.uuid4().hex[:8]}@example.com",
        }
        approval_id = f"APR-{uuid.uuid4().hex[:10]}"
        resp = client.post("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"id": approval_id, "type": "School Registration",
                                 "entity": "Credential School", "contact": email,
                                 "details": {"teamsList": [
                                     {"name": "Surf Squad", "track": "Coding",
                                      "leadName": "Lead A", "leadEmail": lead_email,
                                      "member2Name": "Member B",
                                      "member2Email": member_emails["member2"],
                                      "member3Name": "Member C",
                                      "member3Email": member_emails["member3"]}
                                 ]}, "status": "pending"})
        assert resp.status_code in (200, 201), resp.text
        result = self._approve(client, admin_token, approval_id)
        assert result["teams"]["applied"] is True
        creds = result["teams"].get("member_credentials") or []
        assert len(creds) >= 1, \
            f"expected member credentials in the approval response, got {creds}"
        by_email = {c.get("email"): c for c in creds}
        for mem_email in member_emails.values():
            assert mem_email in by_email, f"missing credential for {mem_email}"
            assert by_email[mem_email].get("temporary_password"), \
                "member credential has no one-time password"
            assert by_email[mem_email].get("ticket", "").startswith("NTIC-"), \
                "member credential has no official ticket"
        # The minted login is real and usable.
        first = creds[0]
        login = client.post("/api/login", json={
            "email": first["email"], "password": first["temporary_password"]})
        assert login.status_code == 200, login.text
        assert login.json().get("role") == "student"

    def test_bulk_sync_cannot_mark_an_approval_approved(self, client, admin_token):
        """bulk-sync was a client-controlled writer for approval status.

        The dashboard used to fire POST /api/bulk-sync (a non-authoritative
        local-state sync) alongside the real decision PATCH. Because bulk-sync
        blindly upserted whatever status the browser sent, a bulk-sync racing the
        PATCH could mark the row 'approved' before the PATCH ran, which skipped
        provisioning entirely -- an application that read as approved forever
        while no account or pass was ever created.

        Permanent contract: bulk-sync may only CREATE a pending row. It must
        never change the status of an existing row, so it is structurally
        impossible for it to interfere with a reviewer's decision. The PATCH is
        the single writer of approved/rejected status.
        """
        email = f"bulk-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = self._submit(client, admin_token, "Instructor Access", email)

        # Try to clobber the row to 'approved' exactly as the old dashboard did.
        resp = client.post("/api/bulk-sync",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"collection": "approvals", "items": [
                               {"id": approval_id, "type": "Instructor Access",
                                "entity": "Test Entity", "contact": email,
                                "details": {}, "status": "approved"}]})
        assert resp.status_code == 200, resp.text

        # The row is STILL pending: bulk-sync could not hijack the decision.
        rows = client.get("/api/approvals", headers={"Authorization": f"Bearer {admin_token}"}).json()
        row = next(r for r in rows if r["id"] == approval_id)
        assert row["status"] == "pending", \
            "bulk-sync overrode an existing approval's status; it must not be a decision writer"

        # The PATCH is the sole writer and provisions as normal.
        account = self._approve(client, admin_token, approval_id)["account"]
        assert account["provisioned"] is True
        assert account["temporary_password"] and account["ticket"]
        login = client.post("/api/login", json={
            "email": email, "password": account["temporary_password"]})
        assert login.status_code == 200, login.text
        assert login.json()["role"] == "instructor"

    def test_bulk_sync_creates_missing_pending_row_but_never_creates_approved(self, client, admin_token):
        """bulk-sync seeds a brand-new approval as 'pending' regardless of the
        status a caller supplies, so even a fresh row cannot bypass review."""
        email = f"seed-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = f"APR-{uuid.uuid4().hex[:10]}"
        resp = client.post("/api/bulk-sync",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"collection": "approvals", "items": [
                               {"id": approval_id, "type": "Instructor Access",
                                "entity": "Seeded Entity", "contact": email,
                                "details": {}, "status": "approved"}]})
        assert resp.status_code == 200, resp.text
        rows = client.get("/api/approvals", headers={"Authorization": f"Bearer {admin_token}"}).json()
        row = next(r for r in rows if r["id"] == approval_id)
        assert row["status"] == "pending", \
            "bulk-sync created a row outside 'pending'; every new approval must start pending"

    def test_post_approvals_cannot_force_an_approved_status(self, client, admin_token):
        """POST /api/approvals is a create/seed helper; the reviewer decision is
        exclusively the PATCH. A payload that claims status='approved' must be
        ignored so an approval can never be minted as approved without
        provisioning."""
        email = f"post-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = f"APR-{uuid.uuid4().hex[:10]}"
        resp = client.post("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"},
                           json={"id": approval_id, "type": "Instructor Access",
                                 "entity": "Test Entity", "contact": email,
                                 "details": {}, "status": "approved"})
        assert resp.status_code in (200, 201), resp.text
        rows = client.get("/api/approvals", headers={"Authorization": f"Bearer {admin_token}"}).json()
        row = next(r for r in rows if r["id"] == approval_id)
        assert row["status"] == "pending", \
            "POST /api/approvals honoured a client-supplied approved status; status must be pending here"

    def test_approving_activates_an_account_left_pending_by_signup(self, client, admin_token):
        """A pending account created by public sign-up is activated by approval.

        Students (open registration) are the reviewer-gated self-service role:
        they register 'pending' and cannot sign in until a reviewer approves.
        Refusing to touch the existing pending row meant the reviewer's approval
        had no effect -- the applicant stayed unable to sign in and was never
        issued a working pass.
        """
        email = f"pendact-{uuid.uuid4().hex[:8]}@example.com"
        created = client.post("/api/users/register", json={
            "email": email, "full_name": "Pending Student", "role": "student"})
        assert created.status_code == 201, created.text

        # Pending, so it cannot sign in yet.
        assert client.post("/api/login", json={
            "email": email,
            "password": created.json().get("temporary_password") or "x"}).status_code in (401, 403)

        approval_id = self._submit(client, admin_token, "Student Registration", email)
        account = self._approve(client, admin_token, approval_id)["account"]
        assert account["provisioned"] is True, \
            "approving did not activate the account left pending by sign-up"
        assert account.get("activated_existing") is True
        assert account["role"] == "student"

        login = client.post("/api/login", json={
            "email": email, "password": account["temporary_password"]})
        assert login.status_code == 200, login.text
        assert login.json()["role"] == "student"

    def test_mine_route_is_unshadowed(self, client, admin_token):
        """POST /api/approvals/mine used to be registered twice; the earlier
        stale handler shadowed the real one and typed every approval with the raw
        role name, which _provision_approved_account could never map ('No role
        mapping ...' -> account never activated). Removing the duplicate means the
        real handler dispatches, so an actor with no onboarding form is rejected
        loudly instead of silently writing a mistyped row."""
        # A user with no onboarding form (student) must get a clear 400 from the
        # real handler, not a 200 that writes a raw-role approval row.
        from app.security import clear_all_rate_limits
        email = f"shadow-{uuid.uuid4().hex[:8]}@example.com"
        created = client.post("/api/users/register", json={
            "email": email, "full_name": "Shadow Check", "role": "student"})
        assert created.status_code == 201, created.text
        clear_all_rate_limits()
        login = client.post("/api/login", json={
            "email": email, "password": created.json()["temporary_password"]})
        assert login.status_code in (401, 403), "student must stay pending"

        clear_all_rate_limits()
        # Activate the student (admin) so they can call the endpoint as any user.
        users = client.get("/api/users", headers={
            "Authorization": f"Bearer {admin_token}"}).json()
        sid = next(u["id"] for u in users if u["email"].lower() == email)
        assert client.patch(f"/api/users/{sid}",
                            headers={"Authorization": f"Bearer {admin_token}"},
                            json={"email": email, "full_name": "Shadow Check",
                                  "role": "student", "status": "active"}).status_code == 200
        clear_all_rate_limits()
        login = client.post("/api/login", json={
            "email": email, "password": created.json()["temporary_password"]})
        assert login.status_code == 200, login.text
        stoken = login.json()["token"]

        resp = client.post("/api/approvals/mine", headers={
            "Authorization": f"Bearer {stoken}"}, json={})
        # The real handler 400s roles without an onboarding form; the shadowed
        # one would have returned 200 and written a row typed 'student'.
        assert resp.status_code == 400, resp.text
        assert "does not require onboarding" in resp.json()["detail"]

    def test_self_service_judge_can_file_onboarding_typed_judge_access(self, client, admin_token):
        """Judges/sponsors are self-service (active on registration), but they
        can still file a profile-onboarding approval via /api/approvals/mine.
        The handler must type it 'Judge Access' (which _provision understands)
        rather than the raw role name the shadowed handler wrote. Because the
        account is ALREADY active, approving is an idempotent no-op that must NOT
        error or re-provision."""
        from app.security import clear_all_rate_limits

        email = f"live-onboard-{uuid.uuid4().hex[:8]}@example.com"
        created = client.post("/api/users/register", json={
            "email": email, "full_name": "Live Onboard Judge", "role": "judge"})
        assert created.status_code == 201, created.text

        clear_all_rate_limits()
        login = client.post("/api/login", json={
            "email": email, "password": created.json()["temporary_password"]})
        assert login.status_code == 200, login.text
        token = login.json()["token"]

        mine = client.post("/api/approvals/mine", headers={
            "Authorization": f"Bearer {token}"}, json={})
        assert mine.status_code == 201, mine.text

        rows = client.get("/api/approvals", headers={
            "Authorization": f"Bearer {admin_token}"}).json()
        mine_row = next(r for r in rows if r["id"] == mine.json()["id"])
        assert mine_row["type"] == "Judge Access", mine_row["type"]

        # Approving is idempotent for a self-service (already-active) account.
        result = self._approve(client, admin_token, mine.json()["id"])
        assert result["account"]["provisioned"] is False
        assert "already exists" in result["account"]["reason"].lower()

    def test_self_service_sponsor_can_file_onboarding_typed_sponsor_access(self, client, admin_token):
        """Mirror of the judge case for the sponsor role."""
        from app.security import clear_all_rate_limits

        email = f"live-sponsor-{uuid.uuid4().hex[:8]}@example.com"
        created = client.post("/api/users/register", json={
            "email": email, "full_name": "Live Sponsor", "role": "sponsor"})
        assert created.status_code == 201, created.text

        clear_all_rate_limits()
        login = client.post("/api/login", json={
            "email": email, "password": created.json()["temporary_password"]})
        assert login.status_code == 200, login.text
        token = login.json()["token"]

        mine = client.post("/api/approvals/mine", headers={
            "Authorization": f"Bearer {token}"}, json={})
        assert mine.status_code == 201, mine.text

        rows = client.get("/api/approvals", headers={
            "Authorization": f"Bearer {admin_token}"}).json()
        mine_row = next(r for r in rows if r["id"] == mine.json()["id"])
        assert mine_row["type"] == "Sponsor Access", mine_row["type"]

        result = self._approve(client, admin_token, mine.json()["id"])
        assert result["account"]["provisioned"] is False
        assert "already exists" in result["account"]["reason"].lower()

    def test_approving_does_not_reactivate_a_suspended_account(self, client, admin_token):
        """A suspension is a deliberate admin action, not something an approval
        may quietly undo."""
        email = f"susp-{uuid.uuid4().hex[:8]}@example.com"
        approval_id = self._submit(client, admin_token, "Instructor Access", email)
        first = self._approve(client, admin_token, approval_id)["account"]
        assert first["provisioned"] is True

        users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"}).json()
        user_id = next(u["id"] for u in users if u["email"].lower() == email)
        suspended = client.patch(f"/api/users/{user_id}",
                                 headers={"Authorization": f"Bearer {admin_token}"},
                                 json={"email": email, "full_name": "Suspended One",
                                       "role": "instructor", "status": "suspended"})
        assert suspended.status_code == 200, suspended.text

        again = self._approve(client, admin_token, approval_id)["account"]
        assert again["provisioned"] is False, \
            "approving an application re-activated a suspended account"
        assert client.post("/api/login", json={
            "email": email, "password": first["temporary_password"]}).status_code in (401, 403)


class TestPublicRegistrationCannotSelfActivate:
    def test_student_signup_is_forced_pending(self, client, admin_token):
        # This endpoint is unauthenticated; honouring a client-sent status let
        # anyone self-register as active and skip review. The education side
        # (students) is NOT self-service, so it must stay pending.
        email = f"selfact-{uuid.uuid4().hex[:8]}@example.com"
        resp = client.post("/api/users/register", json={
            "email": email, "full_name": "Self Activator",
            "role": "student", "status": "active"})
        assert resp.status_code == 201, resp.text
        users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"}).json()
        created = [u for u in users if u["email"].lower() == email]
        assert created, "user was not created"
        assert created[0]["status"] == "pending"

    def test_judge_signup_is_self_service_active(self, client, admin_token):
        # Product decision: judges and sponsors are self-service. Their account
        # must be active immediately, otherwise they cannot log in to reach their
        # portal / complete their profile -- the pending gate strangled the flow.
        from app.security import clear_all_rate_limits
        email = f"judgeaut-{uuid.uuid4().hex[:8]}@example.com"
        resp = client.post("/api/users/register", json={
            "email": email, "full_name": "Instant Judge",
            "role": "judge", "status": "pending"})
        assert resp.status_code == 201, resp.text
        users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"}).json()
        created = [u for u in users if u["email"].lower() == email]
        assert created and created[0]["status"] == "active", \
            "a judge self-registered but did not get instant active access"
        # And they can sign in right away with the server-minted pass.
        clear_all_rate_limits()
        login = client.post("/api/login", json={
            "email": email, "password": resp.json()["temporary_password"]})
        assert login.status_code == 200, login.text
        assert login.json()["role"] == "judge"

    def test_sponsor_signup_is_self_service_active(self, client, admin_token):
        from app.security import clear_all_rate_limits
        email = f"sponsoraut-{uuid.uuid4().hex[:8]}@example.com"
        resp = client.post("/api/users/register", json={
            "email": email, "full_name": "Instant Sponsor",
            "role": "sponsor", "status": "pending"})
        assert resp.status_code == 201, resp.text
        users = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"}).json()
        created = [u for u in users if u["email"].lower() == email]
        assert created and created[0]["status"] == "active"
        clear_all_rate_limits()
        login = client.post("/api/login", json={
            "email": email, "password": resp.json()["temporary_password"]})
        assert login.status_code == 200, login.text
        assert login.json()["role"] == "sponsor"

    def test_public_signup_cannot_choose_a_privileged_role(self, client):
        resp = client.post("/api/users/register", json={
            "email": f"esc-{uuid.uuid4().hex[:8]}@example.com",
            "full_name": "Escalator", "role": "super_admin"})
        assert resp.status_code == 403


class TestCycleScoping:
    """Records must be attributable to a cycle, and listable by it.

    Before this, only competition_registrations pointed at a cycle. Teams and
    submissions had no link at all, so every panel showed every record it could
    find and no two role views ever agreed on what was "in" a cycle.
    """

    def _cycle(self, client, admin_token, status="registration"):
        h = {"Authorization": f"Bearer {admin_token}"}
        cyc = client.post("/api/competitions", headers=h,
                          json={"title": f"Scoped {uuid.uuid4()}"}).json()
        if status != "draft":
            client.patch(f"/api/competitions/{cyc['id']}", headers=h,
                         json={"title": "x", "status": "registration"})
        return cyc["id"]

    def test_team_round_trips_its_cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cid = self._cycle(client, admin_token)
        created = client.post("/api/teams", headers=h,
                              json={"name": f"T{uuid.uuid4().hex[:6]}", "competition_id": cid})
        assert created.status_code == 201, created.text
        assert created.json()["competition_id"] == cid
        listed = client.get("/api/teams", headers=h).json()
        mine = [t for t in listed if t["id"] == created.json()["id"]]
        assert mine and mine[0]["competition_id"] == cid

    def test_teams_can_be_filtered_to_one_cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        a, b = self._cycle(client, admin_token), self._cycle(client, admin_token)
        in_a = client.post("/api/teams", headers=h,
                           json={"name": f"A{uuid.uuid4().hex[:6]}", "competition_id": a}).json()["id"]
        in_b = client.post("/api/teams", headers=h,
                           json={"name": f"B{uuid.uuid4().hex[:6]}", "competition_id": b}).json()["id"]
        ids = [t["id"] for t in client.get(f"/api/teams?competition_id={a}", headers=h).json()]
        assert in_a in ids and in_b not in ids

    def test_team_referencing_unknown_cycle_is_rejected(self, client, admin_token):
        resp = client.post("/api/teams", headers={"Authorization": f"Bearer {admin_token}"},
                           json={"name": "Orphan", "competition_id": "comp-does-not-exist"})
        assert resp.status_code == 422, resp.text
        assert "Unknown competition cycle" in resp.json()["detail"]

    def test_team_without_a_cycle_is_still_allowed(self, client, admin_token):
        # Not every team is cycle-scoped; the link is optional by design.
        resp = client.post("/api/teams", headers={"Authorization": f"Bearer {admin_token}"},
                           json={"name": f"Free{uuid.uuid4().hex[:6]}"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["competition_id"] is None

    def test_cycle_team_count_is_derived_not_hand_typed(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cid = self._cycle(client, admin_token)
        before = [c for c in client.get("/api/competitions").json() if c["id"] == cid][0]
        assert before["teams"] == 0
        client.post("/api/teams", headers=h,
                    json={"name": f"C{uuid.uuid4().hex[:6]}", "competition_id": cid})
        after = [c for c in client.get("/api/competitions").json() if c["id"] == cid][0]
        assert after["teams"] == 1, "team count should reflect reality, not the stored integer"

    def test_cycle_reports_entrant_count(self, client, admin_token, student_token):
        cid = self._cycle(client, admin_token)
        client.post("/api/competitions/register",
                    headers={"Authorization": f"Bearer {student_token}"},
                    json={"competition_id": cid})
        row = [c for c in client.get("/api/competitions").json() if c["id"] == cid][0]
        assert row["entrants"] >= 1

    def test_submissions_can_be_filtered_to_one_cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        a, b = self._cycle(client, admin_token), self._cycle(client, admin_token)
        st = client.post("/api/students", headers=h, json={
            "first_name": "Scope", "last_name": "Test",
            "email": f"scope-{uuid.uuid4().hex[:8]}@example.com"})
        assert st.status_code in (200, 201), st.text
        sid = st.json()["id"]
        sub_a = client.post("/api/submissions", headers=h, json={
            "student_id": sid, "source_code_path": "a.zip", "competition_id": a})
        assert sub_a.status_code == 201, sub_a.text
        client.post("/api/submissions", headers=h, json={
            "student_id": sid, "source_code_path": "b.zip", "competition_id": b})
        scoped = client.get(f"/api/submissions?competition_id={a}", headers=h).json()
        assert scoped, "expected at least one submission in cycle a"
        assert all(s["competition_id"] == a for s in scoped)

    def test_submission_referencing_unknown_cycle_is_rejected(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        st = client.post("/api/students", headers=h, json={
            "first_name": "Bad", "last_name": "Ref",
            "email": f"badref-{uuid.uuid4().hex[:8]}@example.com"}).json()
        resp = client.post("/api/submissions", headers=h, json={
            "student_id": st["id"], "source_code_path": "x.zip",
            "competition_id": "comp-nope"})
        assert resp.status_code == 422, resp.text

    def test_judge_queue_can_be_scoped_to_a_cycle(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        a, b = self._cycle(client, admin_token), self._cycle(client, admin_token)
        st = client.post("/api/students", headers=h, json={
            "first_name": "Queue", "last_name": "Scope",
            "email": f"queue-{uuid.uuid4().hex[:8]}@example.com"}).json()
        client.post("/api/submissions", headers=h, json={
            "student_id": st["id"], "source_code_path": "q.zip", "competition_id": a})
        client.post("/api/submissions", headers=h, json={
            "student_id": st["id"], "source_code_path": "r.zip", "competition_id": b})
        scoped = client.get(f"/api/judge/queue?competition_id={a}", headers=h).json()
        unscoped = client.get("/api/judge/queue", headers=h).json()
        assert scoped["pending_total"] >= 1
        assert scoped["pending_total"] <= unscoped["pending_total"]
        assert len(scoped["submissions"]) <= len(unscoped["submissions"])

    def test_deleting_a_cycle_leaves_its_teams_but_clears_stale_counts(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cid = self._cycle(client, admin_token)
        team_id = client.post("/api/teams", headers=h,
                              json={"name": f"Keep{uuid.uuid4().hex[:6]}",
                                    "competition_id": cid}).json()["id"]
        assert client.delete(f"/api/competitions/{cid}", headers=h).status_code == 200
        # The team record survives -- it is history -- and the cycle is gone.
        assert any(t["id"] == team_id for t in client.get("/api/teams", headers=h).json())
        assert not any(c["id"] == cid for c in client.get("/api/competitions").json())


class TestTeamChangeApproval:
    """An institution proposes team changes; only an admin decides them.

    The workflow existed in the UI but was unreachable: a school admin's request
    went to POST /api/bulk-sync (admin only) and POST /api/approvals
    (APPROVAL_ROLES, which excludes school_admin), so both 403'd and the request
    never left the browser while the UI still reported success.
    """

    def _school_admin(self, client, admin_token, school: str):
        """A school_admin whose account is linked to `school`."""
        from app.security import clear_all_rate_limits
        email = f"sa-{uuid.uuid4().hex[:8]}@ntic.test"
        password = "Ada-Foah-Estuary-Bright-33"
        resp = client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"},
                           json={"email": email, "full_name": "School Admin",
                                 "role": "school_admin", "password": password,
                                 "status": "Active", "organization": school})
        assert resp.status_code in (200, 201), resp.text
        clear_all_rate_limits()
        login = client.post("/api/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        return login.json()["token"]

    def _team(self, client, admin_token, school: str):
        name = f"Squad{uuid.uuid4().hex[:6]}"
        resp = client.post("/api/teams", headers={"Authorization": f"Bearer {admin_token}"},
                           json={"name": name, "school_name": school})
        assert resp.status_code == 201, resp.text
        return resp.json()["id"], name

    def test_school_admin_can_file_a_rename_for_its_own_team(self, client, admin_token):
        school = f"Accra Academy {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        team_id, original = self._team(client, admin_token, school)
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Modification", "team_id": team_id,
                                 "name": "Renamed Squad", "members": ["A", "B"]})
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "pending"
        assert body["school"] == school
        assert original in body["entity"] and "Renamed Squad" in body["entity"]

    def test_the_rename_does_not_touch_the_team_until_approved(self, client, admin_token):
        school = f"Mfantsipim {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        team_id, original = self._team(client, admin_token, school)
        client.post("/api/approvals/team-change",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"type": "Team Modification", "team_id": team_id,
                          "name": "Should Not Apply Yet"})
        teams = client.get("/api/teams", headers={"Authorization": f"Bearer {admin_token}"}).json()
        live = next(t for t in teams if t["id"] == team_id)
        assert live["name"] == original

    def test_school_admin_cannot_file_against_another_school(self, client, admin_token):
        mine = f"Wesley Girls {uuid.uuid4().hex[:5]}"
        theirs = f"Prempeh College {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, mine)
        other_team_id, _ = self._team(client, admin_token, theirs)
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Modification", "team_id": other_team_id,
                                 "name": "Hijacked"})
        # 404, not 403: the existence of another school's team is not disclosed.
        assert resp.status_code == 404, resp.text

    def test_school_is_taken_from_the_session_not_the_body(self, client, admin_token):
        school = f"Achimota {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Addition", "name": "New Squad",
                                 "school": "Somebody Else", "institution": "Somebody Else"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["school"] == school

    def test_a_client_cannot_file_a_pre_approved_request(self, client, admin_token):
        school = f"Adisadel {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Addition", "name": "Sneaky",
                                 "status": "approved"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "pending"

    def test_an_unknown_change_type_is_rejected(self, client, admin_token):
        token = self._school_admin(client, admin_token, f"Keta {uuid.uuid4().hex[:5]}")
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Deletion", "name": "X"})
        assert resp.status_code == 400, resp.text

    def test_a_student_cannot_propose_team_changes(self, client, student_token):
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {student_token}"},
                           json={"type": "Team Addition", "name": "Student Squad"})
        assert resp.status_code == 403, resp.text

    def test_an_account_with_no_institution_is_told_why(self, client, admin_token):
        token = self._school_admin(client, admin_token, "")
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Addition", "name": "Orphan Squad"})
        assert resp.status_code == 409, resp.text
        assert "institution" in resp.json()["detail"].lower()

    def test_modification_requires_a_team_id(self, client, admin_token):
        token = self._school_admin(client, admin_token, f"Tamale SHS {uuid.uuid4().hex[:5]}")
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Modification", "name": "No Id"})
        assert resp.status_code == 400, resp.text

    def test_institutions_can_no_longer_write_teams_directly(self, client, admin_token):
        """The gate has to be server-side or it is only advice."""
        school = f"Bypass Test {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        h = {"Authorization": f"Bearer {token}"}
        team_id, _ = self._team(client, admin_token, school)
        assert client.post("/api/teams", headers=h,
                           json={"name": "Direct", "school_name": school}).status_code == 403
        assert client.patch(f"/api/teams/{team_id}", headers=h,
                            json={"name": "Direct Rename"}).status_code == 403
        assert client.delete(f"/api/teams/{team_id}", headers=h).status_code == 403


    def test_a_disbandment_request_does_not_remove_the_team_until_approved(self, client, admin_token):
        school = f"Disband {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        team_id, _ = self._team(client, admin_token, school)
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Disbandment", "team_id": team_id,
                                 "name": "ignored"})
        assert resp.status_code == 201, resp.text
        teams = client.get("/api/teams", headers={"Authorization": f"Bearer {admin_token}"}).json()
        assert any(t["id"] == team_id for t in teams), "team was removed before approval"

    def test_approving_a_disbandment_actually_removes_the_team(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Disband OK {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        team_id, _ = self._team(client, admin_token, school)
        req = client.post("/api/approvals/team-change",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"type": "Team Disbandment", "team_id": team_id,
                                "name": "ignored"}).json()
        patch = client.patch(f"/api/approvals/{req['id']}", headers=h,
                             json={"status": "approved", "reviewer": "admin"})
        assert patch.status_code == 200, patch.text
        assert patch.json()["team_change"]["applied"] is True
        teams = client.get("/api/teams", headers=h).json()
        assert not any(t["id"] == team_id for t in teams), "team survived an approved disbandment"

    def test_rejecting_a_disbandment_leaves_the_team_alone(self, client, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Disband No {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        team_id, _ = self._team(client, admin_token, school)
        req = client.post("/api/approvals/team-change",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"type": "Team Disbandment", "team_id": team_id,
                                "name": "ignored"}).json()
        client.patch(f"/api/approvals/{req['id']}", headers=h,
                     json={"status": "rejected", "reviewer": "admin",
                           "rejection_reasons": "Still competing"})
        teams = client.get("/api/teams", headers=h).json()
        assert any(t["id"] == team_id for t in teams)

    def test_disbandment_requires_a_team_id(self, client, admin_token):
        token = self._school_admin(client, admin_token, f"NoId {uuid.uuid4().hex[:5]}")
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Disbandment", "name": "x"})
        assert resp.status_code == 400, resp.text

    def test_cannot_request_disbandment_of_another_schools_team(self, client, admin_token):
        token = self._school_admin(client, admin_token, f"Mine {uuid.uuid4().hex[:5]}")
        other_id, _ = self._team(client, admin_token, f"Theirs {uuid.uuid4().hex[:5]}")
        resp = client.post("/api/approvals/team-change",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"type": "Team Disbandment", "team_id": other_id,
                                 "name": "x"})
        assert resp.status_code == 404, resp.text


    def test_an_institution_can_see_its_own_request_and_the_outcome(self, client, admin_token):
        """Without this the requester never learns the decision or its reason."""
        h = {"Authorization": f"Bearer {admin_token}"}
        school = f"Sees Own {uuid.uuid4().hex[:5]}"
        token = self._school_admin(client, admin_token, school)
        team_id, _ = self._team(client, admin_token, school)
        req = client.post("/api/approvals/team-change",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"type": "Team Modification", "team_id": team_id,
                                "name": "Pending Look"}).json()

        mine = client.get("/api/approvals/mine",
                          headers={"Authorization": f"Bearer {token}"})
        assert mine.status_code == 200, mine.text
        found = next(a for a in mine.json() if a["id"] == req["id"])
        assert found["status"] == "pending"

        client.patch(f"/api/approvals/{req['id']}", headers=h,
                     json={"status": "rejected", "reviewer": "admin",
                           "rejection_reasons": "Name already taken",
                           "rejection_notes": "Pick another"})
        after = client.get("/api/approvals/mine",
                           headers={"Authorization": f"Bearer {token}"}).json()
        decided = next(a for a in after if a["id"] == req["id"])
        assert decided["status"] == "rejected"
        assert decided["rejectionReasons"] == "Name already taken"

    def test_mine_does_not_leak_other_applicants(self, client, admin_token):
        a_token = self._school_admin(client, admin_token, f"A {uuid.uuid4().hex[:5]}")
        b_school = f"B {uuid.uuid4().hex[:5]}"
        b_token = self._school_admin(client, admin_token, b_school)
        b_team, _ = self._team(client, admin_token, b_school)
        b_req = client.post("/api/approvals/team-change",
                            headers={"Authorization": f"Bearer {b_token}"},
                            json={"type": "Team Modification", "team_id": b_team,
                                  "name": "B Only"}).json()
        a_sees = client.get("/api/approvals/mine",
                            headers={"Authorization": f"Bearer {a_token}"}).json()
        assert not any(x["id"] == b_req["id"] for x in a_sees)

    def test_mine_requires_a_session(self, client):
        assert client.get("/api/approvals/mine").status_code == 401


def _mark_contact_verified(email: str) -> None:
    """Insert a consumed contact_verification OTP for `email`, so a public
    application can pass the server-side verification gate in these tests."""
    from app.database import get_db_connection, release_db_connection
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO otp_challenges (id, purpose, channel, target, code_hash, max_attempts, consumed_at, expires_at) "
            "VALUES (%s, 'contact_verification', 'email', %s, 'dummy', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 minutes')",
            (f"otp-{uuid.uuid4().hex}", email),
        )
        conn.commit()
        cur.close()
    finally:
        release_db_connection(conn)


class TestDuplicateContactGate:
    """Duplicate email / phone must actually be caught.

    The frontend's local isEmailTaken/isPhoneTaken scan contentService.users,
    which comes from the admin-only GET /api/users -- so for an anonymous
    registrant it is empty and those checks never fire. These prove the checks
    that DO hold: the live availability endpoint, and the server-side rejection
    of an application whose email already has an account (which used to be
    accepted, approved, and then silently fail to provision).
    """

    def _clear(self):
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()

    def _user(self, client, admin_token, phone=None):
        email = f"dup-{uuid.uuid4().hex[:8]}@ntic.test"
        body = {"email": email, "full_name": "Dup Check", "role": "student",
                "password": "Nzulezu-Stilt-Village-7", "status": "Active"}
        if phone:
            body["phone"] = phone
        resp = client.post("/api/users", headers={"Authorization": f"Bearer {admin_token}"}, json=body)
        assert resp.status_code in (200, 201), resp.text
        self._clear()
        return email

    def test_availability_endpoint_detects_a_taken_email(self, client, admin_token):
        email = self._user(client, admin_token)
        self._clear()
        resp = client.get(f"/api/auth/check-availability?email={email}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["email_taken"] is True

    def test_availability_is_case_insensitive_for_email(self, client, admin_token):
        email = self._user(client, admin_token)
        self._clear()
        resp = client.get(f"/api/auth/check-availability?email={email.upper()}")
        assert resp.json()["email_taken"] is True

    def test_availability_detects_a_taken_phone_in_any_format(self, client, admin_token):
        digits = f"24{uuid.uuid4().int % 10000000:07d}"
        self._user(client, admin_token, phone=f"0{digits}")
        self._clear()
        # Local, international and 233-prefixed forms must all match.
        for form in (f"0{digits}", f"+233{digits}", f"233{digits}"):
            resp = client.get(f"/api/auth/check-availability?phone={form}")
            assert resp.json()["phone_taken"] is True, form

    def test_availability_reports_a_free_contact(self, client):
        self._clear()
        resp = client.get(f"/api/auth/check-availability?email=free-{uuid.uuid4().hex[:8]}@ntic.test")
        assert resp.json()["email_taken"] is False

    def test_public_application_is_rejected_when_the_email_already_has_an_account(self, client, admin_token):
        """This is the hole: it used to be accepted, then approving it silently
        provisioned nothing because provisioning is idempotent."""
        email = self._user(client, admin_token)
        self._clear()
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "Dup School", "contact": email})
        assert resp.status_code == 409, resp.text
        assert "already exists" in resp.json()["detail"].lower()

    def test_a_fresh_email_can_still_apply(self, client):
        self._clear()
        contact = f"fresh-{uuid.uuid4().hex[:8]}@ntic.test"
        _mark_contact_verified(contact)
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "Fresh School",
            "contact": contact})
        assert resp.status_code == 201, resp.text

    def test_public_register_rejects_a_duplicate_email(self, client, admin_token):
        email = self._user(client, admin_token)
        self._clear()
        resp = client.post("/api/users/register", json={
            "email": email, "full_name": "Dup Again", "role": "judge"})
        assert resp.status_code == 400, resp.text
        assert "already registered" in resp.json()["detail"].lower()

    def test_public_register_rejects_a_duplicate_phone(self, client, admin_token):
        digits = f"27{uuid.uuid4().int % 10000000:07d}"
        phone = f"0{digits}"
        self._user(client, admin_token, phone=phone)
        self._clear()
        resp = client.post("/api/users/register", json={
            "email": f"other-{uuid.uuid4().hex[:8]}@ntic.test", "full_name": "Other",
            "role": "judge", "phone": phone})
        assert resp.status_code == 400, resp.text
        assert "phone" in resp.json()["detail"].lower()


class TestPublicApplicationReachesTheQueue:
    """Public registration has to reach a reviewer.

    Applications were persisted only via contentService.saveApprovals() ->
    POST /api/bulk-sync, which is admin-only. For an anonymous applicant every
    write 401'd, so the applicant got a confirmation email and the reviewer queue
    stayed empty.
    """

    def _clear_limits(self):
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()

    def test_an_anonymous_applicant_can_file_an_application(self, client, admin_token):
        self._clear_limits()
        contact = f"school-{uuid.uuid4().hex[:8]}@example.com"
        _mark_contact_verified(contact)
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "Kumasi High",
            "contact": contact, "details": {"region": "Ashanti"}})
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "pending"
        queue = client.get("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"}).json()
        assert any((a.get("contact") or "").lower() == contact for a in queue), \
            "application did not reach the reviewer queue"

    def test_unverified_contact_is_refused(self, client):
        self._clear_limits()
        contact = f"noverify-{uuid.uuid4().hex[:8]}@example.com"
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "No Verify", "contact": contact})
        assert resp.status_code == 403, resp.text
        assert "verify" in resp.json()["detail"].lower()

    def test_the_application_is_always_pending(self, client, admin_token):
        self._clear_limits()
        contact = f"sneaky-{uuid.uuid4().hex[:8]}@example.com"
        _mark_contact_verified(contact)
        client.post("/api/approvals/public", json={
            "type": "Judge Access", "entity": "Self Approver",
            "contact": contact, "status": "approved", "id": "apr-forged"})
        queue = client.get("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"}).json()
        row = next(a for a in queue if (a.get("contact") or "").lower() == contact)
        assert row["status"] == "pending"
        # The id is generated server-side, so a caller cannot target an existing row.
        assert row["id"] != "apr-forged"

    def test_an_unlisted_type_is_refused(self, client):
        self._clear_limits()
        resp = client.post("/api/approvals/public", json={
            "type": "Team Disbandment", "entity": "X",
            "contact": f"x-{uuid.uuid4().hex[:6]}@example.com"})
        assert resp.status_code == 400, resp.text

    def test_resubmitting_updates_rather_than_duplicates(self, client, admin_token):
        self._clear_limits()
        contact = f"resub-{uuid.uuid4().hex[:8]}@example.com"
        _mark_contact_verified(contact)
        first = client.post("/api/approvals/public", json={
            "type": "Instructor Access", "entity": "First Try", "contact": contact})
        second = client.post("/api/approvals/public", json={
            "type": "Instructor Access", "entity": "Second Try", "contact": contact})
        assert first.status_code == 201 and second.status_code == 201
        assert first.json()["id"] == second.json()["id"]
        queue = client.get("/api/approvals",
                           headers={"Authorization": f"Bearer {admin_token}"}).json()
        mine = [a for a in queue if (a.get("contact") or "").lower() == contact]
        assert len(mine) == 1, "resubmitting stacked duplicates in the queue"
        assert mine[0]["entity"] == "Second Try"

    def test_it_is_rate_limited(self, client):
        self._clear_limits()
        codes = []
        for i in range(8):
            codes.append(client.post("/api/approvals/public", json={
                "type": "Sponsor Access", "entity": f"Flood {i}",
                "contact": f"flood-{i}-{uuid.uuid4().hex[:6]}@example.com"}).status_code)
        assert 429 in codes, f"no rate limiting applied: {codes}"

    def test_oversized_detail_is_refused(self, client):
        self._clear_limits()
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "Big",
            "contact": f"big-{uuid.uuid4().hex[:6]}@example.com",
            "details": {f"k{i}": "v" for i in range(200)}})
        assert resp.status_code == 400, resp.text

    def test_open_registration_can_create_a_participant(self, client, admin_token):
        """The open tab called the admin-only POST /api/users, so nothing was made."""
        self._clear_limits()
        email = f"open-{uuid.uuid4().hex[:8]}@example.com"
        resp = client.post("/api/users/register", json={
            "email": email, "full_name": "Open Entrant", "role": "student"})
        assert resp.status_code == 201, resp.text
        users = client.get("/api/users",
                           headers={"Authorization": f"Bearer {admin_token}"}).json()
        created = [u for u in users if u["email"].lower() == email]
        assert created, "participant was not created"
        # Still pending: public sign-up must not self-activate.
        assert created[0]["status"] == "pending"
        # The pending student must have an 'Open Registration' approval in the
        # queue, or there is no reviewer action that can ever activate them.
        h = {"Authorization": f"Bearer {admin_token}"}
        queue = client.get("/api/approvals", headers=h).json()
        mine = [a for a in queue
                if (a.get("contact") or "").lower() == email
                and a.get("type") == "Open Registration"]
        assert mine, "open registration filed no approval, so the pending student can never be activated"
        approval_id = mine[0]["id"]
        # Approving activates the pending student account and issues a working pass.
        patch = client.patch(f"/api/approvals/{approval_id}", headers=h,
                             json={"status": "approved", "reviewer": "admin@ntic.org.gh"})
        assert patch.status_code == 200, patch.text
        account = patch.json().get("account") or {}
        assert account.get("activated_existing") is True, \
            f"expected to activate the pending student account, got {account}"
        assert account.get("temporary_password") and account.get("ticket")
        users = client.get("/api/users", headers=h).json()
        activated = [u for u in users if u["email"].lower() == email]
        assert activated and activated[0]["status"] == "active", \
            "approving the open registration did not activate the pending student"
        self._clear_limits()
        login = client.post("/api/login", json={
            "email": email, "password": account["temporary_password"]})
        assert login.status_code == 200, login.text
        assert login.json()["role"] == "student"

    def test_public_registration_still_cannot_take_a_privileged_role(self, client):
        self._clear_limits()
        for role in ("admin", "super_admin", "school_admin", "instructor"):
            resp = client.post("/api/users/register", json={
                "email": f"esc-{uuid.uuid4().hex[:8]}@example.com",
                "full_name": "Escalator", "role": role})
            assert resp.status_code == 403, f"{role} was allowed: {resp.text}"

    def test_applications_can_be_scoped_to_a_cycle(self, client, admin_token):
        """The reviewer queue could not be filtered by cycle at all before this."""
        self._clear_limits()
        h = {"Authorization": f"Bearer {admin_token}"}
        cid = client.post("/api/competitions", headers=h, json={
            "title": f"Cycle {uuid.uuid4().hex[:6]}", "year": 2026}).json()["id"]
        scoped_contact = f"scoped-{uuid.uuid4().hex[:8]}@example.com"
        unscoped_contact = f"unscoped-{uuid.uuid4().hex[:8]}@example.com"
        _mark_contact_verified(scoped_contact)
        _mark_contact_verified(unscoped_contact)
        client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "In Cycle",
            "contact": scoped_contact, "competition_id": cid})
        client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "No Cycle",
            "contact": unscoped_contact})

        scoped = client.get(f"/api/approvals?competition_id={cid}", headers=h).json()
        assert [a["contact"] for a in scoped] == [scoped_contact]
        assert all(a["competitionId"] == cid for a in scoped)
        # And the unscoped view still returns everything.
        assert len(client.get("/api/approvals", headers=h).json()) > len(scoped)

    def test_a_bad_cycle_reference_is_rejected(self, client):
        """Storing an id that matches nothing is how records became invisible."""
        self._clear_limits()
        contact = f"badref-{uuid.uuid4().hex[:6]}@example.com"
        _mark_contact_verified(contact)
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": "Bad Ref",
            "contact": contact,
            "competition_id": "comp-does-not-exist"})
        # 422 is what _validate_competition_ref raises for an unknown cycle.
        assert resp.status_code == 422, resp.text
        assert "comp-does-not-exist" in resp.json()["detail"]


class TestCheckAvailability:
    def test_existing_email_returns_taken(self, client):
        resp = client.get("/api/auth/check-availability?email=admin@ntic.org.gh")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email_taken"] is True

    def test_existing_email_case_insensitive(self, client):
        resp = client.get("/api/auth/check-availability?email=ADMIN@NTIC.ORG.GH")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email_taken"] is True

    def test_new_email_returns_available(self, client):
        import uuid
        random_email = f"user-{uuid.uuid4().hex[:10]}@notregistereddomain.org"
        resp = client.get(f"/api/auth/check-availability?email={random_email}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email_taken"] is False

    def test_empty_query_returns_false(self, client):
        resp = client.get("/api/auth/check-availability")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email_taken"] is False
        assert data["phone_taken"] is False

    def test_pending_approval_email_returns_taken(self, client):
        import uuid
        pending_email = f"pending-{uuid.uuid4().hex[:8]}@school.edu.gh"
        _mark_contact_verified(pending_email)
        client.post("/api/approvals/public", json={
            "type": "School Registration",
            "entity": "St. Peters",
            "contact": pending_email
        })
        resp = client.get(f"/api/auth/check-availability?email={pending_email}")
        assert resp.status_code == 200
        assert resp.json()["email_taken"] is True


class TestPublicStatusLookupRedaction:
    """The public status lookup must not leak the secret application code.

    The code is the credential that unlocks the applicant's full details, so a
    match on a guessable email or entity name must NOT echo the code back (nor
    the rejection reasons/notes). Only an exact code match returns everything.
    """

    def _clear_limits(self):
        from app.security import clear_all_rate_limits
        clear_all_rate_limits()

    def _file(self, client, email, code, entity="Redact School"):
        _mark_contact_verified(email)
        resp = client.post("/api/approvals/public", json={
            "type": "School Registration", "entity": entity, "contact": email,
            "details": {"code": code, "repName": "Secret Rep", "region": "Ashanti"}})
        assert resp.status_code == 201, resp.text

    def test_email_match_redacts_everything_including_the_code(self, client):
        self._clear_limits()
        email = f"redact-{uuid.uuid4().hex[:8]}@example.com"
        code = f"NTIC-{uuid.uuid4().hex[:6].upper()}"
        self._file(client, email, code)
        self._clear_limits()
        resp = client.get(f"/api/approvals/status?query={email}")
        assert resp.status_code == 200
        app = resp.json()["application"]
        assert app["contact"] == "", "contact must not be returned on an email match"
        assert app["details"] == {}, "details (incl. the secret code) must not be returned"
        assert app["reviewer"] is None
        assert app["rejectionReasons"] is None
        # The code itself must not be discoverable from an email match.
        assert code.lower() not in resp.text.lower()

    def test_entity_match_is_also_redacted(self, client):
        self._clear_limits()
        email = f"redact2-{uuid.uuid4().hex[:8]}@example.com"
        code = f"NTIC-{uuid.uuid4().hex[:6].upper()}"
        self._file(client, email, code, entity="Unique School Name")
        self._clear_limits()
        resp = client.get("/api/approvals/status?query=unique school name")
        assert resp.status_code == 200
        app = resp.json()["application"]
        assert app["contact"] == ""
        assert app["details"] == {}
        assert code.lower() not in resp.text.lower()

    def test_code_match_returns_full_details(self, client):
        self._clear_limits()
        email = f"fullcode-{uuid.uuid4().hex[:8]}@example.com"
        code = f"NTIC-{uuid.uuid4().hex[:6].upper()}"
        self._file(client, email, code)
        self._clear_limits()
        resp = client.get(f"/api/approvals/status?query={code.lower()}")
        assert resp.status_code == 200
        app = resp.json()["application"]
        assert app["contact"].lower() == email
        assert app["details"].get("repName") == "Secret Rep"

