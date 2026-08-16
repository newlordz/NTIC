import os
import re
import time
import uuid
import random
import secrets
import datetime
import logging
import platform
from typing import Optional
from html import escape as html_escape

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("ntic.main")
from contextlib import asynccontextmanager
from app.config import settings
from app.database import init_postgres_db, get_db_connection, release_db_connection
from app.security import (
    verify_password, create_token, require_auth, require_admin, require_role,
    check_rate_limit, reset_rate_limit, account_is_disabled, hash_password,
    validate_password_strength, MIN_PASSWORD_LENGTH,
    ADMIN_ROLES, CONTENT_ROLES, COMPETITION_ROLES, GRADING_ROLES,
    APPROVAL_ROLES, STUDENT_ADMIN_ROLES, SUPPORT_ROLES, LMS_ROLES,
)
from app.ws_manager import ws_manager, broadcast_async

try:
    import httpx
    from httpx import AsyncClient
    from fastapi import FastAPI, HTTPException, status, Request, Depends, WebSocket
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, JSONResponse, Response
    from pydantic import BaseModel, Field

    _AUDIT_LOCK_ID = 843001

    def _audit_archive_dir() -> str:
        configured = os.getenv("AUDIT_ARCHIVE_DIR", "").strip()
        if configured:
            return os.path.abspath(configured)
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "audit_archives"))

    def _audit_storage_is_durable() -> tuple:
        """Return (durable, reason).

        A container filesystem is NOT durable: it is discarded on the next deploy.
        Writing the archive there and then deleting the database rows destroys the
        records permanently, which is exactly what the retention job is meant to
        prevent.

        Durable means an object-store bucket is configured, or the operator has
        explicitly accepted the risk (e.g. the archive directory is a mounted
        volume) via AUDIT_ALLOW_EPHEMERAL_ARCHIVE=true.
        """
        bucket = os.getenv("S3_AUDIT_BUCKET", "") or os.getenv("AWS_STORAGE_BUCKET_NAME", "")
        if bucket.strip():
            return True, f"object storage bucket '{bucket.strip()}'"
        if os.getenv("AUDIT_ALLOW_EPHEMERAL_ARCHIVE", "").strip().lower() in ("1", "true", "yes"):
            return True, f"operator-approved local directory {_audit_archive_dir()}"
        return False, (
            "no S3_AUDIT_BUCKET configured. Archives would be written to the "
            "container filesystem and lost on the next deploy, so the rows will "
            "NOT be deleted. Set S3_AUDIT_BUCKET, or set "
            "AUDIT_ALLOW_EPHEMERAL_ARCHIVE=true if the archive directory is a "
            "persistent volume."
        )

    def _upload_audit_archive(archive_file: str, sha_file: str) -> tuple:
        """Upload the archive pair to S3/R2. Returns (ok, detail)."""
        bucket = (os.getenv("S3_AUDIT_BUCKET", "") or os.getenv("AWS_STORAGE_BUCKET_NAME", "")).strip()
        if not bucket:
            return True, "no bucket configured (upload skipped)"
        try:
            import boto3
        except ImportError:
            return False, (
                "boto3 is not installed, so the archive cannot be uploaded. "
                "Install it with: pip install boto3"
            )
        try:
            s3 = boto3.client(
                "s3",
                endpoint_url=os.getenv("S3_ENDPOINT_URL") or os.getenv("AWS_S3_ENDPOINT_URL") or None,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", ""),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", ""),
                region_name=os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1",
            )
            key = f"audit_archives/{os.path.basename(archive_file)}"
            s3.upload_file(archive_file, bucket, key)
            s3.upload_file(sha_file, bucket, f"{key}.sha256")
            # Confirm the object is really there before we allow any deletion.
            s3.head_object(Bucket=bucket, Key=key)
            return True, f"uploaded and verified s3://{bucket}/{key}"
        except Exception as e:
            return False, f"upload failed: {e}"

    def prune_audit_logs_internal(days: int = 90, preserve_critical: bool = True) -> dict:
        """Archive then delete audit records older than `days`.

        Returns {"deleted": int, "archived": int, "status": str, "detail": str}.

        Ordering guarantee: rows are deleted ONLY after the archive has been
        written AND confirmed to be in durable storage. Previously an archival
        failure merely logged a warning and the DELETE ran regardless, so a
        failed upload silently destroyed the records.
        """
        result = {"deleted": 0, "archived": 0, "status": "noop", "detail": ""}

        durable, durability_reason = _audit_storage_is_durable()
        if not durable:
            logger.error(f"[Audit Archival] Retention skipped: {durability_reason}")
            result["status"] = "skipped_not_durable"
            result["detail"] = durability_reason
            return result

        cutoff_dt = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=days)
        cutoff_iso = cutoff_dt.isoformat()
        conn = get_db_connection()
        if not conn:
            result["status"] = "skipped_no_db"
            result["detail"] = "Database unreachable"
            return result
        cur = conn.cursor()
        has_lock = False
        try:
            # Leader election so two replicas cannot prune concurrently. If the
            # lock cannot be evaluated we abort rather than proceed blindly.
            try:
                cur.execute("SELECT pg_try_advisory_lock(%s)", (_AUDIT_LOCK_ID,))
                lock_row = cur.fetchone()
                if not lock_row or lock_row[0] is False:
                    logger.info("[Maintenance] Another replica holds the audit maintenance lock, skipping.")
                    result["status"] = "skipped_locked"
                    return result
                has_lock = True
            except Exception as lock_err:
                logger.warning(f"[Maintenance] Could not acquire the audit lock, skipping: {lock_err}")
                result["status"] = "skipped_lock_error"
                result["detail"] = str(lock_err)[:200]
                return result

            where = "time < %s"
            if preserve_critical:
                where += " AND type NOT IN ('revoked', 'security', 'critical')"

            cur.execute(
                "SELECT id, action, usr, time, type, COALESCE(ip, ''), COALESCE(client, '') "
                f"FROM audit_logs WHERE {where}",
                (cutoff_iso,),
            )
            rows = cur.fetchall()
            if not rows:
                result["status"] = "nothing_to_prune"
                return result

            # ── Archive first ────────────────────────────────────────────
            import gzip, json, hashlib

            archive_dir = _audit_archive_dir()
            os.makedirs(archive_dir, exist_ok=True)
            stamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d_%H%M%S")
            archive_file = os.path.join(archive_dir, f"audit_archive_{stamp}.json.gz")
            payload = [
                {"id": r[0], "action": r[1], "user": r[2], "time": r[3],
                 "type": r[4], "ip": r[5], "client": r[6]}
                for r in rows
            ]
            with gzip.open(archive_file, "wt", encoding="utf-8") as gz:
                json.dump(payload, gz, indent=2)

            # Read it back and confirm the contents survived the round trip.
            with gzip.open(archive_file, "rt", encoding="utf-8") as gz:
                verify = json.load(gz)
            if len(verify) != len(payload):
                raise RuntimeError(
                    f"archive verification failed: wrote {len(payload)} records, read back {len(verify)}"
                )

            hasher = hashlib.sha256()
            with open(archive_file, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            digest = hasher.hexdigest()
            sha_file = archive_file + ".sha256"
            with open(sha_file, "w", encoding="utf-8") as f:
                f.write(f"{digest}  {os.path.basename(archive_file)}\n")

            uploaded, upload_detail = _upload_audit_archive(archive_file, sha_file)
            if not uploaded:
                # Keep the rows. The archive alone is not safe to rely on.
                logger.error(
                    f"[Audit Archival] {len(rows)} record(s) NOT deleted because the "
                    f"archive is not durably stored: {upload_detail}"
                )
                result["status"] = "archive_not_durable"
                result["archived"] = len(rows)
                result["detail"] = upload_detail
                conn.rollback()
                return result

            logger.info(
                f"[Audit Archival] Archived {len(rows)} record(s) to {archive_file} "
                f"(sha256 {digest[:16]}...); {upload_detail}"
            )
            result["archived"] = len(rows)

            # ── Only now is deletion safe ───────────────────────────────
            cur.execute(f"DELETE FROM audit_logs WHERE {where}", (cutoff_iso,))
            result["deleted"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
            conn.commit()
            result["status"] = "pruned"
            result["detail"] = f"archived to {durability_reason}"
        except Exception as e:
            conn.rollback()
            logger.error(f"[Audit Archival] Retention aborted, no rows deleted: {e}")
            result["status"] = "error"
            result["detail"] = str(e)[:300]
            result["deleted"] = 0
        finally:
            if has_lock:
                try:
                    cur.execute("SELECT pg_advisory_unlock(%s)", (_AUDIT_LOCK_ID,))
                except Exception as unlock_err:
                    logger.warning(f"[Maintenance] Could not release the audit lock: {unlock_err}")
            cur.close()
            release_db_connection(conn)
        return result

    def prune_expired_sessions_internal() -> int:
        conn = get_db_connection()
        if not conn:
            return 0
        has_lock = False
        deleted = 0
        try:
            cur = conn.cursor()
            try:
                cur.execute("SELECT pg_try_advisory_lock(843002)")
                lock_row = cur.fetchone()
                if lock_row and lock_row[0] is False:
                    cur.close()
                    release_db_connection(conn)
                    return 0
                has_lock = True
            except Exception:
                pass

            cur.execute("DELETE FROM auth_sessions WHERE expires_at < CURRENT_TIMESTAMP")
            deleted = cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0
            conn.commit()
            cur.close()
        except Exception as e:
            conn.rollback()
            logger.warning(f"Session prune query error: {e}")
            deleted = 0
        finally:
            if has_lock:
                try:
                    cur = conn.cursor()
                    cur.execute("SELECT pg_advisory_unlock(843002)")
                    cur.close()
                except Exception:
                    pass
            release_db_connection(conn)
        return deleted

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        import time, asyncio
        # Hand the running loop to the WebSocket manager so that broadcasts from
        # sync endpoints (which execute in a worker thread) can be scheduled.
        ws_manager.set_event_loop(asyncio.get_running_loop())
        for attempt in range(1, 13):
            ok, msg = init_postgres_db()
            if ok:
                break
            wait = min(attempt * 2, 20)
            print(f"[Startup] DB init attempt {attempt}/12 failed ({msg}) — retrying in {wait}s...")
            await asyncio.sleep(wait)

        async def daily_audit_maintenance():
            while True:
                try:
                    await asyncio.sleep(86400)  # Every 24 hours
                    outcome = prune_audit_logs_internal(days=180, preserve_critical=True)
                    if outcome["deleted"] > 0:
                        logger.info(
                            f"[Maintenance] Automated retention archived and pruned "
                            f"{outcome['deleted']} audit record(s) older than 180 days."
                        )
                        broadcast_async({"type": "data_changed", "collection": "audit_logs"})
                    elif outcome["status"] not in ("nothing_to_prune", "skipped_locked", "noop"):
                        logger.warning(
                            f"[Maintenance] Retention did not prune anything "
                            f"({outcome['status']}): {outcome['detail']}"
                        )
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning(f"[Maintenance] Automated audit maintenance error: {e}")
                    await asyncio.sleep(3600)


        async def periodic_session_maintenance():
            while True:
                try:
                    await asyncio.sleep(43200)  # Every 12 hours
                    pruned = prune_expired_sessions_internal()
                    if pruned > 0:
                        logger.info(f"[Maintenance] Automated maintenance pruned {pruned} expired auth sessions.")
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning(f"[Maintenance] Automated session maintenance error: {e}")
                    await asyncio.sleep(3600)

        maint_task = asyncio.create_task(daily_audit_maintenance())
        session_task = asyncio.create_task(periodic_session_maintenance())
        # Receive change notifications published by other replicas, so a write on
        # one instance reaches clients connected to another.
        ws_manager.start_listener()
        yield
        ws_manager.stop_listener()
        maint_task.cancel()
        session_task.cancel()

    # Interactive API docs. Exposed by default in development, hidden by default
    # in production: /docs and /openapi.json publish the complete schema of every
    # endpoint, which is a free map of the attack surface.
    #
    # NTIC_ENABLE_DOCS=true  -> always on
    # NTIC_ENABLE_DOCS=false -> always off
    # unset                  -> on only when NTIC_DEV_RELOAD is set (i.e. local dev)
    _docs_setting = os.getenv("NTIC_ENABLE_DOCS", "").strip().lower()
    if _docs_setting in ("1", "true", "yes"):
        _docs_enabled = True
    elif _docs_setting in ("0", "false", "no"):
        _docs_enabled = False
    else:
        _docs_enabled = os.getenv("NTIC_DEV_RELOAD", "").strip().lower() in ("1", "true", "yes")

    if _docs_enabled:
        logger.info("Interactive API docs enabled at /docs and /redoc")
    else:
        logger.info("Interactive API docs disabled (set NTIC_ENABLE_DOCS=true to enable)")

    app = FastAPI(
        title="NTIC Platform Python API",
        description="Backend API powered by Python & PostgreSQL",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if _docs_enabled else None,
        redoc_url="/redoc" if _docs_enabled else None,
        openapi_url="/openapi.json" if _docs_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        origin = request.headers.get("Origin", "*")
        if request.method == "OPTIONS":
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Max-Age"] = "86400"
            return response

        response = await call_next(request)
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"

        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    # ─── HEALTH & MONITORING ─────────────────────────────────────────
    # Everything reported here must be measured. The previous version returned
    # hardcoded load figures, fixed SVG sparkline paths and a literal
    # successRate of 99.98 / errorRate of 0.00, with the database queries wrapped
    # in `except Exception: pass`. That meant the dashboard would keep reporting
    # "Healthy" during a total outage, which is worse than having no monitoring.

    _PROCESS_STARTED_AT = time.time()

    def _measure_db() -> dict:
        """Actually round-trip a query and time it."""
        t0 = time.perf_counter()
        conn = get_db_connection()
        if not conn:
            return {
                "reachable": False,
                "latency_ms": None,
                "error": "Could not obtain a database connection",
            }
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
            cur.close()
            return {
                "reachable": True,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                "error": None,
            }
        except Exception as e:
            return {
                "reachable": False,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                "error": str(e)[:200],
            }
        finally:
            release_db_connection(conn)

    def _table_counts(tables: tuple) -> tuple:
        """Return ({table: count}, error_or_None).

        A failure is reported, not swallowed, so a broken query cannot look like
        a healthy system with zero rows.
        """
        conn = get_db_connection()
        if not conn:
            return {}, "Database unreachable"
        counts = {}
        try:
            cur = conn.cursor()
            for table in tables:
                # Table names are hardcoded constants, never request data.
                cur.execute(f"SELECT count(*) FROM {table}")
                counts[table] = cur.fetchone()[0] or 0
            cur.close()
            return counts, None
        except Exception as e:
            logger.warning(f"Telemetry count query failed: {e}")
            return counts, str(e)[:200]
        finally:
            release_db_connection(conn)

    @app.get("/api/health")
    def health_check():
        """Liveness + readiness. Returns 503 when the database is unusable so
        that load balancers and container health checks can actually react."""
        db = _measure_db()
        body = {
            "status": "ok" if db["reachable"] else "degraded",
            "database": "connected" if db["reachable"] else "disconnected",
            "database_latency_ms": db["latency_ms"],
            "uptime_seconds": int(time.time() - _PROCESS_STARTED_AT),
        }
        if not db["reachable"]:
            # Deliberately a non-2xx: a health endpoint that returns 200 while
            # the database is down is indistinguishable from a healthy service.
            return JSONResponse(status_code=503, content=body)
        return body

    @app.get("/api/system/nodes-health")
    def system_nodes_health(_actor: dict = Depends(require_role(ADMIN_ROLES))):
        """Per-component status.

        Admin-only: it exposes exact row counts, which previously let anyone on
        the internet monitor the size of the user base.

        Only components this process can actually observe are reported. The old
        version invented an "LMS Storage Bucket" and a "Compiler & Sandbox VM"
        with fabricated load numbers; neither exists in this deployment.
        """
        db = _measure_db()
        counts, count_error = _table_counts(("users", "auth_sessions", "audit_logs"))

        if db["reachable"] and not count_error:
            db_state = "Healthy"
        elif db["reachable"]:
            db_state = "Degraded"
        else:
            db_state = "Down"

        nodes = [
            {
                "id": "node-api",
                "name": "API Service",
                "status": "Healthy",
                "latencyMs": None,
                "detail": f"Up {int(time.time() - _PROCESS_STARTED_AT)}s",
                "measured": True,
            },
            {
                "id": "node-database",
                "name": "PostgreSQL",
                "status": db_state,
                "latencyMs": db["latency_ms"],
                "detail": db["error"] or count_error or "Query round-trip succeeded",
                "measured": True,
            },
            {
                "id": "node-realtime",
                "name": "Realtime WebSocket",
                "status": "Healthy",
                "latencyMs": None,
                "detail": f"{ws_manager.connection_count()} client(s) connected",
                "measured": True,
            },
            {
                "id": "node-email",
                "name": "Email (Brevo)",
                "status": "Configured" if settings.BREVO_API_KEY else "Not configured",
                "latencyMs": None,
                "detail": (
                    f"Sender {settings.MAIL_FROM_EMAIL}"
                    if settings.BREVO_API_KEY
                    else "BREVO_API_KEY is not set - outbound email is disabled"
                ),
                # We do not call Brevo here; this reflects configuration only.
                "measured": False,
            },
            {
                "id": "node-ai",
                "name": "AI Assistant (Gemini)",
                "status": "Configured" if settings.GEMINI_API_KEY else "Not configured",
                "latencyMs": None,
                "detail": (
                    "GEMINI_API_KEY is set"
                    if settings.GEMINI_API_KEY
                    else "GEMINI_API_KEY is not set - the chatbot is disabled"
                ),
                "measured": False,
            },
            {
                "id": "node-sms",
                "name": "SMS / WhatsApp Gateway",
                "status": "Configured" if os.getenv("SMS_GATEWAY_URL", "").strip() else "Not configured",
                "latencyMs": None,
                "detail": (
                    "SMS_GATEWAY_URL is set"
                    if os.getenv("SMS_GATEWAY_URL", "").strip()
                    else "SMS_GATEWAY_URL is not set - phone verification is unavailable"
                ),
                "measured": False,
            },
        ]

        overall = "ok" if db_state == "Healthy" else "degraded"
        return {
            "status": overall,
            "nodes": nodes,
            "counts": counts,
            "countsError": count_error,
        }

    @app.get("/api/system/telemetry")
    def system_telemetry(_actor: dict = Depends(require_role(ADMIN_ROLES))):
        """Real numbers only.

        Admin-only. Every field is either measured or explicitly reported as
        unavailable. There are intentionally no CPU / memory / bandwidth gauges:
        this process cannot see the host's resource usage, and the previous
        implementation derived them from `user_count % 30`, which looked
        plausible and meant nothing.
        """
        db = _measure_db()
        counts, count_error = _table_counts((
            "users", "students", "assignment_submissions", "audit_logs",
            "auth_sessions", "support_tickets", "competitions", "teams",
        ))

        active_sessions = None
        pool_in_use = None
        conn = get_db_connection()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT count(*) FROM auth_sessions WHERE expires_at > CURRENT_TIMESTAMP"
                )
                active_sessions = cur.fetchone()[0] or 0
                cur.close()
            except Exception as e:
                logger.warning(f"Active-session count failed: {e}")
            finally:
                release_db_connection(conn)

        return {
            "status": "ok" if db["reachable"] and not count_error else "degraded",
            "measuredAt": datetime.datetime.now(datetime.UTC).isoformat(),
            "api": {
                "uptimeSeconds": int(time.time() - _PROCESS_STARTED_AT),
                "pythonVersion": platform.python_version(),
            },
            "database": {
                "reachable": db["reachable"],
                "latencyMs": db["latency_ms"],
                "error": db["error"],
            },
            "realtime": {
                "connectedClients": ws_manager.connection_count(),
            },
            "sessions": {
                "active": active_sessions,
            },
            "rowCounts": counts,
            "rowCountsError": count_error,
            "integrations": {
                "email": bool(settings.BREVO_API_KEY),
                "ai": bool(settings.GEMINI_API_KEY),
                "sms": bool(os.getenv("SMS_GATEWAY_URL", "").strip()),
                "auditColdStorage": bool(
                    os.getenv("S3_AUDIT_BUCKET") or os.getenv("AWS_STORAGE_BUCKET_NAME")
                ),
            },
            # Kept explicit so the UI does not silently render a fake number.
            "unavailable": [
                "cpuUtilization",
                "memoryUtilization",
                "diskUtilization",
                "requestThroughput",
                "errorRate",
            ],
            "unavailableReason": (
                "Not measured. Host CPU/memory/disk and request-rate metrics need "
                "a metrics exporter (e.g. Prometheus) or the platform's own "
                "monitoring; this process cannot observe them."
            ),
        }

    @app.middleware("http")
    async def enforce_auth_middleware(request: Request, call_next):
        # Endpoints that must work before a user has a session. Everything NOT
        # listed here requires a valid session token for write methods. Keep this
        # list as small as possible and prefer a purpose-built, rate-limited,
        # server-templated endpoint over widening it.
        PUBLIC_UNSAFE = {
            "/api/login",
            "/api/users/register",
            # Anonymous registration writes a student record for the team lead.
            # Rate limited in the handler. TODO: route through the approvals
            # queue so this can require a session.
            "/api/students",
            # Support chat is an anonymous landing-page widget.
            "/api/tickets",
            "/api/chat",
            "/api/auth/verify-contact",
            "/api/otp/request",
            "/api/otp/verify",
            "/api/drafts",
            # Server-templated notification for the pre-login registration flow.
            # The generic /api/send-email now requires a session.
            "/api/notify/registration-received",
            "/api/system/nodes-health",
            "/api/system/telemetry"
        }
        # CORS preflight must never be authenticated. Browsers deliberately omit
        # the Authorization header from an OPTIONS preflight, so demanding one
        # made this middleware answer 401 with no CORS headers - which the
        # browser reports as an opaque CORS failure, not a 401.
        #
        # This broke cross-origin logins specifically: /api/auth/verify is
        # special-cased below, so its preflight always failed. Same-origin setups
        # (the backend serving the built frontend on one port) send no preflight
        # and were therefore unaffected, which is why it only showed up on the
        # dev server.
        if request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        has_bearer = auth_header.startswith("Bearer ")
        path = request.url.path
        is_drafts_route = path == "/api/drafts" or path.startswith("/api/drafts/")
        is_write_protected = request.method in ("POST", "PUT", "PATCH", "DELETE") and path not in PUBLIC_UNSAFE and not is_drafts_route
        is_verify_check = path == "/api/auth/verify"

        if has_bearer or is_write_protected or is_verify_check:
            if not has_bearer:
                return JSONResponse(status_code=401, content={"detail": "Authentication required"})
            token = auth_header[7:]
            conn = get_db_connection()
            if not conn:
                return JSONResponse(status_code=503, content={"detail": "Database unreachable"})
            cur = conn.cursor()
            try:
                # Join users so that a suspended account cannot keep using a
                # token that was issued before it was disabled.
                cur.execute(
                    "SELECT u.status FROM auth_sessions s JOIN users u ON s.user_id = u.id "
                    "WHERE s.token = %s AND s.expires_at > CURRENT_TIMESTAMP",
                    (token,),
                )
                session_row = cur.fetchone()
            finally:
                cur.close()
                release_db_connection(conn)
            if session_row is None:
                return JSONResponse(status_code=401, content={"detail": "Invalid or revoked session token"})
            if account_is_disabled(session_row[0]):
                return JSONResponse(status_code=403, content={"detail": "This account has been disabled"})
        return await call_next(request)

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
        tag: str = ""
        tag_color: str = ""
        read_time: str = "5 min"
        likes: int = 0

    class SchoolCreate(BaseModel):
        name: str
        region: str
        teams: int = 1
        score: int = 100
        rank: int = 1
        status: str = "Active"
        coding_score: int = 0
        robotics_score: int = 0
        ai_score: int = 0
        cyber_score: int = 0

    @app.get("/api/health")
    def health_check():
        conn = get_db_connection()
        db_status = "connected" if conn else "disconnected"
        if conn:
            release_db_connection(conn)
        return {
            "status": "ok",
            "database": db_status
        }

    # EMAIL PROXY - sends via Brevo from the backend (avoids CORS + exposed API key)
    #
    # HARDENING: the sender identity is chosen by the SERVER, never by the
    # caller. Allowing a client-supplied From address turned this endpoint into
    # a spoofable open relay on our paid Brevo account. Field lengths are
    # capped and the endpoint is rate limited per client IP.
    _EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$")

    def _send_brevo_email(to_email: str, to_name: str, subject: str, html_content: str) -> bool:
        """Send one transactional email. Returns True on success.

        Single choke point for outbound mail so the sender identity and the API
        key live in exactly one place.
        """
        if not settings.BREVO_API_KEY:
            logger.warning("Email not sent: BREVO_API_KEY is not configured")
            return False
        try:
            resp = httpx.post(
                "https://api.brevo.com/v3/smtp/email",
                json={
                    # Server-controlled sender. Client input is never used here.
                    "sender": {"email": settings.MAIL_FROM_EMAIL, "name": settings.MAIL_FROM_NAME},
                    "to": [{"email": to_email, "name": to_name or to_email}],
                    "subject": subject,
                    "htmlContent": html_content,
                },
                headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json"},
                timeout=15,
            )
            if resp.status_code >= 400:
                logger.warning(f"Brevo API error {resp.status_code}: {resp.text[:500]}")
                return False
            return True
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False

    class EmailPayload(BaseModel):
        # Accepted for backwards compatibility with existing callers but
        # deliberately IGNORED - the sender is server-controlled.
        sender_email: str = ""
        sender_name: str = ""
        to_email: str = Field(min_length=5, max_length=254)
        to_name: str = Field(default="", max_length=120)
        subject: str = Field(min_length=1, max_length=200)
        html_content: str = Field(min_length=1, max_length=100_000)

    @app.post("/api/send-email")
    def send_email_proxy(payload: EmailPayload, request: Request, _actor: dict = Depends(require_auth)):
        """Generic sender. Requires a session.

        Arbitrary HTML to an arbitrary recipient is a mail-relay primitive, so it
        must never be anonymous. Pre-login flows use the server-templated
        /api/notify/registration-received endpoint instead.
        """
        if not settings.BREVO_API_KEY:
            raise HTTPException(status_code=503, detail="Email service not configured")

        # Rate limit per authenticated user, not per IP: an admin behind a shared
        # NAT should not be throttled by a colleague.
        check_rate_limit(f"email-user:{_actor['id']}", max_attempts=20, window_seconds=60)
        check_rate_limit(f"email-user-hourly:{_actor['id']}", max_attempts=300, window_seconds=3600)

        to_email = payload.to_email.strip()
        if not _EMAIL_RE.match(to_email):
            raise HTTPException(status_code=422, detail="Invalid recipient address")

        if not _send_brevo_email(to_email, payload.to_name.strip(), payload.subject, payload.html_content):
            raise HTTPException(status_code=502, detail="Failed to send email")
        return {"status": "sent"}

    class RegistrationNoticePayload(BaseModel):
        to_email: str = Field(min_length=5, max_length=254)
        to_name: str = Field(default="", max_length=120)
        entity_name: str = Field(default="", max_length=160)
        application_type: str = Field(default="Application", max_length=80)

    @app.post("/api/notify/registration-received")
    def notify_registration_received(payload: RegistrationNoticePayload, request: Request):
        """Public 'we received your application' email.

        Deliberately narrow: the caller supplies only a recipient and a few short
        labels. The subject and body are rendered here, so this cannot be used to
        send arbitrary content. All values are HTML-escaped.
        """
        if not settings.BREVO_API_KEY:
            raise HTTPException(status_code=503, detail="Email service not configured")

        client_ip = extract_client_ip(request)
        check_rate_limit(f"notify:{client_ip}", max_attempts=5, window_seconds=300)
        check_rate_limit(f"notify-hourly:{client_ip}", max_attempts=20, window_seconds=3600)

        to_email = payload.to_email.strip()
        if not _EMAIL_RE.match(to_email):
            raise HTTPException(status_code=422, detail="Invalid recipient address")

        to_name = html_escape(payload.to_name.strip() or to_email.split("@")[0])
        entity = html_escape(payload.entity_name.strip() or "your application")
        app_type = html_escape(payload.application_type.strip() or "Application")

        html = (
            '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">'
            '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;border-radius:12px 12px 0 0;text-align:center;">'
            '<h1 style="color:#fff;margin:0;font-size:22px;">NTIC Ghana Championship</h1>'
            '<p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">National Technology &amp; Innovation Championship</p>'
            "</div>"
            '<div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">'
            f'<p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>{to_name}</strong>,</p>'
            f'<p style="color:#475569;line-height:1.6;margin:0 0 16px;">We have received your <strong>{app_type}</strong> for <strong>{entity}</strong>. Your application is now under review.</p>'
            '<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:14px 16px;margin:0 0 16px;">'
            '<p style="margin:0;color:#92400e;font-size:14px;"><strong>Status:</strong> Pending Review<br>You will receive another email once a decision has been made.</p>'
            "</div>"
            '<p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact support@ntic.edu.gh</p>'
            "</div></div>"
        )

        if not _send_brevo_email(to_email, to_name, f"{app_type} Received - NTIC Ghana Championship", html):
            raise HTTPException(status_code=502, detail="Failed to send email")
        return {"status": "sent"}

    # ─── SERVER-SIDE ONE-TIME PASSCODES ──────────────────────────────
    # The code is generated here with a CSPRNG, stored only as a hash, and
    # compared here. The browser receives an opaque challenge id and never
    # learns the code, so a user cannot "verify" a contact they do not own by
    # reading their own network tab or localStorage.
    _OTP_TTL_SECONDS = 600
    _OTP_MAX_ATTEMPTS = 5
    _OTP_PURPOSES = {"contact_verification", "draft_resume"}
    _OTP_CHANNELS = {"email", "phone"}

    def _generate_otp() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    # ─── CREDENTIAL GENERATION (server-side, CSPRNG) ─────────────────
    # Never generate a password or access code in the browser. Math.random() is
    # predictable, and a 6-digit password has only 10^6 possibilities.
    # Ambiguous characters (0/O, 1/I/l) are excluded so codes can be read aloud.
    _CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    _PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

    def _generate_temp_password(length: int = 14) -> str:
        """A one-time password for a newly provisioned account."""
        return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))

    def _generate_access_code(length: int = 6) -> str:
        """The human-readable suffix of an access pass / ticket."""
        return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))

    def _normalize_otp_target(channel: str, target: str) -> str:
        target = (target or "").strip()
        if channel == "email":
            return target.lower()
        return re.sub(r"[^0-9+]", "", target)

    def _mask_otp_target(channel: str, target: str) -> str:
        if channel == "email":
            name, _, domain = target.partition("@")
            if not domain:
                return "***"
            head = name[:2] if len(name) > 2 else name[:1]
            return f"{head}{'*' * max(3, len(name) - len(head))}@{domain}"
        digits = re.sub(r"\D", "", target)
        return f"{'*' * max(0, len(digits) - 3)}{digits[-3:]}" if digits else "***"

    def _send_sms_otp(phone: str, code: str) -> bool:
        """Deliver an OTP over the WhatsApp/SMS gateway, server-side.

        Requires SMS_GATEWAY_URL. Previously the browser called the gateway on
        localhost directly, which could never work in production and exposed the
        code to the caller.
        """
        gateway = os.getenv("SMS_GATEWAY_URL", "").strip().rstrip("/")
        if not gateway:
            return False
        try:
            resp = httpx.post(
                f"{gateway}/send-otp", json={"phone": phone, "otp": code}, timeout=15
            )
            if resp.status_code >= 400:
                logger.warning(f"SMS gateway error {resp.status_code}: {resp.text[:300]}")
                return False
            return True
        except Exception as e:
            logger.error(f"SMS gateway unreachable: {e}")
            return False

    def _otp_email_html(code: str) -> str:
        return (
            '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">'
            '<h2 style="color:#1a237e;">NTIC Ghana - Verification Code</h2>'
            '<p style="font-size:15px;color:#333;">Use the code below to verify your contact details:</p>'
            '<div style="background:#f5f5f5;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">'
            f'<span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#d4a017;">{code}</span>'
            "</div>"
            '<p style="font-size:13px;color:#999;">This code expires in 10 minutes. Do not share it with anyone.</p>'
            '<p style="font-size:12px;color:#bbb;margin-top:24px;">NTIC Ghana National Championship</p>'
            "</div>"
        )

    class OtpRequestPayload(BaseModel):
        purpose: str = Field(max_length=40)
        channel: str = Field(max_length=16)
        target: str = Field(min_length=3, max_length=254)

    class OtpVerifyPayload(BaseModel):
        challenge_id: str = Field(min_length=8, max_length=64)
        code: str = Field(min_length=4, max_length=10)

    @app.post("/api/otp/request")
    def otp_request(payload: OtpRequestPayload, request: Request):
        channel = payload.channel.strip().lower()
        purpose = payload.purpose.strip().lower()
        if purpose not in _OTP_PURPOSES:
            raise HTTPException(status_code=422, detail="Unsupported verification purpose")
        if channel not in _OTP_CHANNELS:
            raise HTTPException(status_code=422, detail="Unsupported verification channel")

        target = _normalize_otp_target(channel, payload.target)
        if channel == "email" and not _EMAIL_RE.match(target):
            raise HTTPException(status_code=422, detail="Invalid email address")
        if channel == "phone" and len(re.sub(r"\D", "", target)) < 9:
            raise HTTPException(status_code=422, detail="Invalid phone number")

        client_ip = extract_client_ip(request)
        # Throttle by IP (stops mass enumeration) and by target (stops using us
        # to spam one victim's inbox).
        check_rate_limit(f"otp-ip:{client_ip}", max_attempts=6, window_seconds=300)
        check_rate_limit(f"otp-target:{channel}:{target}", max_attempts=4, window_seconds=900)

        code = _generate_otp()
        challenge_id = "otp-" + secrets.token_urlsafe(18)
        expires_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(seconds=_OTP_TTL_SECONDS)

        if channel == "email":
            delivered = _send_brevo_email(
                target, target.split("@")[0], "Your Verification Code - NTIC Ghana", _otp_email_html(code)
            )
        else:
            delivered = _send_sms_otp(target, code)

        if not delivered:
            detail = (
                "Could not send the verification email. Please try again shortly."
                if channel == "email"
                else "Phone verification is currently unavailable. Please verify by email instead."
            )
            raise HTTPException(status_code=503, detail=detail)

        conn = _get_db()
        try:
            cur = conn.cursor()
            # Retire any earlier live challenge for the same target+purpose so a
            # user cannot keep several valid codes in flight.
            cur.execute(
                "UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP "
                "WHERE target = %s AND purpose = %s AND consumed_at IS NULL",
                (target, purpose),
            )
            cur.execute(
                "INSERT INTO otp_challenges (id, purpose, channel, target, code_hash, max_attempts, expires_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (challenge_id, purpose, channel, target, hash_password(code), _OTP_MAX_ATTEMPTS, expires_at),
            )
            # Opportunistic cleanup; this table is pure scratch space.
            cur.execute(
                "DELETE FROM otp_challenges WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'"
            )
            conn.commit()
            cur.close()
        except Exception as e:
            conn.rollback()
            logger.error(f"Could not persist OTP challenge: {e}")
            raise HTTPException(status_code=500, detail="Could not start verification")
        finally:
            release_db_connection(conn)

        return {
            "challenge_id": challenge_id,
            "channel": channel,
            "target_masked": _mask_otp_target(channel, target),
            "expires_in": _OTP_TTL_SECONDS,
            "max_attempts": _OTP_MAX_ATTEMPTS,
        }

    @app.post("/api/otp/verify")
    def otp_verify(payload: OtpVerifyPayload, request: Request):
        client_ip = extract_client_ip(request)
        check_rate_limit(f"otp-verify:{client_ip}", max_attempts=20, window_seconds=300)

        code = payload.code.strip()
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT purpose, channel, target, code_hash, attempts, max_attempts, consumed_at, "
                "(expires_at < CURRENT_TIMESTAMP) AS is_expired "
                "FROM otp_challenges WHERE id = %s",
                (payload.challenge_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No verification in progress. Please request a new code.")

            purpose, channel, target, code_hash, attempts, max_attempts, consumed_at, is_expired = row
            if consumed_at is not None:
                raise HTTPException(status_code=410, detail="This code has already been used. Please request a new one.")
            if is_expired:
                raise HTTPException(status_code=410, detail="This code has expired. Please request a new one.")
            if attempts >= max_attempts:
                raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new code.")

            if not verify_password(code, code_hash):
                # Count the failure durably so attempts cannot be reset by
                # simply reconnecting from another IP.
                cur.execute(
                    "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = %s RETURNING attempts",
                    (payload.challenge_id,),
                )
                used = cur.fetchone()[0]
                conn.commit()
                remaining = max(0, max_attempts - used)
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Incorrect code. {remaining} attempt(s) remaining."
                        if remaining
                        else "Incorrect code. Please request a new one."
                    ),
                )

            cur.execute(
                "UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = %s",
                (payload.challenge_id,),
            )
            conn.commit()
            cur.close()
        except HTTPException:
            raise
        except Exception as e:
            conn.rollback()
            logger.error(f"OTP verification failed: {e}")
            raise HTTPException(status_code=500, detail="Verification failed")
        finally:
            release_db_connection(conn)

        result = {"verified": True, "purpose": purpose, "channel": channel, "target": target}
        if purpose == "draft_resume":
            # Doubles as the read credential for GET /api/drafts/{email} for a
            # short window, so the draft's PII is only released to someone who
            # actually received the code.
            result["resume_token"] = payload.challenge_id
        return result


    # AUTH
    class LoginRequest(BaseModel):
        email: str
        password: str

    def _get_db():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        return conn

    def extract_client_ip(request: Request) -> str:
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                return parts[0]
        return request.client.host if request.client else "127.0.0.1"

    def anonymize_ip(ip: str) -> str:
        """Mask last octet for GDPR/PII compliance if ENABLE_IP_ANONYMIZATION is true"""
        if not ip:
            return ""
        if os.getenv("ENABLE_IP_ANONYMIZATION", "false").lower() == "true":
            parts = ip.split(".")
            if len(parts) == 4:
                return f"{parts[0]}.{parts[1]}.{parts[2]}.xxx"
            if ":" in ip:
                return ip.rsplit(":", 1)[0] + ":xxxx"
        return ip

    def send_security_alert_email(event_type: str, actor: str, action: str, ip: str, client: str):
        """Asynchronously dispatches an emergency security alert to SuperAdmin via Brevo for critical actions"""
        if not settings.BREVO_API_KEY:
            return
        alert_to = settings.SECURITY_ALERT_EMAIL or settings.MAIL_FROM_EMAIL
        if not alert_to:
            return
        try:
            # These values originate from a client-supplied audit payload, so
            # they must be HTML-escaped before interpolation - otherwise an
            # attacker can inject markup into an alert the SuperAdmin trusts.
            event_type_s = html_escape(str(event_type))
            action_s = html_escape(str(action))
            actor_s = html_escape(str(actor))
            ip_s = html_escape(str(ip))
            client_s = html_escape(str(client))
            html = f"""
            <div style="font-family: Arial, sans-serif; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
                <h2 style="color: #ef4444; margin-top: 0;">NTIC Security Alert: Critical Event Logged</h2>
                <p>A high-severity action was detected in the NTIC Championship Platform:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                    <tr><td style="padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155;"><strong>Event Type:</strong></td><td style="padding: 8px; color: #f8fafc; border-bottom: 1px solid #334155;">{event_type_s.upper()}</td></tr>
                    <tr><td style="padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155;"><strong>Action:</strong></td><td style="padding: 8px; color: #f8fafc; border-bottom: 1px solid #334155;">{action_s}</td></tr>
                    <tr><td style="padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155;"><strong>Actor:</strong></td><td style="padding: 8px; color: #f8fafc; border-bottom: 1px solid #334155;">{actor_s}</td></tr>
                    <tr><td style="padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155;"><strong>IP Address:</strong></td><td style="padding: 8px; color: #f8fafc; border-bottom: 1px solid #334155;">{ip_s}</td></tr>
                    <tr><td style="padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155;"><strong>Client Device:</strong></td><td style="padding: 8px; color: #f8fafc; border-bottom: 1px solid #334155;">{client_s}</td></tr>
                    <tr><td style="padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155;"><strong>Timestamp (UTC):</strong></td><td style="padding: 8px; color: #f8fafc; border-bottom: 1px solid #334155;">{datetime.datetime.now(datetime.UTC).isoformat()}</td></tr>
                </table>
                <p style="font-size: 12px; color: #64748b;">This automated alert was generated by the NTIC Live Security Stream.</p>
            </div>
            """
            httpx.post(
                "https://api.brevo.com/v3/smtp/email",
                json={
                    "sender": {"email": settings.MAIL_FROM_EMAIL, "name": "NTIC Security Stream"},
                    "to": [{"email": alert_to, "name": "SuperAdmin"}],
                    "subject": f"NTIC Security Alert: [{event_type_s.upper()}] {action_s[:50]}",
                    "htmlContent": html
                },
                headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json"},
                timeout=8
            )
        except Exception as e:
            logger.warning(f"Security alert email dispatch error: {e}")

    @app.post("/api/login")
    def login(payload: LoginRequest, request: Request):
        client_ip = extract_client_ip(request)
        # Rate limit: max 5 login attempts per 60 seconds per IP
        check_rate_limit(f"login:{client_ip}", max_attempts=5, window_seconds=60)

        conn = _get_db()
        credential = payload.email.strip()
        row = None
        try:
            cur = conn.cursor()
            # Try email first, then ticket (access pass)
            cur.execute(
                "SELECT id, email, full_name, role, ticket, password_hash, status, organization, "
                "COALESCE(must_change_password, FALSE) FROM users WHERE lower(email) = %s OR upper(ticket) = %s",
                (credential.lower(), credential.upper()),
            )
            row = cur.fetchone()
            cur.close()
        finally:
            release_db_connection(conn)

        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user_id, db_email, full_name, role, ticket, password_hash, status, organization, must_change_password = row
        if not verify_password(payload.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # A suspended/disabled account must not be able to obtain a session.
        if account_is_disabled(status):
            raise HTTPException(status_code=403, detail="This account has been disabled")

        # Password verified -> clear rate limit counter
        reset_rate_limit(f"login:{client_ip}")

        token = create_token()
        expires_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=7)
        conn = _get_db()
        client_ip_anon = anonymize_ip(client_ip)
        user_agent = request.headers.get("user-agent", "")
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (%s, %s, %s, %s)",
                (token, user_id, db_email, expires_at),
            )
            try:
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type, ip, client) VALUES (%s, %s, %s, %s, %s, %s)",
                    (f"{role} login: {db_email}", db_email, datetime.datetime.now(datetime.UTC).isoformat(), "auth", client_ip_anon, user_agent),
                )
            except Exception:
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s)",
                    (f"{role} login: {db_email}", db_email, datetime.datetime.now(datetime.UTC).isoformat(), "auth"),
                )
            conn.commit()
            cur.close()
            broadcast_async({"type": "data_changed", "collection": "audit_logs"})
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            release_db_connection(conn)

        return {
            "token": token,
            "user_id": user_id,
            "email": db_email,
            "full_name": full_name,
            "role": role,
            "ticket": ticket,
            "status": status,
            "organization": organization or "",
            # The client uses this to force the change-password prompt.
            "must_change_password": bool(must_change_password),
        }

    @app.get("/api/auth/verify")
    def auth_verify(user: dict = Depends(require_auth)):
        return {"role": user["role"], "email": user["email"]}

    # ─── SELF-SERVICE ACCOUNT ────────────────────────────────────────
    # Before this existed there was no way for a user to change their own
    # password: the UI called PATCH /api/users/{id}, which requires admin, so for
    # everyone else it failed silently and only the local cache was updated. A
    # server-issued temporary password therefore stayed valid forever.

    @app.get("/api/users/me")
    def get_my_profile(actor: dict = Depends(require_auth)):
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, email, full_name, role, ticket, status, phone, organization, "
                "COALESCE(must_change_password, FALSE), password_changed_at "
                "FROM users WHERE id = %s",
                (actor["id"],),
            )
            row = cur.fetchone()
            cur.close()
        finally:
            release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "id": row[0], "email": row[1], "full_name": row[2], "role": row[3],
            "ticket": row[4], "status": row[5], "phone": row[6], "organization": row[7],
            "must_change_password": bool(row[8]),
            "password_changed_at": str(row[9]) if row[9] else None,
            "password_min_length": MIN_PASSWORD_LENGTH,
        }

    class ChangePasswordPayload(BaseModel):
        # Not required when the account is flagged must_change_password: holding a
        # valid session already proves the caller knew the temporary password.
        current_password: str = Field(default="", max_length=200)
        new_password: str = Field(min_length=1, max_length=200)

    @app.post("/api/users/me/change-password")
    def change_my_password(payload: ChangePasswordPayload, request: Request, actor: dict = Depends(require_auth)):
        client_ip = extract_client_ip(request)
        check_rate_limit(f"pwchange:{actor['id']}", max_attempts=5, window_seconds=300)

        current_token = request.headers.get("Authorization", "")[7:]
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT password_hash, COALESCE(must_change_password, FALSE), email, full_name "
                "FROM users WHERE id = %s",
                (actor["id"],),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            stored_hash, must_change, email, full_name = row

            # A forced rotation may skip the current-password prompt; a voluntary
            # change may not.
            if not must_change or payload.current_password:
                if not payload.current_password:
                    raise HTTPException(status_code=400, detail="Your current password is required")
                if not verify_password(payload.current_password, stored_hash):
                    raise HTTPException(status_code=400, detail="Your current password is incorrect")

            new_password = payload.new_password
            problem = validate_password_strength(new_password, email=email, full_name=full_name or "")
            if problem:
                raise HTTPException(status_code=422, detail=problem)
            if verify_password(new_password, stored_hash):
                raise HTTPException(status_code=422, detail="Your new password must be different from the current one")

            cur.execute(
                "UPDATE users SET password_hash = %s, must_change_password = FALSE, "
                "password_changed_at = CURRENT_TIMESTAMP WHERE id = %s",
                (hash_password(new_password), actor["id"]),
            )
            # Sign out every OTHER device, so a stolen session cannot outlive the
            # password it was created with. The caller keeps their own session.
            cur.execute(
                "DELETE FROM auth_sessions WHERE user_id = %s AND token != %s",
                (actor["id"], current_token),
            )
            revoked = cur.rowcount
            try:
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type, ip, client) VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        f"Password changed: {email}", email,
                        datetime.datetime.now(datetime.UTC).isoformat(), "security",
                        anonymize_ip(client_ip), request.headers.get("user-agent", ""),
                    ),
                )
            except Exception:
                conn.rollback()
                # The password change itself must not fail because audit insert did.
                cur.execute(
                    "UPDATE users SET password_hash = %s, must_change_password = FALSE, "
                    "password_changed_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (hash_password(new_password), actor["id"]),
                )
                cur.execute(
                    "DELETE FROM auth_sessions WHERE user_id = %s AND token != %s",
                    (actor["id"], current_token),
                )
            conn.commit()
            cur.close()
        except HTTPException:
            conn.rollback()
            raise
        except Exception as e:
            conn.rollback()
            logger.error(f"Password change failed: {e}")
            raise HTTPException(status_code=500, detail="Could not change the password")
        finally:
            release_db_connection(conn)

        reset_rate_limit(f"pwchange:{actor['id']}")
        return {"status": "changed", "other_sessions_revoked": revoked}

    @app.post("/api/logout")
    def logout(request: Request = None, payload: dict = None):
        payload = payload or {}
        token = payload.get("token", "")
        if not token and request and request.headers.get("Authorization"):
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if token:
            conn = _get_db()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM auth_sessions WHERE token = %s", (token,))
                conn.commit()
                cur.close()
            except Exception:
                conn.rollback()
            finally:
                release_db_connection(conn)
        return {"status": "ok"}

    # ─── AUTH SESSION MANAGEMENT ─────────────────────────────────────
    @app.get("/api/auth/sessions/count")
    def auth_sessions_count(_admin: dict = Depends(require_admin)):
        conn = _get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT u.role, COUNT(*) FROM auth_sessions s "
            "JOIN users u ON s.user_id = u.id "
            "WHERE s.expires_at > CURRENT_TIMESTAMP "
            "GROUP BY u.role"
        )
        rows = cur.fetchall()
        cur.close(); release_db_connection(conn)
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
        cur.close(); release_db_connection(conn)
        return [
            {"token": r[0], "display": r[0][:8] + "..." + r[0][-8:], "user_id": r[1], "email": r[2], "created_at": str(r[3]),
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
        cur.close(); release_db_connection(conn)
        return {"status": "ok", "revoked": deleted > 0}

    @app.post("/api/auth/sessions/expire-user/{user_id}")
    def auth_expire_user_sessions(user_id: str, _admin: dict = Depends(require_admin)):
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
        deleted = cur.rowcount
        conn.commit()
        cur.close(); release_db_connection(conn)
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
        cur.close(); release_db_connection(conn)
        return {"status": "ok", "revoked": deleted}

    @app.post("/api/auth/verify-contact")
    def verify_contact(request: Request, payload: dict = None):
        """Check if email or phone is already registered or reserved by a draft.

        Unavoidably an account-existence oracle, so it is rate limited to stop
        bulk enumeration of the user base.
        """
        client_ip = extract_client_ip(request)
        check_rate_limit(f"verify-contact:{client_ip}", max_attempts=10, window_seconds=60)
        check_rate_limit(f"verify-contact-hourly:{client_ip}", max_attempts=100, window_seconds=3600)

        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        result = {"email_available": True, "phone_available": True}
        if payload and isinstance(payload.get("email"), str):
            email = payload["email"].strip().lower()
            cur.execute("SELECT id FROM users WHERE lower(email) = %s", (email,))
            if cur.fetchone():
                result["email_available"] = False
            else:
                cur.execute(
                    "SELECT email FROM registration_drafts WHERE lower(email) = %s AND updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'",
                    (email,)
                )
                if cur.fetchone():
                    result["email_available"] = False
        if payload and isinstance(payload.get("phone"), str):
            phone = payload["phone"].strip()
            cur.execute("SELECT id FROM users WHERE phone = %s", (phone,))
            if cur.fetchone():
                result["phone_available"] = False
            else:
                cur.execute(
                    "SELECT email FROM registration_drafts WHERE draft_data::text LIKE %s AND updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'",
                    ('%' + phone + '%',)
                )
                if cur.fetchone():
                    result["phone_available"] = False
        cur.close(); release_db_connection(conn)
        return result

    @app.post("/api/drafts")
    def save_draft(request: Request, payload: dict = None):
        """Save a registration draft."""
        if not payload or not isinstance(payload.get("email"), str) or not payload["email"].strip():
            raise HTTPException(status_code=400, detail="Email required")
        client_ip = extract_client_ip(request)
        check_rate_limit(f"draft-save:{client_ip}", max_attempts=30, window_seconds=60)
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        cur.execute("""
            INSERT INTO registration_drafts (email, draft_data, updated_at)
            VALUES (%s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (email) DO UPDATE SET draft_data = EXCLUDED.draft_data, updated_at = CURRENT_TIMESTAMP
        """, (payload["email"].strip().lower(), _json.dumps(payload.get("data", {}))))
        conn.commit()
        cur.close(); release_db_connection(conn)
        return {"status": "saved"}

    # A consumed draft_resume OTP challenge acts as the read credential for that
    # one email address, for this long after verification.
    _DRAFT_RESUME_GRACE_MINUTES = 30

    def _draft_resume_is_authorized(email: str, resume_token: str) -> bool:
        """True when `resume_token` is a recently-verified draft_resume challenge
        for exactly this email address."""
        if not resume_token:
            return False
        conn = get_db_connection()
        if not conn:
            return False
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM otp_challenges "
                "WHERE id = %s AND purpose = 'draft_resume' AND target = %s "
                "AND consumed_at IS NOT NULL "
                "AND consumed_at > CURRENT_TIMESTAMP - (%s * INTERVAL '1 minute')",
                (resume_token, email, _DRAFT_RESUME_GRACE_MINUTES),
            )
            ok = cur.fetchone() is not None
            cur.close()
            return ok
        except Exception as e:
            logger.warning(f"Draft resume authorization check failed: {e}")
            return False
        finally:
            release_db_connection(conn)

    @app.get("/api/drafts/{email}")
    def load_draft(email: str, request: Request, resume_token: str = ""):
        """Load a registration draft.

        A draft holds the full registration form: names, phone numbers, GPS
        coordinates and guardian contacts. Returning it for any email supplied in
        the URL was a PII leak, so the caller must present either a staff session
        or a resume token proving they received the code sent to that address.
        """
        email = email.strip().lower()

        authorized = _draft_resume_is_authorized(email, resume_token.strip())
        if not authorized:
            # Staff may also read drafts (used by the admin approval screens).
            try:
                actor = require_auth(request)
                authorized = actor["role"] in ADMIN_ROLES or actor["email"].lower() == email
            except HTTPException:
                authorized = False

        if not authorized:
            client_ip = extract_client_ip(request)
            check_rate_limit(f"draft-read-denied:{client_ip}", max_attempts=5, window_seconds=300)
            raise HTTPException(
                status_code=403,
                detail="Verify this email address to load its saved registration.",
            )

        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT draft_data FROM registration_drafts WHERE email = %s", (email,))
        row = cur.fetchone()
        cur.close(); release_db_connection(conn)
        if row:
            import json as _json
            return {"data": _json.loads(row[0])}
        return {"data": None}

    @app.delete("/api/drafts/{email}")
    def delete_draft(email: str, _actor: dict = Depends(require_admin)):
        """Delete a registration draft."""
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM registration_drafts WHERE email = %s", (email.strip().lower(),))
        conn.commit()
        cur.close(); release_db_connection(conn)
        return {"status": "deleted"}

    @app.post("/api/lms/progress")
    def save_lms_progress(payload: dict = None, _actor: dict = Depends(require_auth)):
        """Save student LMS course progress."""
        if not payload or not payload.get("student_id") or not payload.get("course_title"):
            raise HTTPException(status_code=400, detail="student_id and course_title required")
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO lms_progress (student_id, course_title, progress_pct, completed_modules, last_accessed)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (student_id, course_title) DO UPDATE SET progress_pct = EXCLUDED.progress_pct, completed_modules = EXCLUDED.completed_modules, last_accessed = CURRENT_TIMESTAMP
        """, (payload["student_id"], payload["course_title"], payload.get("progress_pct", 0), payload.get("completed_modules", 0)))
        conn.commit()
        cur.close(); release_db_connection(conn)
        return {"status": "saved"}

    @app.get("/api/lms/progress/{student_id}")
    def get_lms_progress(student_id: str, _actor: dict = Depends(require_auth)):
        """Get all LMS progress for a student."""
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT course_title, progress_pct, completed_modules, last_accessed FROM lms_progress WHERE student_id = %s ORDER BY last_accessed DESC", (student_id,))
        rows = cur.fetchall()
        cur.close(); release_db_connection(conn)
        return [{"course_title": r[0], "progress_pct": r[1], "completed_modules": r[2], "last_accessed": str(r[3])} for r in rows]

    @app.post("/api/auth/token/generate")
    def generate_access_token(payload: dict = None, _admin: dict = Depends(require_admin)):
        payload = payload or {}
        role = payload.get("role", "student").lower()
        prefix_map = {
            "super_admin": "ADM", "admin": "ADM", "support_admin": "SUP",
            "judge": "JDG", "sponsor": "SPO",
            "student": "STU", "instructor": "INS", "content_manager": "MGR",
            "reviewer": "REV", "competition_manager": "CMP", "school_admin": "SCH"
        }
        prefix = prefix_map.get(role, "USR")
        # Bounded retry: an unbounded `while True` would spin forever once the
        # code space filled up. 6 CSPRNG chars from a 32-char alphabet is ~1e9
        # combinations, so a collision inside 10 tries means something is wrong.
        ticket = ""
        for _ in range(10):
            candidate = f"NTIC-{prefix}-{_generate_access_code()}"
            conn = _get_db()
            try:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM users WHERE ticket = %s", (candidate,))
                taken = cur.fetchone()[0] > 0
                cur.close()
            finally:
                release_db_connection(conn)
            if not taken:
                ticket = candidate
                break
        if not ticket:
            raise HTTPException(status_code=500, detail="Could not allocate a unique access pass")
        return {"ticket": ticket}

    # ─── REAL-TIME SYNC WEBSOCKET ────────────────────────────────────
    @app.websocket("/api/ws")
    async def ws_endpoint(ws: WebSocket):
        # The `ws: WebSocket` annotation is REQUIRED. Without it FastAPI treats
        # `ws` as an ordinary query parameter, fails validation because no such
        # parameter is supplied, and rejects every handshake with HTTP 403 before
        # this function body ever runs. That is why real-time sync silently never
        # worked.
        token = ws.query_params.get("token", "")
        ok = await ws_manager.connect(ws, token)
        if not ok:
            return
        try:
            while True:
                data = await ws.receive_text()
                if data == "ping":
                    await ws.send_text("pong")
        except Exception:
            # Normal disconnects land here too; nothing actionable to log.
            pass
        finally:
            ws_manager.disconnect(ws)

    # CHAT
    # Stays reachable without a session because the public landing-page chatbot
    # needs it. Abuse is contained with per-IP rate limits and a payload size
    # cap so it cannot be used as free, unmetered LLM capacity on our key.
    _CHAT_MAX_CHARS = 20_000

    class ChatRequest(BaseModel):
        system_instruction: dict = {}
        contents: list = []
        generationConfig: dict = {}

    @app.post("/api/chat")
    async def chat_proxy(payload: ChatRequest, request: Request):
        if not settings.GEMINI_API_KEY:
            raise HTTPException(status_code=403, detail="AI service not configured")

        client_ip = extract_client_ip(request)
        check_rate_limit(f"chat:{client_ip}", max_attempts=15, window_seconds=60)
        check_rate_limit(f"chat-hourly:{client_ip}", max_attempts=200, window_seconds=3600)

        if len(payload.contents) > 60:
            raise HTTPException(status_code=413, detail="Conversation too long")
        approx_chars = len(str(payload.contents)) + len(str(payload.system_instruction))
        if approx_chars > _CHAT_MAX_CHARS:
            raise HTTPException(status_code=413, detail="Request payload too large")

        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
        headers = {"x-goog-api-key": settings.GEMINI_API_KEY}
        body = {
            "system_instruction": payload.system_instruction,
            "contents": payload.contents,
            "generationConfig": payload.generationConfig
        }
        async with AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=body, headers=headers)
            if resp.status_code >= 400:
                # Do not echo the provider's raw error body back to the caller.
                logger.warning(f"Gemini API error {resp.status_code}: {resp.text[:500]}")
                raise HTTPException(status_code=502, detail="AI provider error")
            return resp.json()

    # TICKETS
    class TicketCreate(BaseModel):
        userId: str = Field(default="", max_length=120)
        userName: str = Field(default="", max_length=120)
        userRole: str = Field(default="", max_length=40)
        userEmail: str = Field(default="", max_length=254)
        chatHistory: list = []

    class TicketReply(BaseModel):
        agentName: str
        text: str

    class TicketStatusUpdate(BaseModel):
        status: str

    @app.post("/api/tickets", status_code=status.HTTP_201_CREATED)
    def create_ticket(payload: TicketCreate, request: Request):
        """Create a support ticket.

        Stays public because the landing-page chat widget is the escalation path
        for visitors who cannot log in. Two hardenings:
          * rate limited per IP, so it cannot be used to flood the queue;
          * the reporter's identity is taken from the session when one exists.
            Previously userId/userName/userRole/userEmail were trusted verbatim,
            letting anyone file a ticket as somebody else - including as staff.
        """
        client_ip = extract_client_ip(request)
        check_rate_limit(f"ticket:{client_ip}", max_attempts=5, window_seconds=300)
        check_rate_limit(f"ticket-hourly:{client_ip}", max_attempts=20, window_seconds=3600)

        if len(payload.chatHistory) > 200:
            raise HTTPException(status_code=413, detail="Conversation too long")

        # Trust the session over the body whenever we have one.
        try:
            actor = require_auth(request)
            user_id = actor["id"]
            user_name = actor["full_name"] or actor["email"]
            user_role = actor["role"]
            user_email = actor["email"]
        except HTTPException:
            submitted_email = payload.userEmail.strip().lower()
            if submitted_email and not _EMAIL_RE.match(submitted_email):
                raise HTTPException(status_code=422, detail="Invalid email address")
            user_email = submitted_email
            user_id = submitted_email or f"guest-{uuid.uuid4().hex[:8]}"
            user_name = payload.userName.strip() or "Guest"
            # An anonymous caller is always a guest, never a privileged role.
            user_role = "guest"

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
                ticket_id, user_id, user_name, user_role, user_email,
                _json.dumps([m.model_dump() if hasattr(m, 'model_dump') else m for m in payload.chatHistory])
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            logger.warning(f"Ticket creation failed: {e}")
            raise HTTPException(status_code=400, detail="Could not create the support ticket")
        cur.close()
        release_db_connection(conn)
        return {"id": ticket_id, "status": "open"}

    @app.get("/api/tickets")
    def list_tickets(user_id: str = None, recycled: bool = False, _auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        if recycled:
            if user_id:
                cur.execute("SELECT * FROM support_tickets WHERE user_id = %s AND is_deleted IS TRUE ORDER BY deleted_at DESC NULLS LAST", (user_id,))
            else:
                cur.execute("SELECT * FROM support_tickets WHERE is_deleted IS TRUE ORDER BY deleted_at DESC NULLS LAST")
        else:
            if user_id:
                cur.execute("SELECT * FROM support_tickets WHERE user_id = %s AND (is_deleted IS FALSE OR is_deleted IS NULL) ORDER BY last_updated DESC", (user_id,))
            else:
                cur.execute("SELECT * FROM support_tickets WHERE (is_deleted IS FALSE OR is_deleted IS NULL) ORDER BY last_updated DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        cols = ["id", "user_id", "user_name", "user_role", "user_email", "status", "chat_history", "admin_replies", "is_deleted", "deleted_at", "created_at", "last_updated"]
        result = []
        for r in rows:
            d = dict(zip(cols, r))
            d["chat_history"] = _json.loads(d["chat_history"]) if isinstance(d["chat_history"], str) else (d["chat_history"] or [])
            d["admin_replies"] = _json.loads(d["admin_replies"]) if isinstance(d["admin_replies"], str) else (d["admin_replies"] or [])
            d["is_deleted"] = bool(d.get("is_deleted"))
            d["deleted_at"] = str(d["deleted_at"]) if d.get("deleted_at") else None
            d["created_at"] = str(d["created_at"])
            d["last_updated"] = str(d["last_updated"])
            result.append(d)
        return result

    @app.delete("/api/tickets/recycle-bin/empty")
    def empty_recycle_bin(_actor: dict = Depends(require_role(SUPPORT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute("DELETE FROM support_tickets WHERE is_deleted IS TRUE")
            count = cur.rowcount
            conn.commit()
            cur.close()
            release_db_connection(conn)
            return {"status": "emptied", "count": count}
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))

    @app.get("/api/tickets/{ticket_id}")
    def get_ticket(ticket_id: str, _auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        cur.execute("SELECT * FROM support_tickets WHERE id = %s", (ticket_id,))
        row = cur.fetchone()
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")
        cols = ["id", "user_id", "user_name", "user_role", "user_email", "status", "chat_history", "admin_replies", "is_deleted", "deleted_at", "created_at", "last_updated"]
        d = dict(zip(cols, row))
        d["chat_history"] = _json.loads(d["chat_history"]) if isinstance(d["chat_history"], str) else (d["chat_history"] or [])
        d["admin_replies"] = _json.loads(d["admin_replies"]) if isinstance(d["admin_replies"], str) else (d["admin_replies"] or [])
        d["is_deleted"] = bool(d.get("is_deleted"))
        d["deleted_at"] = str(d["deleted_at"]) if d.get("deleted_at") else None
        d["created_at"] = str(d["created_at"])
        d["last_updated"] = str(d["last_updated"])
        return d

    @app.post("/api/tickets/{ticket_id}/reply")
    def reply_to_ticket(ticket_id: str, payload: TicketReply, _actor: dict = Depends(require_role(SUPPORT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        cur.execute("SELECT admin_replies FROM support_tickets WHERE id = %s AND (is_deleted IS FALSE OR is_deleted IS NULL)", (ticket_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=404, detail="Ticket not found or deleted")
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
        release_db_connection(conn)
        return {"status": "ok"}

    @app.patch("/api/tickets/{ticket_id}/status")
    def update_ticket_status(ticket_id: str, payload: TicketStatusUpdate, _actor: dict = Depends(require_role(SUPPORT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute(
            "UPDATE support_tickets SET status = %s, last_updated = CURRENT_TIMESTAMP WHERE id = %s AND (is_deleted IS FALSE OR is_deleted IS NULL)",
            (payload.status, ticket_id)
        )
        if cur.rowcount == 0:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=404, detail="Ticket not found or deleted")
        conn.commit()
        cur.close()
        release_db_connection(conn)
        return {"status": payload.status}

    @app.delete("/api/tickets/{ticket_id}")
    def delete_ticket(ticket_id: str, _actor: dict = Depends(require_role(SUPPORT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute(
            "UPDATE support_tickets SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = %s",
            (ticket_id,)
        )
        if cur.rowcount == 0:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=404, detail="Ticket not found")
        conn.commit()
        cur.close()
        release_db_connection(conn)
        return {"status": "deleted", "id": ticket_id}

    @app.post("/api/tickets/{ticket_id}/restore")
    def restore_ticket(ticket_id: str, _actor: dict = Depends(require_role(SUPPORT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute(
            "UPDATE support_tickets SET is_deleted = FALSE, deleted_at = NULL WHERE id = %s",
            (ticket_id,)
        )
        if cur.rowcount == 0:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=404, detail="Ticket not found")
        conn.commit()
        cur.close()
        release_db_connection(conn)
        return {"status": "restored", "id": ticket_id}

    @app.delete("/api/tickets/{ticket_id}/permanent")
    def permanently_delete_ticket(ticket_id: str, _actor: dict = Depends(require_role(SUPPORT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM support_tickets WHERE id = %s", (ticket_id,))
        if cur.rowcount == 0:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=404, detail="Ticket not found")
        conn.commit()
        cur.close()
        release_db_connection(conn)
        return {"status": "permanently_deleted", "id": ticket_id}

    # STUDENTS
    @app.get("/api/students")
    def list_students(_auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tenant_id, first_name, last_name, email, track, consent_granted, created_at FROM students ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "tenant_id": r[1], "first_name": r[2], "last_name": r[3], "email": r[4], "track": r[5], "consent_granted": r[6], "created_at": str(r[7])} for r in rows]

    @app.post("/api/students", status_code=status.HTTP_201_CREATED)
    def create_student(payload: StudentCreate, request: Request):
        # Still reachable without a session: the anonymous team-registration flow
        # creates the team lead's student record here. Rate limited so it cannot
        # be used to bulk-inject records.
        # TODO: route anonymous registration through the approvals queue, then
        # require a session on this endpoint.
        client_ip = extract_client_ip(request)
        check_rate_limit(f"student-create:{client_ip}", max_attempts=10, window_seconds=300)
        check_rate_limit(f"student-create-hourly:{client_ip}", max_attempts=40, window_seconds=3600)
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "students"})
        return {"id": student_id, "first_name": payload.first_name, "last_name": payload.last_name, "email": payload.email, "track": payload.track}

    @app.delete("/api/students/{item_id}")
    def delete_student(item_id: str, _actor: dict = Depends(require_role(STUDENT_ADMIN_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM students WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "students"})
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/students/{item_id}")
    def update_student(item_id: str, payload: StudentCreate, _actor: dict = Depends(require_role(STUDENT_ADMIN_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Student not found")
        broadcast_async({"type": "data_changed", "collection": "students"})
        return {"id": item_id, "status": "updated"}

    # SUBMISSIONS
    @app.get("/api/submissions")
    def list_submissions(_auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tenant_id, student_id, source_code_path, video_url, status, score, feedback, created_at FROM assignment_submissions ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "tenant_id": r[1], "student_id": r[2], "source_code_path": r[3], "video_url": r[4], "status": r[5], "score": r[6], "feedback": r[7], "created_at": str(r[8])} for r in rows]

    @app.post("/api/submissions", status_code=status.HTTP_201_CREATED)
    def create_submission(payload: SubmissionCreate, _actor: dict = Depends(require_auth)):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "submissions"})
        return {"id": sub_id, "status": "Pending"}

    @app.delete("/api/submissions/{item_id}")
    def delete_submission(item_id: str, _actor: dict = Depends(require_role(ADMIN_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM assignment_submissions WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "submissions"})
        return {"status": "deleted", "id": item_id}

    # SUBMISSION GRADING
    class GradeSubmissionRequest(BaseModel):
        score: int = None
        feedback: str = ""
        status: str = None

    @app.patch("/api/submissions/{item_id}/grade")
    def grade_submission(item_id: str, payload: GradeSubmissionRequest, _actor: dict = Depends(require_role(GRADING_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Submission not found")
        broadcast_async({"type": "data_changed", "collection": "submissions"})
        return {"id": item_id, "status": "graded"}

    # COMPETITIONS
    class CompetitionCreate(BaseModel):
        title: str
        description: str = ""
        track: str = "Coding"
        category: str = ""
        deadline: str = ""
        status: str = "active"
        comp_type: str = "qualifier"
        max_teams: int = 50
        teams: int = 0
        prize: str = ""
        start_date: str = ""
        end_date: str = ""
        phases: str = "[]"
        rules: str = ""
        criteria: str = ""
        progress: int = 0

    @app.get("/api/competitions")
    def list_competitions():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, description, track, category, deadline, status, created_at, comp_type, max_teams, teams, prize, start_date, end_date, phases, rules, criteria, progress FROM competitions ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "description": r[2], "track": r[3], "category": r[4], "deadline": r[5], "status": r[6], "created_at": str(r[7]), "type": r[8], "maxTeams": r[9], "teams": r[10], "prize": r[11], "startDate": r[12], "endDate": r[13], "phases": r[14], "rules": r[15], "criteria": r[16], "progress": r[17]} for r in rows]

    @app.post("/api/competitions", status_code=status.HTTP_201_CREATED)
    def create_competition(payload: CompetitionCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        comp_id = "comp-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO competitions (id, title, description, track, category, deadline, status, comp_type, max_teams, teams, prize, start_date, end_date, phases, rules, criteria, progress) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (comp_id, payload.title, payload.description, payload.track, payload.category, payload.deadline, payload.status, payload.comp_type, payload.max_teams, payload.teams, payload.prize, payload.start_date, payload.end_date, payload.phases, payload.rules, payload.criteria, payload.progress))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "competitions"})
        return {"id": comp_id, "title": payload.title, "status": payload.status}

    @app.patch("/api/competitions/{item_id}")
    def update_competition(item_id: str, payload: CompetitionCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE competitions SET title = %s, description = %s, track = %s, category = %s, deadline = %s, status = %s, comp_type = %s, max_teams = %s, teams = %s, prize = %s, start_date = %s, end_date = %s, phases = %s, rules = %s, criteria = %s, progress = %s WHERE id = %s RETURNING id",
                (payload.title, payload.description, payload.track, payload.category, payload.deadline, payload.status, payload.comp_type, payload.max_teams, payload.teams, payload.prize, payload.start_date, payload.end_date, payload.phases, payload.rules, payload.criteria, payload.progress, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Competition not found")
        broadcast_async({"type": "data_changed", "collection": "competitions"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/competitions/{item_id}")
    def delete_competition(item_id: str, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM competitions WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "competitions"})
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
    def list_teams(_auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, name, track, lead, members, status, school_name FROM teams ORDER BY name ASC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "name": r[1], "track": r[2], "lead": r[3], "members": r[4], "status": r[5], "school_name": r[6]} for r in rows]

    @app.post("/api/teams", status_code=status.HTTP_201_CREATED)
    def create_team(payload: TeamCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"id": team_id, "name": payload.name, "status": payload.status}

    @app.patch("/api/teams/{item_id}")
    def update_team(item_id: str, payload: TeamCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Team not found")
        broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/teams/{item_id}")
    def delete_team(item_id: str, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM teams WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "teams"})
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
        release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "date": r[2], "time": r[3], "location": r[4], "description": r[5], "type": r[6]} for r in rows]

    @app.post("/api/events", status_code=status.HTTP_201_CREATED)
    def create_event(payload: EventCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        evt_id = "evt-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO events (id, title, date, time, location, description, type) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (evt_id, payload.title, payload.date, payload.time, payload.location, payload.description, payload.type))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "events"})
        return {"id": evt_id, "title": payload.title}

    @app.delete("/api/events/{item_id}")
    def delete_event(item_id: str, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM events WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "events"})
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/events/{item_id}")
    def update_event(item_id: str, payload: EventCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        broadcast_async({"type": "data_changed", "collection": "events"})
        return {"id": item_id, "status": "updated"}

    # STORIES
    @app.get("/api/stories")
    def list_stories():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, excerpt, date, image, tag, tag_color, read_time, likes FROM stories ORDER BY date DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [
            {
                "id": r[0], "title": r[1], "body": r[2], "date": r[3], "image": r[4],
                "tag": r[5] or "", "tagColor": r[6] or "", "readTime": r[7] or "5 min",
                "likes": r[8] or 0, "likedBy": []
            }
            for r in rows
        ]

    @app.post("/api/stories", status_code=status.HTTP_201_CREATED)
    def create_story(payload: StoryCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        st_id = "st-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image, tag, tag_color, read_time, likes) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (st_id, payload.title, payload.excerpt, payload.date, payload.image, payload.tag, payload.tag_color, payload.read_time, payload.likes))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "stories"})
        return {"id": st_id, "title": payload.title}

    @app.delete("/api/stories/{item_id}")
    def delete_story(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM stories WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "stories"})
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/stories/{item_id}")
    def update_story(item_id: str, payload: StoryCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Story not found")
        broadcast_async({"type": "data_changed", "collection": "stories"})
        return {"id": item_id, "status": "updated"}

    # SCHOOLS
    @app.get("/api/schools")
    def list_schools():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, name, region, teams, score, rank, status, coding_score, robotics_score, ai_score, cyber_score FROM schools ORDER BY rank ASC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "name": r[1], "region": r[2], "teams": r[3], "score": r[4], "rank": r[5], "status": r[6],
                 "coding_score": r[7], "robotics_score": r[8], "ai_score": r[9], "cyber_score": r[10]} for r in rows]

    @app.post("/api/schools", status_code=status.HTTP_201_CREATED)
    def create_school(payload: SchoolCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        sch_id = "sch-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status, coding_score, robotics_score, ai_score, cyber_score) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (sch_id, payload.name, payload.region, payload.teams, payload.score, payload.rank, payload.status,
                     payload.coding_score, payload.robotics_score, payload.ai_score, payload.cyber_score))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "schools"})
        return {"id": sch_id, "name": payload.name}

    @app.delete("/api/schools/{item_id}")
    def delete_school(item_id: str, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM schools WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "schools"})
        return {"status": "deleted", "id": item_id}

    @app.patch("/api/schools/{item_id}")
    def update_school(item_id: str, payload: SchoolCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE schools SET name = %s, region = %s, teams = %s, score = %s, rank = %s, status = %s, coding_score = %s, robotics_score = %s, ai_score = %s, cyber_score = %s WHERE id = %s RETURNING id",
                (payload.name, payload.region, payload.teams, payload.score, payload.rank, payload.status,
                 payload.coding_score, payload.robotics_score, payload.ai_score, payload.cyber_score, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="School not found")
        broadcast_async({"type": "data_changed", "collection": "schools"})
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
        release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "description": r[2], "image": r[3]} for r in rows]

    class PhilCardCreate(BaseModel):
        title: str
        description: str = ""
        image: str = ""

    @app.post("/api/philosophy", status_code=status.HTTP_201_CREATED)
    def create_philosophy_card(payload: PhilCardCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        pid = "phil-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO philosophy_cards (id, title, description, image) VALUES (%s, %s, %s, %s)", (pid, payload.title, payload.description, payload.image))
        conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "philosophy"})
        return {"id": pid, "title": payload.title}

    @app.patch("/api/philosophy/{item_id}")
    def update_philosophy_card(item_id: str, payload: PhilCardCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("UPDATE philosophy_cards SET title=%s, description=%s, image=%s WHERE id=%s RETURNING id", (payload.title, payload.description, payload.image, item_id))
        row = cur.fetchone(); conn.commit(); cur.close(); release_db_connection(conn)
        if not row: raise HTTPException(status_code=404, detail="Card not found")
        broadcast_async({"type": "data_changed", "collection": "philosophy"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/philosophy/{item_id}")
    def delete_philosophy_card(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM philosophy_cards WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "philosophy"})
        return {"status": "deleted", "id": item_id}

    # HERO SLIDES
    class HeroSlideCreate(BaseModel):
        tag: str = ""
        title: str = ""
        description: str = ""
        image: str = ""
        image_file_id: str = ""
        video_file_id: str = ""
        video_url: str = ""
        sort_order: int = 0

    @app.get("/api/hero-slides")
    def list_hero_slides():
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tag, title, description, image, image_file_id, video_file_id, video_url, sort_order FROM hero_slides ORDER BY sort_order")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        return [{"id": r[0], "tag": r[1], "title": r[2], "description": r[3], "image": r[4], "imageFileId": r[5], "videoFileId": r[6], "videoUrl": r[7], "sortOrder": r[8]} for r in rows]

    @app.post("/api/hero-slides", status_code=status.HTTP_201_CREATED)
    def create_hero_slide(payload: HeroSlideCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        sid = "slide-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO hero_slides (id, tag, title, description, image, image_file_id, video_file_id, video_url, sort_order) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", (sid, payload.tag, payload.title, payload.description, payload.image, payload.image_file_id, payload.video_file_id, payload.video_url, payload.sort_order))
        conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "hero_slides"})
        return {"id": sid, "title": payload.title}

    @app.delete("/api/hero-slides/{item_id}")
    def delete_hero_slide(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM hero_slides WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "hero_slides"})
        return {"status": "deleted", "id": item_id}

    # TALENT DISCOVERY
    class TalentCreate(BaseModel):
        student_name: str = ""
        school: str = ""
        track: str = ""
        project_title: str = ""
        talent_tags: str = ""
        description: str = ""
        mentor: str = ""
        status: str = "active"

    @app.get("/api/talent")
    def list_talent():
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, student_name, school, track, project_title, talent_tags, description, mentor, status FROM talent_discovery ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        return [{"id": r[0], "studentName": r[1], "school": r[2], "track": r[3], "projectTitle": r[4], "talentTags": r[5], "description": r[6], "mentor": r[7], "status": r[8]} for r in rows]

    @app.post("/api/talent", status_code=status.HTTP_201_CREATED)
    def create_talent(payload: TalentCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        tid = "td-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO talent_discovery (id, student_name, school, track, project_title, talent_tags, description, mentor, status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", (tid, payload.student_name, payload.school, payload.track, payload.project_title, payload.talent_tags, payload.description, payload.mentor, payload.status))
        conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "talent"})
        return {"id": tid, "studentName": payload.student_name}

    @app.patch("/api/talent/{item_id}")
    def update_talent(item_id: str, payload: TalentCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("UPDATE talent_discovery SET student_name=%s, school=%s, track=%s, project_title=%s, talent_tags=%s, description=%s, mentor=%s, status=%s WHERE id=%s RETURNING id", (payload.student_name, payload.school, payload.track, payload.project_title, payload.talent_tags, payload.description, payload.mentor, payload.status, item_id))
        row = cur.fetchone(); conn.commit(); cur.close(); release_db_connection(conn)
        if not row: raise HTTPException(status_code=404, detail="Talent entry not found")
        broadcast_async({"type": "data_changed", "collection": "talent"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/talent/{item_id}")
    def delete_talent(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM talent_discovery WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "talent"})
        return {"status": "deleted", "id": item_id}

    # PLATFORM STATS + COUNTDOWN
    @app.get("/api/platform-stats")
    def get_platform_stats():
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT regions, mentors, schools, students, projects, grants, countdown_date FROM platform_stats WHERE id='stats-1'")
        row = cur.fetchone(); cur.close(); release_db_connection(conn)
        if not row: return {"regions": 0, "mentors": 0, "schools": 0, "students": 0, "projects": 0, "grants": 0, "countdownDate": "2026-08-15T09:00:00"}
        return {"regions": row[0], "mentors": row[1], "schools": row[2], "students": row[3], "projects": row[4], "grants": row[5], "countdownDate": row[6] or "2026-08-15T09:00:00"}

    class StatsUpdate(BaseModel):
        regions: Optional[int] = None
        mentors: Optional[int] = None
        schools: Optional[int] = None
        students: Optional[int] = None
        projects: Optional[float] = None
        grants: Optional[float] = None
        countdown_date: Optional[str] = None

    @app.patch("/api/platform-stats")
    def update_platform_stats(payload: StatsUpdate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT regions, mentors, schools, students, projects, grants, countdown_date FROM platform_stats WHERE id='stats-1'")
        existing = cur.fetchone()

        curr_regions = existing[0] if existing and existing[0] is not None else 0
        curr_mentors = existing[1] if existing and existing[1] is not None else 0
        curr_schools = existing[2] if existing and existing[2] is not None else 0
        curr_students = existing[3] if existing and existing[3] is not None else 0
        curr_projects = existing[4] if existing and existing[4] is not None else 0.0
        curr_grants = existing[5] if existing and existing[5] is not None else 0.0
        curr_countdown = existing[6] if existing and existing[6] is not None else "2026-08-15T09:00:00"

        regions = payload.regions if payload.regions is not None else curr_regions
        mentors = payload.mentors if payload.mentors is not None else curr_mentors
        schools = payload.schools if payload.schools is not None else curr_schools
        students = payload.students if payload.students is not None else curr_students
        projects = payload.projects if payload.projects is not None else curr_projects
        grants = payload.grants if payload.grants is not None else curr_grants
        countdown_date = payload.countdown_date if payload.countdown_date is not None else curr_countdown

        cur.execute(
            "INSERT INTO platform_stats (id, regions, mentors, schools, students, projects, grants, countdown_date) VALUES ('stats-1',%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET regions=EXCLUDED.regions, mentors=EXCLUDED.mentors, schools=EXCLUDED.schools, students=EXCLUDED.students, projects=EXCLUDED.projects, grants=EXCLUDED.grants, countdown_date=EXCLUDED.countdown_date, updated_at=CURRENT_TIMESTAMP",
            (regions, mentors, schools, students, projects, grants, countdown_date)
        )
        conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "platform_stats"})
        return {"status": "updated"}

    # CSR UPDATES
    class CsrCreate(BaseModel):
        title: str = ""
        description: str = ""
        date: str = ""
        icon: str = ""

    @app.get("/api/csr")
    def list_csr():
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, description, date, icon FROM csr_updates ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "description": r[2], "date": r[3], "icon": r[4]} for r in rows]

    @app.post("/api/csr", status_code=status.HTTP_201_CREATED)
    def create_csr(payload: CsrCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cid = "csr-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO csr_updates (id, title, description, date, icon) VALUES (%s,%s,%s,%s,%s)", (cid, payload.title, payload.description, payload.date, payload.icon))
        conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "csr"})
        return {"id": cid, "title": payload.title}

    @app.delete("/api/csr/{item_id}")
    def delete_csr(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM csr_updates WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "csr"})
        return {"status": "deleted", "id": item_id}

    # USERS
    @app.get("/api/users")
    def list_users(_admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, email, full_name, role, ticket, status, created_at, phone, organization, age_group, experience_level, competition_id, photo_file_id, doc_file_id FROM users ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "email": r[1], "full_name": r[2], "role": r[3], "ticket": r[4], "status": r[5], "created_at": str(r[6]), "phone": r[7] or "", "organization": r[8] or "", "age_group": r[9] or "", "experience_level": r[10] or "", "competition_id": r[11] or "", "photo_file_id": r[12] or "", "doc_file_id": r[13] or ""} for r in rows]

    @app.get("/api/users/count")
    def users_count(_admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        total = cur.fetchone()[0]
        cur.close()
        release_db_connection(conn)
        return {"total": total}

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
        release_db_connection(conn)
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
        organization: str = ""
        age_group: str = ""
        experience_level: str = ""
        competition_id: str = ""
        photo_file_id: str = ""
        doc_file_id: str = ""

    @app.post("/api/users", status_code=status.HTTP_201_CREATED)
    def create_user(payload: UserCreate, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        user_id = "USR-" + str(uuid.uuid4())[:8]

        # If the caller did not choose a password, the SERVER mints a strong one
        # and returns it exactly once. Previously this fell back to the shared
        # literal "changeme123" with nothing forcing a change.
        supplied_password = (payload.password or "").strip()
        if supplied_password:
            problem = validate_password_strength(
                supplied_password, email=payload.email, full_name=payload.full_name or ""
            )
            if problem:
                release_db_connection(conn)
                raise HTTPException(status_code=422, detail=problem)
        generated_password = "" if supplied_password else _generate_temp_password()
        password_hash = hash_password(supplied_password or generated_password)

        ticket = payload.ticket or f"NTIC-{payload.role.upper()[:3]}-{_generate_access_code()}"
        phone = payload.phone.strip() if payload.phone and payload.phone.strip() else None
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone, organization, age_group, experience_level, competition_id, photo_file_id, doc_file_id, must_change_password) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (user_id, payload.email.strip().lower(), payload.full_name, payload.role, ticket, password_hash, payload.status, phone, payload.organization or None, payload.age_group or None, payload.experience_level or None, payload.competition_id or None, payload.photo_file_id or None, payload.doc_file_id or None, bool(generated_password))
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        response = {"id": user_id, "email": payload.email, "role": payload.role, "ticket": ticket}
        if generated_password:
            # Shown once, never retrievable again.
            response["temporary_password"] = generated_password
        return response

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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail="This email is already registered")
        if payload.phone:
            cur.execute("SELECT id FROM users WHERE phone = %s", (payload.phone,))
            if cur.fetchone():
                cur.close()
                release_db_connection(conn)
                raise HTTPException(status_code=400, detail="This phone number is already registered")
        
        user_id = "USR-" + str(uuid.uuid4())[:8]
        # Public self-registration must still end up with a real password. If
        # none was supplied, mint one server-side rather than falling back to a
        # shared literal that anyone could guess.
        supplied_password = (payload.password or "").strip()
        generated_password = "" if supplied_password else _generate_temp_password()
        password_hash = hash_password(supplied_password or generated_password)
        ticket = payload.ticket or f"NTIC-{payload.role.upper()[:3]}-{_generate_access_code()}"
        phone = payload.phone.strip() if payload.phone and payload.phone.strip() else None
        try:
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone, organization, age_group, experience_level, competition_id, photo_file_id, doc_file_id, must_change_password) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (user_id, payload.email.strip().lower(), payload.full_name, payload.role, ticket, password_hash, payload.status, phone, payload.organization or None, payload.age_group or None, payload.experience_level or None, payload.competition_id or None, payload.photo_file_id or None, payload.doc_file_id or None, bool(generated_password))
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        response = {"id": user_id, "email": payload.email, "role": payload.role, "ticket": ticket}
        if generated_password:
            response["temporary_password"] = generated_password
        return response

    @app.patch("/api/users/{user_id}")
    def update_user(user_id: str, payload: UserCreate, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        parts = ["full_name = %s", "role = %s", "status = %s", "ticket = %s", "phone = %s"]
        vals = [payload.full_name, payload.role, payload.status, payload.ticket or None, payload.phone.strip() if payload.phone and payload.phone.strip() else None]
        if payload.password:
            from app.security import hash_password
            parts.append("password_hash = %s")
            vals.append(hash_password(payload.password))
            cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        broadcast_async({"type": "data_changed", "collection": "users"})
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
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        return {"status": "deleted", "id": user_id}

    @app.post("/api/users/{user_id}/reset-password")
    def reset_user_password(user_id: str, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT email, ticket FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); release_db_connection(conn)
            raise HTTPException(status_code=404, detail="User not found")
        email, ticket = row
        # A CSPRNG, and long enough that it is not brute-forceable. The previous
        # version used random.choices (Mersenne Twister) to make a 6-digit value
        # that then became the account's permanent password.
        temp_password = _generate_temp_password()
        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
        # must_change_password forces the user to pick their own on next sign-in,
        # so a temporary password cannot quietly become permanent.
        cur.execute(
            "UPDATE users SET password_hash = %s, must_change_password = TRUE WHERE id = %s",
            (hash_password(temp_password), user_id),
        )
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        # `otp` is kept in the response for backwards compatibility with the
        # existing admin UI, which displays this value to hand to the user.
        return {"email": email, "ticket": ticket, "temporary_password": temp_password, "otp": temp_password}

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
        release_db_connection(conn)
        return [{"id": r[0], "type": r[1], "initials": r[2], "name": r[3], "team_name": r[4], "project_title": r[5], "members": (_json.loads(r[6]) if isinstance(r[6], str) else (r[6] or [])), "school": r[7], "year": r[8], "badge": r[9], "track_class": r[10], "expiry_date": r[11]} for r in rows]

    @app.post("/api/hof", status_code=status.HTTP_201_CREATED)
    def create_hof(payload: HofCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "hof"})
        return {"id": hof_id, "name": payload.name}

    @app.patch("/api/hof/{item_id}")
    def update_hof(item_id: str, payload: HofCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
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
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="HOF entry not found")
        broadcast_async({"type": "data_changed", "collection": "hof"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/hof/{item_id}")
    def delete_hof(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM hof_entries WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "hof"})
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
        release_db_connection(conn)
        return [{"id": r[0], "headline": r[1], "tag": r[2], "date": r[3], "link": r[4]} for r in rows]

    @app.post("/api/news", status_code=status.HTTP_201_CREATED)
    def create_news(payload: NewsCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        news_id = "news-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES (%s, %s, %s, %s, %s)",
                        (news_id, payload.headline, payload.tag, payload.date or None, payload.link))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "news"})
        return {"id": news_id, "headline": payload.headline}

    @app.delete("/api/news/{item_id}")
    def delete_news(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM news_items WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "news"})
        return {"status": "deleted", "id": item_id}

    # AUDIT LOGS
    class AuditCreate(BaseModel):
        """What a client may say about an audit event.

        `usr`, `time`, `ip` and `client` are deliberately NOT accepted. They used
        to be caller-controlled, which let any authenticated user attribute
        actions to somebody else, forge a source IP, and backdate entries -
        destroying the evidentiary value of the whole trail. They are now derived
        from the session and the request.
        """
        action: str = Field(min_length=1, max_length=500)
        type: str = Field(default="", max_length=40)

    # Event categories that trigger a SuperAdmin alert email.
    _AUDIT_ALERT_TYPES = {"revoked", "security", "critical"}
    # Categories a client may claim. Anything else is recorded as "general" so a
    # caller cannot mislabel an event to dodge (or trigger) alerting.
    _AUDIT_TYPES = {
        "general", "auth", "security", "critical", "revoked", "approval",
        "ticket", "content", "grading", "competition", "data", "system",
    }

    @app.get("/api/audit-logs")
    def list_audit_logs(
        limit: int = 200,
        category: str = "",
        usr: str = "",
        q: str = "",
        _admin: dict = Depends(require_admin)
    ):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        query = "SELECT id, action, usr, time, type, COALESCE(ip, ''), COALESCE(client, '') FROM audit_logs"
        params = []
        conditions = []
        if category and category != "all":
            conditions.append("type = %s")
            params.append(category)
        if usr and usr != "all":
            conditions.append("lower(usr) = lower(%s)")
            params.append(usr)
        if q and q.strip():
            conditions.append("(lower(action) LIKE %s OR lower(usr) LIKE %s OR lower(ip) LIKE %s)")
            q_term = f"%{q.strip().lower()}%"
            params.extend([q_term, q_term, q_term])
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY id DESC LIMIT %s"
        params.append(max(1, min(limit, 1000)))

        try:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
            cur.close()
            release_db_connection(conn)
            return [{"id": r[0], "action": r[1], "user": r[2], "time": r[3], "type": r[4], "ip": r[5], "client": r[6]} for r in rows]
        except Exception:
            cur.execute("SELECT id, action, usr, time, type FROM audit_logs ORDER BY id DESC LIMIT %s", (max(1, min(limit, 1000)),))
            rows = cur.fetchall()
            cur.close()
            release_db_connection(conn)
            return [{"id": r[0], "action": r[1], "user": r[2], "time": r[3], "type": r[4], "ip": "", "client": ""} for r in rows]

    @app.post("/api/audit-logs", status_code=status.HTTP_201_CREATED)
    def create_audit_log(payload: AuditCreate, request: Request, actor: dict = Depends(require_auth)):
        # Every attributable field comes from the server, not the request body.
        actor_email = actor["email"]
        client_ip = anonymize_ip(extract_client_ip(request))
        user_agent = request.headers.get("user-agent", "")[:500]
        log_time = datetime.datetime.now(datetime.UTC).isoformat()
        event_type = payload.type.strip().lower()
        if event_type not in _AUDIT_TYPES:
            event_type = "general"

        # A single user cannot flood the table and push real events past the
        # read cap.
        check_rate_limit(f"audit:{actor['id']}", max_attempts=60, window_seconds=60)

        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            try:
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type, ip, client) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                    (payload.action, actor_email, log_time, event_type, client_ip, user_agent)
                )
            except Exception:
                conn.rollback()
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s) RETURNING id",
                    (payload.action, actor_email, log_time, event_type)
                )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            logger.warning(f"Audit log insert failed: {e}")
            raise HTTPException(status_code=400, detail="Could not record the audit entry")
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "audit_logs"})

        # SuperAdmin alert for critical/security events.
        action_lower = payload.action.lower()
        if event_type in _AUDIT_ALERT_TYPES or "delete" in action_lower or "denied" in action_lower:
            try:
                import threading
                threading.Thread(
                    target=send_security_alert_email,
                    args=(event_type, actor_email, payload.action, client_ip, user_agent),
                    daemon=True
                ).start()
            except Exception as e:
                logger.warning(f"Security alert dispatch failed: {e}")

        return {"id": row[0] if row else None, "status": "created"}

    @app.delete("/api/audit-logs/prune")
    def prune_audit_logs(days: int = 90, preserve_critical: bool = True, _admin: dict = Depends(require_admin)):
        if days < 1:
            raise HTTPException(status_code=400, detail="Days parameter must be at least 1")
        outcome = prune_audit_logs_internal(days=days, preserve_critical=preserve_critical)
        if outcome["deleted"] > 0:
            broadcast_async({"type": "data_changed", "collection": "audit_logs"})
        return {
            "pruned_count": outcome["deleted"],
            "archived_count": outcome["archived"],
            "status": outcome["status"],
            # Explains exactly why nothing was deleted, instead of silently
            # reporting 0 as if the table were already clean.
            "detail": outcome["detail"],
            "retained_days": days,
            "preserved_critical": preserve_critical,
        }

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
    def list_lms_courses(_auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status, rejection_reason FROM lms_courses ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "track": r[2], "icon": r[3], "level": r[4], "description": r[5], "modules": r[6], "enrolled": r[7], "completion": r[8], "status": r[9], "created_at": r[10], "submitted_by": r[11], "approval_status": r[12], "rejection_reason": r[13]} for r in rows]

    @app.post("/api/lms-courses", status_code=status.HTTP_201_CREATED)
    def create_lms_course(payload: LmsCourseCreate, _actor: dict = Depends(require_role(LMS_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        course_id = "crs-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status, rejection_reason) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (course_id, payload.title, payload.track, payload.icon, payload.level, payload.description, payload.modules, payload.enrolled, payload.completion, payload.status, payload.created_at or None, payload.submitted_by, payload.approval_status, payload.rejection_reason)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_courses"})
        return {"id": course_id, "title": payload.title}

    # PENDING APPROVALS (cross-machine sync)
    class ApprovalCreate(BaseModel):
        id: str
        type: str
        entity: str
        contact: str = ""
        submitted: str = ""
        details: dict = {}
        status: str = "pending"

    class ApprovalUpdate(BaseModel):
        status: str = ""
        reviewed_at: str = ""
        reviewer: str = ""
        rejection_reasons: str = ""
        rejection_notes: str = ""

    @app.get("/api/approvals")
    def list_approvals(status: str = "", _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        if status:
            cur.execute("SELECT id, type, entity, contact, submitted, details, status, reviewed_at, reviewer, rejection_reasons, rejection_notes, created_at FROM pending_approvals WHERE status = %s ORDER BY created_at DESC", (status,))
        else:
            cur.execute("SELECT id, type, entity, contact, submitted, details, status, reviewed_at, reviewer, rejection_reasons, rejection_notes, created_at FROM pending_approvals ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "type": r[1], "entity": r[2], "contact": r[3], "submitted": r[4], "details": r[5] if isinstance(r[5], dict) else _json.loads(r[5] or "{}"), "status": r[6], "reviewedAt": r[7], "reviewer": r[8], "rejectionReasons": r[9], "rejectionNotes": r[10], "created_at": str(r[11])} for r in rows]

    @app.post("/api/approvals", status_code=status.HTTP_201_CREATED)
    def create_approval(payload: ApprovalCreate, _actor: dict = Depends(require_role(APPROVAL_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        import json as _json
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO pending_approvals (id, type, entity, contact, submitted, details, status) VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, entity = EXCLUDED.entity, contact = EXCLUDED.contact, submitted = EXCLUDED.submitted, details = EXCLUDED.details, status = EXCLUDED.status",
                (payload.id, payload.type, payload.entity, payload.contact, payload.submitted, _json.dumps(payload.details), payload.status)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        return {"id": payload.id, "status": "created"}

    @app.patch("/api/approvals/{item_id}")
    def update_approval(item_id: str, payload: ApprovalUpdate, _actor: dict = Depends(require_role(APPROVAL_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE pending_approvals SET status = %s, reviewed_at = %s, reviewer = %s, rejection_reasons = %s, rejection_notes = %s WHERE id = %s RETURNING id",
                (payload.status, payload.reviewed_at, payload.reviewer, payload.rejection_reasons, payload.rejection_notes, item_id)
            )
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        if not row:
            raise HTTPException(status_code=404, detail="Approval not found")
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/approvals/{item_id}")
    def delete_approval(item_id: str, _actor: dict = Depends(require_role(APPROVAL_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM pending_approvals WHERE id = %s", (item_id,))
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        return {"status": "deleted", "id": item_id}

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
                            (item.get("id"), item.get("title"), item.get("track",""), item.get("icon",""), item.get("level",""), item.get("description",""), item.get("modules",0), item.get("enrolled",0), item.get("completion",0), item.get("status","active"), item.get("created_at") or None, item.get("submitted_by",""), item.get("approval_status","approved"), item.get("rejection_reason","")))
        elif payload.collection == "lms_modules":
            for item in payload.items:
                cur.execute("INSERT INTO lms_modules (id, course_id, title, description, order_num, icon, status, submitted_by, approval_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status",
                            (item.get("id"), item.get("courseId"), item.get("title"), item.get("description",""), item.get("order",1), item.get("icon",""), item.get("status","published"), item.get("submitted_by",""), item.get("approval_status","approved")))
        elif payload.collection == "lms_materials":
            for item in payload.items:
                cur.execute("INSERT INTO lms_materials (id, course_id, module_id, title, type, url, description, created_at, submitted_by, approval_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title",
                            (item.get("id"), item.get("courseId"), item.get("moduleId"), item.get("title"), item.get("type",""), item.get("url",""), item.get("description",""), item.get("created_at") or None, item.get("submitted_by",""), item.get("approval_status","approved")))
        elif payload.collection == "lms_assignments":
            for item in payload.items:
                cur.execute("INSERT INTO lms_assignments (id, course_id, title, description, due_date, max_score, track, status, created_at, submitted_by, approval_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status",
                            (item.get("id"), item.get("courseId"), item.get("title"), item.get("description",""), item.get("due_date") or None, item.get("maxScore",100), item.get("track",""), item.get("status","active"), item.get("created_at") or None, item.get("submitted_by",""), item.get("approval_status","approved")))
        elif payload.collection == "lms_submissions":
            for item in payload.items:
                cur.execute("INSERT INTO lms_submissions (id, assignment_id, course_id, student_id, student_name, student_email, submitted_at, content, url, score, status, feedback) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET score = EXCLUDED.score, status = EXCLUDED.status, feedback = EXCLUDED.feedback",
                            (item.get("id"), item.get("assignmentId"), item.get("courseId"), item.get("studentId"), item.get("studentName"), item.get("studentEmail"), item.get("submitted_at") or None, item.get("content",""), item.get("url",""), item.get("score"), item.get("status","submitted"), item.get("feedback","")))
        elif payload.collection == "lms_enrollments":
            for item in payload.items:
                cur.execute("INSERT INTO lms_enrollments (id, course_id, student_id, student_name, student_email, progress_pct, enrolled_at, last_active, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET progress_pct = EXCLUDED.progress_pct, status = EXCLUDED.status",
                            (item.get("id"), item.get("courseId"), item.get("studentId"), item.get("studentName"), item.get("studentEmail"), item.get("progressPct",0), item.get("enrolled_at") or None, item.get("lastActive") or None, item.get("status","active")))
        elif payload.collection == "hof":
            for item in payload.items:
                cur.execute("INSERT INTO hof_entries (id, type, initials, name, team_name, project_title, members, school, year, badge, track_class, expiry_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, badge = EXCLUDED.badge, school = EXCLUDED.school",
                            (item.get("id"), item.get("type","individual"), item.get("initials",""), item.get("name"), item.get("team_name",""), item.get("project_title",""), _json.dumps(item.get("members",[])), item.get("school",""), item.get("year",""), item.get("badge",""), item.get("track_class",""), item.get("expiry_date","")))
        elif payload.collection == "news":
            for item in payload.items:
                cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET headline = EXCLUDED.headline, tag = EXCLUDED.tag",
                            (item.get("id"), item.get("headline"), item.get("tag",""), item.get("date") or None, item.get("link","")))
        elif payload.collection == "audit_logs":
            for item in payload.items:
                cur.execute("INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s)",
                            (item.get("action",""), item.get("user",""), item.get("time",""), item.get("type","")))
        elif payload.collection == "users":
            for item in payload.items:
                cur.execute("INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status, phone = EXCLUDED.phone",
                            (item.get("id"), item.get("email",""), item.get("fullName",""), item.get("role","student"), item.get("ticket",""), "synced_noauth", item.get("status","Active"), item.get("phone","")))
        elif payload.collection == "approvals":
            for item in payload.items:
                cur.execute("INSERT INTO pending_approvals (id, type, entity, contact, submitted, details, status, reviewed_at, reviewer, rejection_reasons, rejection_notes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status",
                            (item.get("id"), item.get("type",""), item.get("entity",""), item.get("contact",""), item.get("submitted",""), _json.dumps(item.get("details",{})), item.get("status","pending"), item.get("reviewed_at"), item.get("reviewer"), item.get("rejection_reasons"), item.get("rejection_notes")))
        elif payload.collection == "submissions":
            for item in payload.items:
                cur.execute("INSERT INTO assignment_submissions (id, tenant_id, student_id, source_code_path, video_url, status, score, feedback) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, score = EXCLUDED.score, feedback = EXCLUDED.feedback",
                            (item.get("id"), item.get("school","default"), item.get("student") or None, item.get("file",""), item.get("videoUrl") or None, item.get("status","pending"), item.get("score"), item.get("feedback") or None))
        else:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=f"Unsupported collection: {payload.collection}")

        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async()
        return {"status": "synced", "collection": payload.collection, "count": len(payload.items)}

    # Mount static files
    frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "NticPlatform.Frontend", "dist", "ntic-frontend", "browser")
    frontend_dist = os.path.abspath(frontend_dist)

    # Files the browser must always revalidate. Angular emits these WITHOUT a
    # content hash, so caching them long-term leaves returning visitors pinned to
    # a stale service worker and an index.html that references bundle names which
    # no longer exist.
    _NEVER_CACHE_FILES = {
        "ngsw-worker.js", "ngsw.json", "safety-worker.js",
        "worker-basic.min.js", "manifest.json", "index.html",
    }

    class SpaStaticFiles(StaticFiles):
        """StaticFiles with correct cache headers for a hashed Angular build."""

        async def get_response(self, path, scope):
            response = await super().get_response(path, scope)
            name = os.path.basename(path)
            if name in _NEVER_CACHE_FILES or name.endswith(".html"):
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
            elif "." in name:
                # Content-hashed build output: safe to cache indefinitely.
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

    if os.path.isdir(frontend_dist):
        app.mount("/", SpaStaticFiles(directory=frontend_dist, html=True), name="static")

        @app.exception_handler(404)
        async def custom_404_handler(request: Request, exc: HTTPException):
            # API and docs paths must return JSON 404s. Falling through to the
            # SPA would make /redoc answer 200 with index.html, which looks like
            # the docs are enabled when they are not.
            path = request.url.path
            if (
                path.startswith("/api/")
                or path.startswith("/docs")
                or path.startswith("/redoc")
                or path.startswith("/openapi.json")
            ):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
            index_path = os.path.join(frontend_dist, "index.html")
            if os.path.exists(index_path):
                # The SPA fallback must not be cached either.
                return FileResponse(
                    index_path,
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
                )
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
    else:
        print(f"[Warning] Frontend dist directory not found at: {frontend_dist}")

except ImportError:
    app = None
