import os
import uuid
from app.config import settings
from app.database import init_postgres_db, get_db_connection

try:
    from fastapi import FastAPI, HTTPException, status, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, JSONResponse
    from httpx import AsyncClient
    from pydantic import BaseModel

    app = FastAPI(
        title="NTIC Platform Python API",
        description="Backend API powered by Python & PostgreSQL",
        version="1.0.0"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup():
        init_postgres_db()

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
            "database": db_status,
            "config": {
                "host": settings.POSTGRES_HOST,
                "port": settings.POSTGRES_PORT,
                "db": settings.POSTGRES_DB,
                "user": settings.POSTGRES_USER
            }
        }

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
        import datetime
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
            "timestamp": datetime.datetime.utcnow().isoformat()
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
