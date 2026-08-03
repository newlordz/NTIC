import os
import uuid
import random
import datetime
from contextlib import asynccontextmanager
from app.config import settings
from app.database import init_postgres_db, get_db_connection
from app.security import verify_password, create_token, require_auth, require_admin

try:
    from fastapi import FastAPI, HTTPException, status, Request, Depends
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, JSONResponse
    from httpx import AsyncClient
    from pydantic import BaseModel

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        init_postgres_db()
        yield

    app = FastAPI(
        title="NTIC Platform Python API",
        description="Backend API powered by Python & PostgreSQL",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class StudentCreate(BaseModel):
        first_name: str
        last_name: str
        email: str
        track: str = "Coding"
        consent_granted: bool = True
        tenant_id: str = "11111111-1111-1111-1111-111111111111"

    class SubmissionCreate(BaseModel):
        student_id: str
        source_code_path: str
        video_url: str = ""
        tenant_id: str = "11111111-1111-1111-1111-111111111111"

    class EventCreate(BaseModel):
        title: str
        date: str
        time: str
        location: str
        description: str
        type: str = "competition"

    class StoryCreate(BaseModel):
        title: str
        excerpt: str
        date: str
        image: str = "assets/ntic_image_4.jpeg"

    class SchoolCreate(BaseModel):
        name: str
        region: str
        teams: int = 1
        score: int = 100
        rank: int = 1
        status: str = "Active"

    @app.get("/api/health")
    def health_check():
        conn = get_db_connection()
        db_status = "connected" if conn else "disconnected"
        if conn:
            conn.close()
        return {
            "status": "ok",
            "database": db_status
        }

    # AUTH
    class LoginRequest(BaseModel):
        email: str
        password: str

    def _get_db():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        return conn

    @app.post("/api/login")
    def login(payload: LoginRequest):
        conn = _get_db()
        cur = conn.cursor()
        email = payload.email.strip().lower()
        try:
            cur.execute(
                "SELECT id, email, full_name, role, ticket, password_hash, status FROM users WHERE lower(email) = %s",
                (email,),
            )
            row = cur.fetchone()
        finally:
            cur.close()
            conn.close()

        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        user_id, db_email, full_name, role, ticket, password_hash, status = row
        if not verify_password(payload.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_token()
        expires_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=7)
        conn = _get_db()
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (%s, %s, %s, %s)",
                (token, user_id, db_email, expires_at),
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=500, detail=str(e))
        cur.close()
        conn.close()

        return {
            "token": token,
            "user_id": user_id,
            "email": db_email,
            "full_name": full_name,
            "role": role,
            "ticket": ticket,
            "status": status,
        }

    @app.post("/api/logout")
    def logout(payload: dict = None):
        payload = payload or {}
        token = payload.get("token", "")
        if token:
            conn = _get_db()
            cur = conn.cursor()
            try:
                cur.execute("DELETE FROM auth_sessions WHERE token = %s", (token,))
                conn.commit()
            except Exception:
                conn.rollback()
            cur.close()
            conn.close()
        return {"status": "ok"}

    # ─── AUTH SESSION MANAGEMENT ─────────────────────────────────────
    @app.get("/api/auth/sessions/count")
    def auth_sessions_count():
        conn = _get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT u.role, COUNT(*) FROM auth_sessions s "
            "JOIN users u ON s.user_id = u.id "
            "WHERE s.expires_at > CURRENT_TIMESTAMP "
            "GROUP BY u.role"
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        total = sum(r[1] for r in rows)
        by_role = {r[0]: r[1] for r in rows}
        return {"total": total, "by_role": by_role}

    @app.get("/api/auth/sessions")
    def auth_sessions_list(_admin: dict = Depends(require_admin)):
        conn = _get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT s.token, s.user_id, s.email, s.created_at, s.expires_at, u.full_name, u.role "
            "FROM auth_sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.expires_at > CURRENT_TIMESTAMP "
            "ORDER BY s.created_at DESC"
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        return [
            {"token": r[0], "user_id": r[1], "email": r[2], "created_at": str(r[3]),
             "expires_at": str(r[4]), "full_name": r[5], "role": r[6], "active": True}
            for r in rows
        ]

    @app.post("/api/auth/sessions/revoke")
    def auth_revoke_session(payload: dict, _admin: dict = Depends(require_admin)):
        token = payload.get("token", "").strip()
        if not token:
            raise HTTPException(status_code=400, detail="Token is required")
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_sessions WHERE token = %s", (token,))
        deleted = cur.rowcount
        conn.commit()
        cur.close(); conn.close()
        return {"status": "ok", "revoked": deleted > 0}

    @app.post("/api/auth/sessions/expire-user/{user_id}")
    def auth_expire_user_sessions(user_id: str, _admin: dict = Depends(require_admin)):
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
        deleted = cur.rowcount
        conn.commit()
        cur.close(); conn.close()
        return {"status": "ok", "expired": deleted}

    @app.post("/api/auth/sessions/revoke-all")
    def auth_revoke_all_sessions(request: Request, _admin: dict = Depends(require_admin)):
        """Revoke all active sessions except the caller's current token."""
        current_token = request.headers.get("Authorization", "")[7:]  # strip "Bearer "
        conn = _get_db()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM auth_sessions WHERE token != %s",
            (current_token,)
        )
        deleted = cur.rowcount
        conn.commit()
        cur.close(); conn.close()
        return {"status": "ok", "revoked": deleted}

    @app.post("/api/auth/token/generate")
    def generate_access_token(payload: dict = None, _admin: dict = Depends(require_admin)):
        payload = payload or {}
        role = payload.get("role", "student").lower()
        prefix_map = {
            "super_admin": "ADM", "judge": "JDG", "sponsor": "SPO",
            "student": "STU", "instructor": "INS", "content_manager": "MGR",
            "reviewer": "REV", "competition_manager": "CMP", "school_admin": "SCH"
        }
        prefix = prefix_map.get(role, "USR")
        while True:
            code = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=4))
            ticket = f"NTIC-{prefix}-{code}"
            conn = _get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM users WHERE ticket = %s", (ticket,))
            if cur.fetchone()[0] == 0:
                cur.close(); conn.close()
                break
            cur.close(); conn.close()
        return {"ticket": ticket}

    # CHAT
    class ChatRequest(BaseModel):
        system_instruction: dict = {}
        contents: list = []
        generationConfig: dict = {}

    @app.post("/api/chat")
    async def chat_proxy(payload: ChatRequest):
        if not settings.GEMINI_API_KEY:
            raise HTTPException(status_code=403, detail="AI service not configured")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={settings.GEMINI_API_KEY}"
        body = {
            "system_instruction": payload.system_instruction,
            "contents": payload.contents,
            "generationConfig": payload.generationConfig
        }
        async with AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=body)
            return resp.json()

    # TICKETS
    class TicketCreate(BaseModel):
        userId: str
        userName: str
        userRole: str
        userEmail: str
        chatHistory: list

    class TicketReply(BaseModel):
        agentName: str
        text: str

    class TicketStatusUpdate(BaseModel):
        status: str

    @app.post("/api/tickets", status_code=status.HTTP_201_CREATED)
    def create_ticket(payload: TicketCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"
        cur = conn.cursor()
        import json as _json
        try:
            cur.execute("""
                INSERT INTO support_tickets (id, user_id, user_name, user_role, user_email, chat_history)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                ticket_id, payload.userId, payload.userName,
                payload.userRole, payload.userEmail,
                _json.dumps([m.model_dump() if hasattr(m, 'model_dump') else m for m in payload.chatHistory])
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": ticket_id, "status": "open"}

    @app.get("/api/tickets")
    def list_tickets(user_id: str = None):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        if user_id:
            cur.execute("SELECT * FROM support_tickets WHERE user_id = %s ORDER BY last_updated DESC", (user_id,))
        else:
            cur.execute("SELECT * FROM support_tickets ORDER BY last_updated DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        cols = ["id", "user_id", "user_name", "user_role", "user_email", "status", "chat_history", "admin_replies", "created_at", "last_updated"]
        result = []
        for r in rows:
            d = dict(zip(cols, r))
            d["chat_history"] = _json.loads(d["chat_history"]) if isinstance(d["chat_history"], str) else d["chat_history"]
            d["admin_replies"] = _json.loads(d["admin_replies"]) if isinstance(d["admin_replies"], str) else d["admin_replies"]
            d["created_at"] = str(d["created_at"])
            d["last_updated"] = str(d["last_updated"])
            result.append(d)
        return result

    @app.get("/api/tickets/{ticket_id}")
    def get_ticket(ticket_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        cur.execute("SELECT * FROM support_tickets WHERE id = %s", (ticket_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")
        cols = ["id", "user_id", "user_name", "user_role", "user_email", "status", "chat_history", "admin_replies", "created_at", "last_updated"]
        d = dict(zip(cols, row))
        d["chat_history"] = _json.loads(d["chat_history"]) if isinstance(d["chat_history"], str) else d["chat_history"]
        d["admin_replies"] = _json.loads(d["admin_replies"]) if isinstance(d["admin_replies"], str) else d["admin_replies"]
        d["created_at"] = str(d["created_at"])
        d["last_updated"] = str(d["last_updated"])
        return d

    @app.post("/api/tickets/{ticket_id}/reply")
    def reply_to_ticket(ticket_id: str, payload: TicketReply):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        cur.execute("SELECT admin_replies FROM support_tickets WHERE id = %s", (ticket_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Ticket not found")
        existing = _json.loads(row[0]) if isinstance(row[0], str) else (row[0] or [])
        existing.append({
            "agentName": payload.agentName,
            "text": payload.text,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat()
        })
        cur.execute(
            "UPDATE support_tickets SET admin_replies = %s, status = 'in_progress', last_updated = CURRENT_TIMESTAMP WHERE id = %s",
            (_json.dumps(existing), ticket_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "ok"}

    @app.patch("/api/tickets/{ticket_id}/status")
    def update_ticket_status(ticket_id: str, payload: TicketStatusUpdate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute(
            "UPDATE support_tickets SET status = %s, last_updated = CURRENT_TIMESTAMP WHERE id = %s",
            (payload.status, ticket_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"status": payload.status}

    # STUDENTS
    @app.get("/api/students")
    def list_students():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tenant_id, first_name, last_name, email, track, consent_granted, created_at FROM students ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "tenant_id": r[1], "first_name": r[2], "last_name": r[3], "email": r[4], "track": r[5], "consent_granted": r[6], "created_at": str(r[7])} for r in rows]

    @app.post("/api/students", status_code=status.HTTP_201_CREATED)
    def create_student(payload: StudentCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        student_id = str(uuid.uuid4())
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO students (id, tenant_id, first_name, last_name, email, track, consent_granted) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (student_id, payload.tenant_id, payload.first_name, payload.last_name, payload.email, payload.track, payload.consent_granted))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": student_id, "first_name": payload.first_name, "last_name": payload.last_name, "email": payload.email, "track": payload.track}

    @app.delete("/api/students/{item_id}")
    def delete_student(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM students WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/students/{item_id}")
    def update_student(item_id: str, payload: StudentCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE students SET first_name = %s, last_name = %s, email = %s, track = %s, consent_granted = %s WHERE id = %s RETURNING id",
                (payload.first_name, payload.last_name, payload.email, payload.track, payload.consent_granted, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Student not found")
        return {"id": item_id, "status": "updated"}

    # SUBMISSIONS
    @app.get("/api/submissions")
    def list_submissions():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tenant_id, student_id, source_code_path, video_url, status, score, feedback, created_at FROM assignment_submissions ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "tenant_id": r[1], "student_id": r[2], "source_code_path": r[3], "video_url": r[4], "status": r[5], "score": r[6], "feedback": r[7], "created_at": str(r[8])} for r in rows]

    @app.post("/api/submissions", status_code=status.HTTP_201_CREATED)
    def create_submission(payload: SubmissionCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        sub_id = str(uuid.uuid4())
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO assignment_submissions (id, tenant_id, student_id, source_code_path, video_url, status) VALUES (%s, %s, %s, %s, %s, 'Pending')",
                        (sub_id, payload.tenant_id, payload.student_id, payload.source_code_path, payload.video_url))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": sub_id, "status": "Pending"}

    @app.delete("/api/submissions/{item_id}")
    def delete_submission(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM assignment_submissions WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    # SUBMISSION GRADING
    class GradeSubmissionRequest(BaseModel):
        score: int = None
        feedback: str = ""
        status: str = None

    @app.patch("/api/submissions/{item_id}/grade")
    def grade_submission(item_id: str, payload: GradeSubmissionRequest):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE assignment_submissions SET score = COALESCE(%s, score), feedback = COALESCE(%s, feedback), status = COALESCE(%s, status) WHERE id = %s RETURNING id",
                (payload.score, payload.feedback if payload.feedback != "" else None, payload.status, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Submission not found")
        return {"id": item_id, "status": "graded"}

    # COMPETITIONS
    class CompetitionCreate(BaseModel):
        title: str
        description: str = ""
        track: str = "Coding"
        category: str = ""
        deadline: str = ""
        status: str = "active"

    @app.get("/api/competitions")
    def list_competitions():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, description, track, category, deadline, status, created_at FROM competitions ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "title": r[1], "description": r[2], "track": r[3], "category": r[4], "deadline": r[5], "status": r[6], "created_at": str(r[7])} for r in rows]

    @app.post("/api/competitions", status_code=status.HTTP_201_CREATED)
    def create_competition(payload: CompetitionCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        comp_id = "comp-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO competitions (id, title, description, track, category, deadline, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (comp_id, payload.title, payload.description, payload.track, payload.category, payload.deadline, payload.status))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": comp_id, "title": payload.title, "status": payload.status}

    @app.patch("/api/competitions/{item_id}")
    def update_competition(item_id: str, payload: CompetitionCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE competitions SET title = %s, description = %s, track = %s, category = %s, deadline = %s, status = %s WHERE id = %s RETURNING id",
                (payload.title, payload.description, payload.track, payload.category, payload.deadline, payload.status, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Competition not found")
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/competitions/{item_id}")
    def delete_competition(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM competitions WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    # TEAMS
    class TeamCreate(BaseModel):
        name: str
        track: str = ""
        lead: str = ""
        members: int = 1
        status: str = "Active"
        school_name: str = ""

    @app.get("/api/teams")
    def list_teams():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, name, track, lead, members, status, school_name FROM teams ORDER BY name ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "name": r[1], "track": r[2], "lead": r[3], "members": r[4], "status": r[5], "school_name": r[6]} for r in rows]

    @app.post("/api/teams", status_code=status.HTTP_201_CREATED)
    def create_team(payload: TeamCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        team_id = "team-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO teams (id, name, track, lead, members, status, school_name) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (team_id, payload.name, payload.track, payload.lead, payload.members, payload.status, payload.school_name))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": team_id, "name": payload.name, "status": payload.status}

    @app.patch("/api/teams/{item_id}")
    def update_team(item_id: str, payload: TeamCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE teams SET name = %s, track = %s, lead = %s, members = %s, status = %s, school_name = %s WHERE id = %s RETURNING id",
                (payload.name, payload.track, payload.lead, payload.members, payload.status, payload.school_name, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Team not found")
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/teams/{item_id}")
    def delete_team(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM teams WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    # EVENTS
    @app.get("/api/events")
    def list_events():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, date, time, location, description, type FROM events")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "title": r[1], "date": r[2], "time": r[3], "location": r[4], "description": r[5], "type": r[6]} for r in rows]

    @app.post("/api/events", status_code=status.HTTP_201_CREATED)
    def create_event(payload: EventCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        evt_id = "evt-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO events (id, title, date, time, location, description, type) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (evt_id, payload.title, payload.date, payload.time, payload.location, payload.description, payload.type))
        conn.commit()
        cur.close()
        conn.close()
        return {"id": evt_id, "title": payload.title}

    @app.delete("/api/events/{item_id}")
    def delete_event(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM events WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/events/{item_id}")
    def update_event(item_id: str, payload: EventCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE events SET title = %s, date = %s, time = %s, location = %s, description = %s, type = %s WHERE id = %s RETURNING id",
                (payload.title, payload.date, payload.time, payload.location, payload.description, payload.type, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        return {"id": item_id, "status": "updated"}

    # STORIES
    @app.get("/api/stories")
    def list_stories():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, excerpt, date, image FROM stories")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "title": r[1], "excerpt": r[2], "date": r[3], "image": r[4]} for r in rows]

    @app.post("/api/stories", status_code=status.HTTP_201_CREATED)
    def create_story(payload: StoryCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        st_id = "st-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES (%s, %s, %s, %s, %s)",
                    (st_id, payload.title, payload.excerpt, payload.date, payload.image))
        conn.commit()
        cur.close()
        conn.close()
        return {"id": st_id, "title": payload.title}

    @app.delete("/api/stories/{item_id}")
    def delete_story(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM stories WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/stories/{item_id}")
    def update_story(item_id: str, payload: StoryCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE stories SET title = %s, excerpt = %s, date = %s, image = %s WHERE id = %s RETURNING id",
                (payload.title, payload.excerpt, payload.date, payload.image, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Story not found")
        return {"id": item_id, "status": "updated"}

    # SCHOOLS
    @app.get("/api/schools")
    def list_schools():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, name, region, teams, score, rank, status FROM schools ORDER BY rank ASC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "name": r[1], "region": r[2], "teams": r[3], "score": r[4], "rank": r[5], "status": r[6]} for r in rows]

    @app.post("/api/schools", status_code=status.HTTP_201_CREATED)
    def create_school(payload: SchoolCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        sch_id = "sch-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (sch_id, payload.name, payload.region, payload.teams, payload.score, payload.rank, payload.status))
        conn.commit()
        cur.close()
        conn.close()
        return {"id": sch_id, "name": payload.name}

    @app.delete("/api/schools/{item_id}")
    def delete_school(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM schools WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/schools/{item_id}")
    def update_school(item_id: str, payload: SchoolCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE schools SET name = %s, region = %s, teams = %s, score = %s, rank = %s, status = %s WHERE id = %s RETURNING id",
                (payload.name, payload.region, payload.teams, payload.score, payload.rank, payload.status, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="School not found")
        return {"id": item_id, "status": "updated"}

    # PHILOSOPHY
    @app.get("/api/philosophy")
    def list_philosophy():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, description, image FROM philosophy_cards")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "title": r[1], "description": r[2], "image": r[3]} for r in rows]

    # USERS
    @app.get("/api/users")
    def list_users():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, email, full_name, role, ticket, status, created_at, phone FROM users ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "email": r[1], "full_name": r[2], "role": r[3], "ticket": r[4], "status": r[5], "created_at": str(r[6]), "phone": r[7] or ""} for r in rows]

    @app.get("/api/users/lookup")
    def lookup_user(email: str = ""):
        """Look up whether an email is registered. Safe for public use - returns only existence and status."""
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, email, full_name, role, status FROM users WHERE lower(email) = %s", (email.strip().lower(),))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return {"found": False, "email": email}
        return {"found": True, "email": row[1], "full_name": row[2], "role": row[3], "status": row[4]}

    class UserCreate(BaseModel):
        email: str
        full_name: str = ""
        role: str = "student"
        ticket: str = ""
        password: str = ""
        status: str = "Active"
        phone: str = ""

    @app.post("/api/users", status_code=status.HTTP_201_CREATED)
    def create_user(payload: UserCreate, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        from app.security import hash_password
        user_id = "USR-" + str(uuid.uuid4())[:8]
        password_hash = hash_password(payload.password) if payload.password else hash_password("changeme123")
        ticket = payload.ticket or f"NTIC-{payload.role.upper()[:3]}-{str(uuid.uuid4())[:4].upper()}"
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (user_id, payload.email.strip().lower(), payload.full_name, payload.role, ticket, password_hash, payload.status, payload.phone)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": user_id, "email": payload.email, "role": payload.role, "ticket": ticket}

    @app.post("/api/users/register", status_code=status.HTTP_201_CREATED)
    def register_user_public(payload: UserCreate):
        if payload.role not in ["judge", "sponsor"]:
            raise HTTPException(status_code=403, detail="Role not allowed for public registration")
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        from app.security import hash_password
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE lower(email) = %s", (payload.email.strip().lower(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail="This email is already registered")
        if payload.phone:
            cur.execute("SELECT id FROM users WHERE phone = %s", (payload.phone,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(status_code=400, detail="This phone number is already registered")
        
        user_id = "USR-" + str(uuid.uuid4())[:8]
        password_hash = hash_password(payload.password) if payload.password else hash_password("changeme123")
        ticket = payload.ticket or f"NTIC-{payload.role.upper()[:3]}-{str(uuid.uuid4())[:4].upper()}"
        try:
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (user_id, payload.email.strip().lower(), payload.full_name, payload.role, ticket, password_hash, payload.status, payload.phone)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": user_id, "email": payload.email, "role": payload.role, "ticket": ticket}

    @app.patch("/api/users/{user_id}")
    def update_user(user_id: str, payload: UserCreate, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        parts = ["full_name = %s", "role = %s", "status = %s", "ticket = %s", "phone = %s"]
        vals = [payload.full_name, payload.role, payload.status, payload.ticket or None, payload.phone]
        if payload.password:
            from app.security import hash_password
            parts.append("password_hash = %s")
            vals.append(hash_password(payload.password))
        if payload.email:
            parts.append("email = %s")
            vals.append(payload.email.strip().lower())
        vals.append(user_id)
        try:
            cur.execute(f"UPDATE users SET {', '.join(parts)} WHERE id = %s RETURNING id", vals)
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {"id": user_id, "status": "updated"}

    @app.delete("/api/users/{user_id}")
    def delete_user(user_id: str, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": user_id}

    # HALL OF FAME
    class HofCreate(BaseModel):
        type: str = "individual"
        initials: str = ""
        name: str
        team_name: str = ""
        project_title: str = ""
        members: list = []
        school: str = ""
        year: str = ""
        badge: str = ""
        track_class: str = ""
        expiry_date: str = ""

    @app.get("/api/hof")
    def list_hof():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        cur.execute("SELECT id, type, initials, name, team_name, project_title, members, school, year, badge, track_class, expiry_date FROM hof_entries ORDER BY year DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "type": r[1], "initials": r[2], "name": r[3], "team_name": r[4], "project_title": r[5], "members": (_json.loads(r[6]) if isinstance(r[6], str) else (r[6] or [])), "school": r[7], "year": r[8], "badge": r[9], "track_class": r[10], "expiry_date": r[11]} for r in rows]

    @app.post("/api/hof", status_code=status.HTTP_201_CREATED)
    def create_hof(payload: HofCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        import json as _json
        hof_id = "hof-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO hof_entries (id, type, initials, name, team_name, project_title, members, school, year, badge, track_class, expiry_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (hof_id, payload.type, payload.initials, payload.name, payload.team_name, payload.project_title, _json.dumps(payload.members or []), payload.school, payload.year, payload.badge, payload.track_class, payload.expiry_date)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": hof_id, "name": payload.name}

    @app.patch("/api/hof/{item_id}")
    def update_hof(item_id: str, payload: HofCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        import json as _json
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE hof_entries SET type = %s, initials = %s, name = %s, team_name = %s, project_title = %s, members = %s, school = %s, year = %s, badge = %s, track_class = %s, expiry_date = %s WHERE id = %s RETURNING id",
                (payload.type, payload.initials, payload.name, payload.team_name, payload.project_title, _json.dumps(payload.members or []), payload.school, payload.year, payload.badge, payload.track_class, payload.expiry_date, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="HOF entry not found")
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/hof/{item_id}")
    def delete_hof(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM hof_entries WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    # NEWS ITEMS
    class NewsCreate(BaseModel):
        headline: str
        tag: str = ""
        date: str = ""
        link: str = ""

    @app.get("/api/news")
    def list_news():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, headline, tag, date, link FROM news_items ORDER BY date DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "headline": r[1], "tag": r[2], "date": r[3], "link": r[4]} for r in rows]

    @app.post("/api/news", status_code=status.HTTP_201_CREATED)
    def create_news(payload: NewsCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        news_id = "news-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES (%s, %s, %s, %s, %s)",
                        (news_id, payload.headline, payload.tag, payload.date, payload.link))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": news_id, "headline": payload.headline}

    @app.delete("/api/news/{item_id}")
    def delete_news(item_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM news_items WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted", "id": item_id}

    # AUDIT LOGS
    class AuditCreate(BaseModel):
        action: str
        usr: str = ""
        time: str = ""
        type: str = ""

    @app.get("/api/audit-logs")
    def list_audit_logs():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, action, usr, time, type FROM audit_logs ORDER BY id DESC LIMIT 200")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "action": r[1], "user": r[2], "time": r[3], "type": r[4]} for r in rows]

    @app.post("/api/audit-logs", status_code=status.HTTP_201_CREATED)
    def create_audit_log(payload: AuditCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s) RETURNING id",
                        (payload.action, payload.usr, payload.time, payload.type))
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": row[0] if row else None, "status": "created"}

    # LMS COURSES
    class LmsCourseCreate(BaseModel):
        title: str
        track: str = ""
        icon: str = ""
        level: str = ""
        description: str = ""
        modules: int = 0
        enrolled: int = 0
        completion: int = 0
        status: str = "active"
        created_at: str = ""
        submitted_by: str = ""
        approval_status: str = "approved"
        rejection_reason: str = ""

    @app.get("/api/lms-courses")
    def list_lms_courses():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status, rejection_reason FROM lms_courses ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"id": r[0], "title": r[1], "track": r[2], "icon": r[3], "level": r[4], "description": r[5], "modules": r[6], "enrolled": r[7], "completion": r[8], "status": r[9], "created_at": r[10], "submitted_by": r[11], "approval_status": r[12], "rejection_reason": r[13]} for r in rows]

    @app.post("/api/lms-courses", status_code=status.HTTP_201_CREATED)
    def create_lms_course(payload: LmsCourseCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        course_id = "crs-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status, rejection_reason) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (course_id, payload.title, payload.track, payload.icon, payload.level, payload.description, payload.modules, payload.enrolled, payload.completion, payload.status, payload.created_at, payload.submitted_by, payload.approval_status, payload.rejection_reason)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": course_id, "title": payload.title}

    # BULK SYNC endpoint for LMS and other localStorage collections
    class BulkSyncPayload(BaseModel):
        collection: str
        items: list = []

    @app.post("/api/bulk-sync")
    def bulk_sync(payload: BulkSyncPayload, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        import json as _json
        cur = conn.cursor()

        if payload.collection == "lms_courses":
            for item in payload.items:
                cur.execute("INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status, rejection_reason) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, track = EXCLUDED.track, status = EXCLUDED.status",
                            (item.get("id"), item.get("title"), item.get("track",""), item.get("icon",""), item.get("level",""), item.get("description",""), item.get("modules",0), item.get("enrolled",0), item.get("completion",0), item.get("status","active"), item.get("created_at",""), item.get("submitted_by",""), item.get("approval_status","approved"), item.get("rejection_reason","")))
        elif payload.collection == "lms_modules":
            for item in payload.items:
                cur.execute("INSERT INTO lms_modules (id, course_id, title, description, order_num, icon, status, submitted_by, approval_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status",
                            (item.get("id"), item.get("courseId"), item.get("title"), item.get("description",""), item.get("order",1), item.get("icon",""), item.get("status","published"), item.get("submitted_by",""), item.get("approval_status","approved")))
        elif payload.collection == "lms_materials":
            for item in payload.items:
                cur.execute("INSERT INTO lms_materials (id, course_id, module_id, title, type, url, description, created_at, submitted_by, approval_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title",
                            (item.get("id"), item.get("courseId"), item.get("moduleId"), item.get("title"), item.get("type",""), item.get("url",""), item.get("description",""), item.get("created_at",""), item.get("submitted_by",""), item.get("approval_status","approved")))
        elif payload.collection == "lms_assignments":
            for item in payload.items:
                cur.execute("INSERT INTO lms_assignments (id, course_id, title, description, due_date, max_score, track, status, created_at, submitted_by, approval_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status",
                            (item.get("id"), item.get("courseId"), item.get("title"), item.get("description",""), item.get("due_date",""), item.get("maxScore",100), item.get("track",""), item.get("status","active"), item.get("created_at",""), item.get("submitted_by",""), item.get("approval_status","approved")))
        elif payload.collection == "lms_submissions":
            for item in payload.items:
                cur.execute("INSERT INTO lms_submissions (id, assignment_id, course_id, student_id, student_name, student_email, submitted_at, content, url, score, status, feedback) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET score = EXCLUDED.score, status = EXCLUDED.status, feedback = EXCLUDED.feedback",
                            (item.get("id"), item.get("assignmentId"), item.get("courseId"), item.get("studentId"), item.get("studentName"), item.get("studentEmail"), item.get("submitted_at",""), item.get("content",""), item.get("url",""), item.get("score"), item.get("status","submitted"), item.get("feedback","")))
        elif payload.collection == "lms_enrollments":
            for item in payload.items:
                cur.execute("INSERT INTO lms_enrollments (id, course_id, student_id, student_name, student_email, progress_pct, enrolled_at, last_active, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET progress_pct = EXCLUDED.progress_pct, status = EXCLUDED.status",
                            (item.get("id"), item.get("courseId"), item.get("studentId"), item.get("studentName"), item.get("studentEmail"), item.get("progressPct",0), item.get("enrolled_at",""), item.get("lastActive",""), item.get("status","active")))
        elif payload.collection == "hof":
            for item in payload.items:
                cur.execute("INSERT INTO hof_entries (id, type, initials, name, team_name, project_title, members, school, year, badge, track_class, expiry_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, badge = EXCLUDED.badge, school = EXCLUDED.school",
                            (item.get("id"), item.get("type","individual"), item.get("initials",""), item.get("name"), item.get("team_name",""), item.get("project_title",""), _json.dumps(item.get("members",[])), item.get("school",""), item.get("year",""), item.get("badge",""), item.get("track_class",""), item.get("expiry_date","")))
        elif payload.collection == "news":
            for item in payload.items:
                cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET headline = EXCLUDED.headline, tag = EXCLUDED.tag",
                            (item.get("id"), item.get("headline"), item.get("tag",""), item.get("date",""), item.get("link","")))
        elif payload.collection == "audit_logs":
            for item in payload.items:
                cur.execute("INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s)",
                            (item.get("action",""), item.get("user",""), item.get("time",""), item.get("type","")))
        elif payload.collection == "users":
            for item in payload.items:
                cur.execute("INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status, phone = EXCLUDED.phone",
                            (item.get("id"), item.get("email",""), item.get("fullName",""), item.get("role","student"), item.get("ticket",""), "synced_noauth", "Active", item.get("phone","")))
        else:
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=f"Unsupported collection: {payload.collection}")

        conn.commit()
        cur.close()
        conn.close()
        return {"status": "synced", "collection": payload.collection, "count": len(payload.items)}

    # Mount static files
    frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "NticPlatform.Frontend", "dist", "stem-frontend", "browser")
    frontend_dist = os.path.abspath(frontend_dist)

    if os.path.isdir(frontend_dist):
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")

        @app.exception_handler(404)
        async def custom_404_handler(request: Request, exc: HTTPException):
            if request.url.path.startswith("/api/") or request.url.path.startswith("/docs") or request.url.path.startswith("/openapi.json"):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
            index_path = os.path.join(frontend_dist, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
    else:
        print(f"[Warning] Frontend dist directory not found at: {frontend_dist}")

except ImportError:
    app = None
