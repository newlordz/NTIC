import uuid
from app.config import settings
from app.database import init_postgres_db, get_db_connection

try:
    from fastapi import FastAPI, HTTPException, status
    from fastapi.middleware.cors import CORSMiddleware
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

    @app.get("/api/students")
    def list_students():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="PostgreSQL database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tenant_id, first_name, last_name, email, track, consent_granted, created_at FROM students ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r[0],
                "tenant_id": r[1],
                "first_name": r[2],
                "last_name": r[3],
                "email": r[4],
                "track": r[5],
                "consent_granted": r[6],
                "created_at": str(r[7])
            }
            for r in rows
        ]

    @app.post("/api/students", status_code=status.HTTP_201_CREATED)
    def create_student(payload: StudentCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="PostgreSQL database unreachable")
        student_id = str(uuid.uuid4())
        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO students (id, tenant_id, first_name, last_name, email, track, consent_granted)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (student_id, payload.tenant_id, payload.first_name, payload.last_name, payload.email, payload.track, payload.consent_granted))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {
            "id": student_id,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "email": payload.email,
            "track": payload.track
        }

    @app.get("/api/submissions")
    def list_submissions():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="PostgreSQL database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tenant_id, student_id, source_code_path, video_url, status, score, feedback, created_at FROM assignment_submissions ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "id": r[0],
                "tenant_id": r[1],
                "student_id": r[2],
                "source_code_path": r[3],
                "video_url": r[4],
                "status": r[5],
                "score": r[6],
                "feedback": r[7],
                "created_at": str(r[8])
            }
            for r in rows
        ]

    @app.post("/api/submissions", status_code=status.HTTP_201_CREATED)
    def create_submission(payload: SubmissionCreate):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="PostgreSQL database unreachable")
        sub_id = str(uuid.uuid4())
        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO assignment_submissions (id, tenant_id, student_id, source_code_path, video_url, status)
                VALUES (%s, %s, %s, %s, %s, 'Pending')
            """, (sub_id, payload.tenant_id, payload.student_id, payload.source_code_path, payload.video_url))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        conn.close()
        return {"id": sub_id, "status": "Pending"}

except ImportError:
    app = None
