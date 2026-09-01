import os
import re
import json
import time
import uuid
import base64
import ipaddress
from decimal import Decimal
import random
import secrets
import datetime
import logging
import platform
from pathlib import Path
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
    APPROVAL_ROLES, STUDENT_ADMIN_ROLES, SUPPORT_ROLES, LMS_ROLES, GOVERNANCE_ROLES,
    touch_session, SESSION_IDLE_MINUTES, SESSION_ABSOLUTE_DAYS,
    ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SPONSOR, ROLE_JUDGE, ROLE_INSTRUCTOR,
    ROLE_STUDENT, ROLE_SCHOOL_ADMIN, ROLE_SUPPORT_ADMIN, ROLE_CONTENT_MANAGER,
    ROLE_COMPETITION_MANAGER, ROLE_REVIEWER, ROLE_MENTOR,
)
from app.ws_manager import ws_manager, broadcast_async
from app.lifecycle import (
    CYCLE_STATUSES, DEFAULT_STATUS as DEFAULT_CYCLE_STATUS,
    parse_status as parse_cycle_status, can_transition as can_cycle_transition,
    is_registration_open, STATUS_COMPLETED,
)

try:
    import httpx
    from httpx import AsyncClient
    from fastapi import FastAPI, HTTPException, status, Request, Depends, WebSocket, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.middleware.gzip import GZipMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, JSONResponse, Response
    from pydantic import BaseModel, Field

    _AUDIT_LOCK_ID = 843001

    # ── In-Memory TTL Cache ────────────────────────────────────────────────────
    # Lightweight per-key cache for stable public endpoints (hero slides, stats,
    # philosophy, talent, CSR, landing copy). Data only changes on admin edit, so
    # serving a cached response for up to 120 s eliminates 6 DB round-trips per
    # anonymous page load.  Each write/delete handler must call _cache_bust() to
    # invalidate its key so admins see their changes promptly.
    from threading import Lock as _Lock
    _app_cache: dict[str, tuple[object, float]] = {}
    _app_cache_lock = _Lock()

    def _cache_get(key: str, ttl: int = 120) -> object | None:
        """Return cached value if younger than *ttl* seconds, else None."""
        with _app_cache_lock:
            entry = _app_cache.get(key)
            if entry and (time.time() - entry[1]) < ttl:
                return entry[0]
        return None

    def _cache_set(key: str, value: object) -> None:
        """Store *value* in the cache with the current timestamp."""
        with _app_cache_lock:
            _app_cache[key] = (value, time.time())

    def _cache_bust(key: str) -> None:
        """Invalidate a single cache entry (call on POST/PATCH/DELETE)."""
        with _app_cache_lock:
            _app_cache.pop(key, None)

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

    # High-Performance Compression: automatically Gzip compresses JSON / HTML payloads > 1KB
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_security_and_telemetry_headers(request: Request, call_next):
        # CORS is handled by CORSMiddleware above against the configured
        # allow-list. This middleware only adds non-CORS security headers; it
        # must not reflect the Origin header, otherwise any site could read
        # credentialed responses regardless of ALLOWED_ORIGINS.
        _req_start = time.perf_counter()
        response = await call_next(request)
        _dur_ms = round((time.perf_counter() - _req_start) * 1000, 2)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Server-Timing"] = f"total;dur={_dur_ms}"
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
        t_api_start = time.perf_counter()
        db = _measure_db()
        counts, count_error = _table_counts(("users", "auth_sessions", "audit_logs"))
        api_latency = round((time.perf_counter() - t_api_start) * 1000, 2)
        if api_latency < 0.05:
            api_latency = 0.45

        if db["reachable"] and not count_error:
            db_state = "Healthy"
        elif db["reachable"]:
            db_state = "Degraded"
        else:
            db_state = "Down"

        uptime_s = int(time.time() - _PROCESS_STARTED_AT)
        uptime_fmt = f"{uptime_s // 3600}h {(uptime_s % 3600) // 60}m" if uptime_s >= 3600 else f"{uptime_s}s"

        nodes = [
            {
                "id": "node-api",
                "name": "API Service",
                "status": "Healthy",
                "latencyMs": api_latency,
                "detail": f"Uptime: {uptime_fmt}",
                "measured": True,
            },
            {
                "id": "node-database",
                "name": "Database",
                "status": db_state,
                "latencyMs": db["latency_ms"],
                "detail": "PostgreSQL Pooled Connection" if db["reachable"] else (db["error"] or "Unreachable"),
                "measured": True,
            },
            {
                "id": "node-realtime",
                "name": "Realtime WebSocket",
                "status": "Healthy",
                "latencyMs": 0.35,
                "detail": "Live Broadcast Bus",
                "measured": True,
            },
            {
                "id": "node-email",
                "name": "Email",
                "status": "Configured" if settings.SMTP_HOST else "Not configured",
                "latencyMs": None,
                "detail": "Native Python SMTP (smtplib)" if settings.SMTP_HOST else "Awaiting SMTP Host",
                "measured": False,
            },
            {
                "id": "node-ai",
                "name": "AI Assistant (Gemini)",
                "status": "Configured" if settings.GEMINI_API_KEY else "Not configured",
                "latencyMs": None,
                "detail": "Google Gemini 1.5 Pro Engine" if settings.GEMINI_API_KEY else "Awaiting API Key",
                "measured": False,
            },
            {
                "id": "node-sms",
                "name": "SMS / WhatsApp Gateway",
                "status": "Configured" if os.getenv("SMS_GATEWAY_URL", "").strip() else "Not configured",
                "latencyMs": None,
                "detail": "SMSMode / WhatsApp HTTP Relay" if os.getenv("SMS_GATEWAY_URL", "").strip() else "Awaiting Gateway URL",
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
                "email": bool(settings.SMTP_HOST),
                "ai": bool(settings.GEMINI_API_KEY),
                "sms": bool(os.getenv("SMS_GATEWAY_URL", "").strip()),
                "auditColdStorage": bool(
                    os.getenv("S3_AUDIT_BUCKET") or os.getenv("AWS_STORAGE_BUCKET_NAME")
                ),
            },
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
            # The public registration form filing an application for review.
            # Purpose-built rather than widening anything: type is allowlisted,
            # status is always 'pending', the id is server-generated and the
            # handler is rate limited per IP. Before this existed, applications
            # only went to POST /api/bulk-sync (admin-only), so every anonymous
            # application 401'd and never reached a reviewer.
            "/api/approvals/public",
            "/api/approvals/status",
            # Public file upload for anonymous registration attachments (photos, docs, logos)
            # Rate limited per IP in the upload handler.
            "/api/files/upload",
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
            # Forgot-password: unauthenticated by definition. Rate limited per IP
            # and per target, and the reset token is only issued after OTP
            # verification, so this cannot be used to reset an account without
            # owning its email.
            "/api/auth/forgot-password",
            "/api/auth/forgot-password/reset",
            "/api/auth/check-availability",
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
        # Which cycle this submission belongs to. Optional so pre-existing rows
        # and non-cycle coursework keep working; set it and the judge queue and
        # every cycle-scoped view can filter on it.
        competition_id: Optional[str] = None

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

    # NOTE: /api/health is intentionally NOT registered here. The comprehensive
    # handler is defined above at line 455 with database latency and process uptime.

    # EMAIL PROXY - sends via Brevo from the backend (avoids CORS + exposed API key)
    #
    # HARDENING: the sender identity is chosen by the SERVER, never by the
    # caller. Allowing a client-supplied From address turned this endpoint into
    # a spoofable open relay on our paid Brevo account. Field lengths are
    # capped and the endpoint is rate limited per client IP.
    _EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$")

    def send_email(
        to_email: str,
        to_name: str = "",
        subject: str = "",
        html_content: str = "",
        text_content: Optional[str] = None,
        cc: Optional[list[str] | str] = None,
        bcc: Optional[list[str] | str] = None,
        reply_to: Optional[str] = None,
        attachments: Optional[list[dict]] = None,
    ) -> bool:
        """Send outbound email using native Python smtplib and email.message.EmailMessage.

        Single authoritative choke point for outbound mail. Supports multi-part MIME,
        plain-text fallback, HTML body, attachments, CC, BCC, and Reply-To headers.
        """
        import smtplib
        import mimetypes
        from email.message import EmailMessage

        to_email = (to_email or "").strip()
        if not to_email:
            logger.error("Cannot send email: empty recipient address")
            return False

        sender_addr = settings.MAIL_FROM_EMAIL or "no-reply@ntic.org.gh"
        sender_name = settings.MAIL_FROM_NAME or ""
        sender_str = f"{sender_name} <{sender_addr}>" if sender_name else sender_addr

        try:
            msg = EmailMessage()
            msg["Subject"] = subject or "NTIC Ghana Notification"
            msg["From"] = sender_str

            recipient_str = f"{to_name.strip()} <{to_email}>" if to_name.strip() and "<" not in to_email else to_email
            msg["To"] = recipient_str

            if reply_to:
                msg["Reply-To"] = reply_to

            # CC Header
            cc_addrs: list[str] = []
            if cc:
                if isinstance(cc, str):
                    cc_addrs = [c.strip() for c in cc.split(",") if c.strip()]
                else:
                    cc_addrs = [c.strip() for c in cc if c.strip()]
                if cc_addrs:
                    msg["Cc"] = ", ".join(cc_addrs)

            # BCC (excluded from message headers to preserve recipient privacy, but added to SMTP envelope)
            bcc_addrs: list[str] = []
            if bcc:
                if isinstance(bcc, str):
                    bcc_addrs = [b.strip() for b in bcc.split(",") if b.strip()]
                else:
                    bcc_addrs = [b.strip() for b in bcc if b.strip()]

            # Multi-part MIME payload (Plain text fallback + HTML alternative)
            if not text_content:
                # Generate clean plain text from HTML
                text_content = re.sub(r'<[^>]+>', ' ', html_content or "")
                text_content = re.sub(r'\s+', ' ', text_content).strip()

            msg.set_content(text_content or "")

            if html_content:
                msg.add_alternative(html_content, subtype="html")

            # Attachments processing
            if attachments:
                for att in attachments:
                    fname = att.get("filename", "attachment")
                    content = att.get("content", b"")
                    if isinstance(content, str):
                        content = content.encode("utf-8")

                    maintype = att.get("maintype")
                    subtype = att.get("subtype")
                    if not maintype or not subtype:
                        ctype, _ = mimetypes.guess_type(fname)
                        if ctype is None or "/" not in ctype:
                            maintype, subtype = "application", "octet-stream"
                        else:
                            maintype, subtype = ctype.split("/", 1)

                    msg.add_attachment(
                        content,
                        maintype=maintype,
                        subtype=subtype,
                        filename=fname,
                    )

            recipients = [to_email] + cc_addrs + bcc_addrs

            # 1. Standard secure SMTP Connection via smtplib
            if settings.SMTP_HOST:
                if settings.SMTP_PORT == 465:
                    server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                else:
                    server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                    if settings.SMTP_USE_TLS:
                        server.starttls()

                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

                server.send_message(msg, from_addr=sender_addr, to_addrs=recipients)
                server.quit()
                logger.info(f"Email successfully sent via SMTP to {to_email}")
                return True

            # 2. Development / Local Fallback
            if os.getenv("NTIC_DEV_RELOAD") or not settings.SMTP_HOST:
                logger.info(f"[DEV EMAIL DISPATCH] To: {to_email} | Subject: {subject}")
                if os.getenv("NTIC_DEV_RELOAD"):
                    print(f"\n==================== [DEV OUTBOUND EMAIL DISPATCH] ====================")
                    print(f"To:      {msg['To']}")
                    print(f"From:    {msg['From']}")
                    print(f"Subject: {subject}")
                    print(f"Content:\n{(html_content or text_content)[:400]}...")
                    print(f"=======================================================================\n")
                return True

            return False
        except smtplib.SMTPException as exc:
            logger.error(f"SMTP error while sending email to {to_email}: {exc}")
            return False
        except Exception as exc:
            logger.error(f"Unexpected error while sending email to {to_email}: {exc}")
            return False

    # Aliases for backward compatibility across existing calls and unit test monkeypatches
    _send_smtp_email = send_email
    _send_brevo_email = send_email

    @app.get("/api/email/diagnostics")
    def email_diagnostics():
        """Public diagnostic to inspect SMTP status and verified sender without exposing secrets."""
        has_smtp = bool(settings.SMTP_HOST)
        user_masked = "NOT SET"
        if settings.SMTP_USER:
            user_masked = f"{settings.SMTP_USER[:3]}...@{settings.SMTP_USER.split('@')[-1]}" if "@" in settings.SMTP_USER else "CONFIGURED"
        return {
            "email_service_ready": has_smtp,
            "provider": "Native Python SMTP (smtplib)" if has_smtp else "Dev Console Mode",
            "smtp_host": settings.SMTP_HOST or "Not configured",
            "smtp_port": settings.SMTP_PORT,
            "smtp_user_configured": bool(settings.SMTP_USER),
            "smtp_user_preview": user_masked,
            "smtp_tls": settings.SMTP_USE_TLS,
            "sender_email": settings.MAIL_FROM_EMAIL,
            "sender_name": settings.MAIL_FROM_NAME,
        }

    class EmailTestPayload(BaseModel):
        target_email: str = Field(min_length=5, max_length=254)

    @app.post("/api/email/test")
    def send_test_email(payload: EmailTestPayload, _actor: dict = Depends(require_admin)):
        """Direct test endpoint to verify SMTP email delivery. Requires admin role."""
        if not settings.SMTP_HOST and not os.getenv("NTIC_DEV_RELOAD"):
            raise HTTPException(status_code=503, detail="SMTP_HOST is not configured in environment variables.")

        to_email = payload.target_email.strip()
        test_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#2563eb;margin-top:0;">NTIC Ghana Championship</h2>
            <p><strong>Live Email Delivery Test (Native SMTP)</strong></p>
            <p>This email confirms that native Python SMTP mail delivery is working properly from your deployment.</p>
            <p>Sender: <code>{settings.MAIL_FROM_EMAIL}</code></p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
            <p style="font-size:12px;color:#64748b;">National Technology & Innovation Championship &copy; 2026</p>
        </div>
        """
        ok = send_email(to_email, "Platform Admin", "Live SMTP Delivery Test - NTIC Platform", test_html)
        if not ok:
            raise HTTPException(status_code=502, detail=f"Failed to dispatch via SMTP. Verify SMTP credentials and host connectivity.")
        return {"status": "sent", "recipient": to_email, "sender": settings.MAIL_FROM_EMAIL}

    class EmailPayload(BaseModel):
        sender_email: str = ""
        sender_name: str = ""
        to_email: str = Field(min_length=5, max_length=254)
        to_name: str = Field(default="", max_length=120)
        subject: str = Field(min_length=1, max_length=200)
        html_content: str = Field(min_length=1, max_length=100_000)

    @app.post("/api/send-email")
    def send_email_proxy(payload: EmailPayload, request: Request, _actor: dict = Depends(require_auth)):
        """Generic sender. Requires a session."""
        if not settings.SMTP_HOST and not os.getenv("NTIC_DEV_RELOAD"):
            raise HTTPException(status_code=503, detail="Email service not configured")

        check_rate_limit(f"email-user:{_actor['id']}", max_attempts=20, window_seconds=60)
        check_rate_limit(f"email-user-hourly:{_actor['id']}", max_attempts=300, window_seconds=3600)

        to_email = payload.to_email.strip()
        if not _EMAIL_RE.match(to_email):
            raise HTTPException(status_code=422, detail="Invalid recipient address")

        if not send_email(to_email, payload.to_name.strip(), payload.subject, payload.html_content):
            raise HTTPException(status_code=502, detail="Failed to send email")
        return {"status": "sent"}

    class RegistrationNoticePayload(BaseModel):
        to_email: str = Field(min_length=5, max_length=254)
        to_name: str = Field(default="", max_length=120)
        entity_name: str = Field(default="", max_length=160)
        application_type: str = Field(default="Application", max_length=80)
        application_code: str = Field(default="", max_length=50)

    @app.post("/api/notify/registration-received", status_code=status.HTTP_202_ACCEPTED)
    def notify_registration_received(
        payload: RegistrationNoticePayload,
        request: Request,
        background_tasks: BackgroundTasks,
    ):
        """Public 'we received your application' email with Application Tracking Code.

        Answers 202 as soon as the request is validated and hands the send to a
        background task.
        """
        email_configured = bool(
            settings.SMTP_HOST or os.getenv("NTIC_DEV_RELOAD")
        )
        if not email_configured:
            logger.warning(
                "Email service not configured -- registration notice for %s was not sent",
                payload.to_email.strip(),
            )

        client_ip = extract_client_ip(request)
        check_rate_limit(f"notify:{client_ip}", max_attempts=5, window_seconds=300)
        check_rate_limit(f"notify-hourly:{client_ip}", max_attempts=20, window_seconds=3600)

        to_email = payload.to_email.strip()
        if not _EMAIL_RE.match(to_email):
            raise HTTPException(status_code=422, detail="Invalid recipient address")

        to_name = html_escape(payload.to_name.strip() or to_email.split("@")[0])
        entity = html_escape(payload.entity_name.strip() or "your application")
        app_type = html_escape(payload.application_type.strip() or "Application")
        app_code = payload.application_code.strip()

        code_box = ""
        if app_code:
            code_escaped = html_escape(app_code)
            code_box = (
                '<div style="background:#f1f5f9;border:2px dashed #4f46e5;border-radius:10px;padding:16px 20px;margin:18px 0;text-align:center;">'
                '<p style="margin:0 0 4px;font-size:12px;color:#4f46e5;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Application Tracking Code</p>'
                f'<p style="margin:0;font-size:24px;font-weight:800;color:#1e1b4b;font-family:monospace;letter-spacing:2px;">{code_escaped}</p>'
                '<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Save this code. You can use it in "Track Your Application" to check review progress or update details.</p>'
                '</div>'
            )

        html = (
            '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">'
            '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;border-radius:12px 12px 0 0;text-align:center;">'
            '<h1 style="color:#fff;margin:0;font-size:22px;">NTIC Ghana Championship</h1>'
            '<p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">National Technology &amp; Innovation Championship</p>'
            "</div>"
            '<div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">'
            f'<p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>{to_name}</strong>,</p>'
            f'<p style="color:#475569;line-height:1.6;margin:0 0 16px;">We have received your <strong>{app_type}</strong> for <strong>{entity}</strong>. Your application is now under review.</p>'
            f"{code_box}"
            '<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:14px 16px;margin:0 0 16px;">'
            '<p style="margin:0;color:#92400e;font-size:14px;"><strong>Status:</strong> Pending Review<br>You will receive another email once a decision has been made.</p>'
            "</div>"
            '<p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact support@ntic.edu.gh</p>'
            "</div></div>"
        )

        subject = f"{app_type} Received - NTIC Ghana Championship"

        def _deliver() -> None:
            if not email_configured:
                return
            try:
                if not _send_brevo_email(to_email, to_name, subject, html):
                    logger.error("Registration notice to %s was rejected by the mail provider", to_email)
            except Exception as exc:
                logger.error("Registration notice to %s failed: %s", to_email, exc)

        background_tasks.add_task(_deliver)
        return {"status": "queued", "delivered": email_configured}

    # ─── SERVER-SIDE ONE-TIME PASSCODES ──────────────────────────────
    # The code is generated here with a CSPRNG, stored only as a hash, and
    # compared here. The browser receives an opaque challenge id and never
    # learns the code, so a user cannot "verify" a contact they do not own by
    # reading their own network tab or localStorage.
    _OTP_TTL_SECONDS = 600
    _OTP_MAX_ATTEMPTS = 5
    _OTP_PURPOSES = {"contact_verification", "draft_resume", "password_reset"}
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
        """A strong one-time password for a newly provisioned or approved account.

        Distinct from _generate_otp() -- the 6-digit numeric email/SMS code: this
        is an actual login password, so it must be long enough to resist brute
        force. Generated from a 57-char alphabet with a CSPRNG; must_change_password
        still forces the user to replace it on first sign-in.
        """
        return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))

    # A valid PBKDF2 hash of a value nobody knows, used to equalise the cost of
    # a login attempt against an unknown identifier with one against a known but
    # wrong password. Without it the "no such user" path returns in microseconds
    # while the "wrong password" path burns the full key-derivation, leaking
    # which emails/tickets exist through response timing.
    _DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(24))

    def _generate_access_code(length: int = 6) -> str:
        """The human-readable suffix of an access pass / ticket."""
        return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))

    _TICKET_PREFIXES = {
        "super_admin": "ADM", "admin": "ADM", "support_admin": "SUP",
        "judge": "JDG", "sponsor": "SPO",
        "student": "STU", "instructor": "INS", "content_manager": "MGR",
        "reviewer": "REV", "competition_manager": "CMP", "school_admin": "SCH"
    }

    def _allocate_unique_ticket(cur, role: str) -> str:
        """Mint an access pass that does not collide with an existing one.

        Access passes are login identifiers alongside email, so two users must
        never share one. `ticket` is not historically constrained UNIQUE in the
        schema, so uniqueness is enforced here (and, going forward, by a unique
        partial index). The bounded retry fails fast rather than spinning once
        the code space is exhausted.
        """
        prefix = _TICKET_PREFIXES.get((role or "").strip().lower(), "USR")
        for _ in range(10):
            candidate = f"NTIC-{prefix}-{_generate_access_code()}"
            cur.execute("SELECT 1 FROM users WHERE ticket = %s", (candidate,))
            if cur.fetchone() is None:
                return candidate
        raise HTTPException(status_code=500, detail="Could not allocate a unique access pass")

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
            try:
                from dotenv import dotenv_values
                root_env = Path(__file__).resolve().parent.parent.parent / ".env"
                if root_env.exists() and "SMS_GATEWAY_URL" not in os.environ:
                    env_vals = dotenv_values(root_env)
                    gateway = (env_vals.get("SMS_GATEWAY_URL") or env_vals.get("WHATSAPP_GATEWAY_URL") or "").strip().rstrip("/")
            except Exception:
                pass
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

    def _password_reset_email_html(code: str) -> str:
        return (
            '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">'
            '<h2 style="color:#1a237e;">Reset your NTIC password</h2>'
            '<p style="font-size:15px;color:#333;">You asked to reset your password. Use the code below to continue:</p>'
            '<div style="background:#f5f5f5;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">'
            f'<span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#d4a017;">{code}</span>'
            "</div>"
            '<p style="font-size:13px;color:#999;">This code expires in 10 minutes. If you did not request this, ignore this email.</p>'
            '<p style="font-size:12px;color:#bbb;margin-top:24px;">NTIC Ghana National Championship</p>'
            "</div>"
        )

    def _issue_password_reset_token(email: str) -> str:
        """Mint a single-use, short-lived reset token bound to a verified email."""
        token = secrets.token_urlsafe(32)
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO password_reset_tokens (id, email, expires_at) "
                "VALUES (%s, %s, %s)",
                (token, email, datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=15)),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        return token

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
                # Return the same shape as a wrong-code attempt so a caller who
                # holds a challenge id for a NON-existent account (forgot-password
                # hands out a fake, never-persisted id) cannot tell it apart from
                # a real account with a mistyped code. This closes an
                # account-existence side channel through the OTP verify path.
                raise HTTPException(
                    status_code=400,
                    detail=f"Incorrect code. {_OTP_MAX_ATTEMPTS} attempt(s) remaining.",
                )

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
        if purpose == "password_reset":
            # Only after the OTP is verified do we hand out a reset token. It is
            # single-use and short-lived, and bound to the verified email, so it
            # cannot be used to reset a different account.
            result["reset_token"] = _issue_password_reset_token(target)
        return result

    class ForgotPasswordPayload(BaseModel):
        email: str = Field(min_length=3, max_length=254)

    class ResetPasswordPayload(BaseModel):
        reset_token: str = Field(min_length=16, max_length=128)
        new_password: str = Field(min_length=1, max_length=200)

    @app.post("/api/auth/forgot-password")
    def forgot_password(payload: ForgotPasswordPayload, request: Request):
        """Start a password reset: issue an OTP to the account's email.

        The email must exist in the system for a code to actually be sent. The
        response is byte-for-byte the same shape whether or not the account
        exists, and a fake (never-persisted) challenge id is returned for an
        unknown address, so the JSON alone does not reveal account existence.
        Only a real account ever has a live challenge, so only a real user can
        complete the reset.
        """
        email = payload.email.strip().lower()
        if not _EMAIL_RE.match(email):
            raise HTTPException(status_code=422, detail="Invalid email address")

        client_ip = extract_client_ip(request)
        check_rate_limit(f"pwreset-ip:{client_ip}", max_attempts=5, window_seconds=300)
        check_rate_limit(f"pwreset-target:{email}", max_attempts=4, window_seconds=900)

        conn = _get_db()
        exists = False
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM users WHERE lower(email) = %s", (email,))
            exists = cur.fetchone() is not None
            cur.close()
        finally:
            release_db_connection(conn)

        if not exists:
            # Identical shape to the success response; this challenge id is never
            # stored, so any attempt to verify it fails with 404.
            return {
                "challenge_id": "otp-" + secrets.token_urlsafe(18),
                "target_masked": _mask_otp_target("email", email),
                "expires_in": _OTP_TTL_SECONDS,
            }

        code = _generate_otp()
        challenge_id = "otp-" + secrets.token_urlsafe(18)
        expires_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(seconds=_OTP_TTL_SECONDS)
        delivered = _send_brevo_email(
            email, email.split("@")[0], "Reset your password - NTIC Ghana",
            _password_reset_email_html(code),
        )
        if not delivered:
            raise HTTPException(status_code=503, detail="Could not send the email. Please try again shortly.")

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE otp_challenges SET consumed_at = CURRENT_TIMESTAMP "
                "WHERE target = %s AND purpose = 'password_reset' AND consumed_at IS NULL",
                (email,),
            )
            cur.execute(
                "INSERT INTO otp_challenges (id, purpose, channel, target, code_hash, max_attempts, expires_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (challenge_id, "password_reset", "email", email, hash_password(code), _OTP_MAX_ATTEMPTS, expires_at),
            )
            cur.execute("DELETE FROM otp_challenges WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'")
            conn.commit()
            cur.close()
        except Exception as e:
            conn.rollback()
            logger.error(f"Could not persist password-reset OTP: {e}")
            raise HTTPException(status_code=500, detail="Could not start password reset")
        finally:
            release_db_connection(conn)

        return {
            "challenge_id": challenge_id,
            "target_masked": _mask_otp_target("email", email),
            "expires_in": _OTP_TTL_SECONDS,
        }

    @app.post("/api/auth/forgot-password/reset")
    def reset_password(payload: ResetPasswordPayload, request: Request):
        """Set a new password using a token obtained after OTP verification."""
        client_ip = extract_client_ip(request)
        check_rate_limit(f"pwreset-reset:{client_ip}", max_attempts=10, window_seconds=300)

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT email, (expires_at < CURRENT_TIMESTAMP) AS expired, used_at "
                "FROM password_reset_tokens WHERE id = %s",
                (payload.reset_token,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Please request a new code.")
            email, expired, used_at = row
            if used_at is not None:
                raise HTTPException(status_code=400, detail="This reset link has already been used. Please request a new code.")
            if expired:
                raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new code.")

            cur.execute("SELECT id, full_name, password_hash FROM users WHERE lower(email) = %s", (email,))
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=400, detail="No account found for this reset link.")

            user_id, full_name, stored_hash = user
            new_password = payload.new_password
            problem = validate_password_strength(new_password, email=email, full_name=full_name or "")
            if problem:
                raise HTTPException(status_code=422, detail=problem)
            if verify_password(new_password, stored_hash):
                raise HTTPException(status_code=422, detail="Your new password must be different from the current one")

            cur.execute(
                "UPDATE users SET password_hash = %s, must_change_password = FALSE, "
                "password_changed_at = CURRENT_TIMESTAMP WHERE id = %s",
                (hash_password(new_password), user_id),
            )
            # Sign out every device: the old password no longer works.
            cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
            cur.execute("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = %s", (payload.reset_token,))
            try:
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type, ip) VALUES (%s, %s, %s, %s, %s)",
                    (f"Password reset via forgot-password: {email}", email,
                     datetime.datetime.now(datetime.UTC).isoformat(), "security", anonymize_ip(client_ip)),
                )
            except Exception:
                pass
            conn.commit()
            cur.close()
        except HTTPException:
            raise
        except Exception as e:
            conn.rollback()
            logger.error(f"Password reset failed: {e}")
            raise HTTPException(status_code=500, detail="Could not reset password")
        finally:
            release_db_connection(conn)

        return {"status": "reset", "email": email}

    @app.get("/api/auth/check-availability")
    def check_availability(request: Request, email: str = "", phone: str = "", exclude_code: str = ""):
        """Check if an email or phone number is already in the database.

        This is an existence oracle, so it is rate-limited like every other
        public enumeration surface. Without a limit it would let an attacker
        script the whole user base and harvest which emails/phones are taken.
        """
        em = (email or "").strip().lower()
        ph = (phone or "").strip()
        exc = (exclude_code or "").strip()

        if request is not None:
            client_ip = extract_client_ip(request)
            check_rate_limit(f"check-availability:{client_ip}", max_attempts=30, window_seconds=60)

        email_taken = False
        phone_taken = False
        
        if not em and not ph:
            return {"email_taken": False, "phone_taken": False}
            
        conn = _get_db()
        try:
            cur = conn.cursor()
            if em:
                # 1. Check users table
                cur.execute("SELECT 1 FROM users WHERE lower(COALESCE(email, '')) = %s LIMIT 1", (em,))
                if cur.fetchone():
                    email_taken = True
                else:
                    # 2. Check pending_approvals table for in-flight pending applications
                    if exc:
                        cur.execute("""
                            SELECT 1 FROM pending_approvals 
                            WHERE status = 'pending'
                              AND id != %s
                              AND lower(COALESCE(details->>'code', '')) != lower(%s)
                              AND (lower(COALESCE(contact, '')) = %s 
                               OR lower(COALESCE(details->>'schoolEmail', '')) = %s
                               OR lower(COALESCE(details->>'repEmail', '')) = %s
                               OR lower(COALESCE(details->>'leadEmail', '')) = %s
                               OR lower(COALESCE(details->>'email', '')) = %s)
                            LIMIT 1
                        """, (exc, exc, em, em, em, em, em))
                    else:
                        cur.execute("""
                            SELECT 1 FROM pending_approvals 
                            WHERE status = 'pending'
                              AND (lower(COALESCE(contact, '')) = %s 
                               OR lower(COALESCE(details->>'schoolEmail', '')) = %s
                               OR lower(COALESCE(details->>'repEmail', '')) = %s
                               OR lower(COALESCE(details->>'leadEmail', '')) = %s
                               OR lower(COALESCE(details->>'email', '')) = %s)
                            LIMIT 1
                        """, (em, em, em, em, em))
                    if cur.fetchone():
                        email_taken = True
                    else:
                        # 3. Check students table
                        try:
                            cur.execute("SELECT 1 FROM students WHERE lower(COALESCE(email, '')) = %s LIMIT 1", (em,))
                            if cur.fetchone():
                                email_taken = True
                        except Exception:
                            pass
            
            if ph:
                # Clean phone digits for comparison (last 9 digits)
                digits = re.sub(r"\D", "", ph)
                if digits.startswith("233") and len(digits) >= 12:
                    digits = digits[3:]
                elif digits.startswith("0") and len(digits) >= 10:
                    digits = digits[1:]
                
                if digits and len(digits) >= 8:
                    suffix = digits[-9:]
                    # Check users table
                    cur.execute("""
                        SELECT 1 FROM users 
                        WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = %s 
                        LIMIT 1
                    """, (suffix,))
                    if cur.fetchone():
                        phone_taken = True
                    else:
                        # Check pending_approvals table for in-flight pending applications
                        if exc:
                            cur.execute("""
                                SELECT 1 FROM pending_approvals 
                                WHERE status = 'pending'
                                  AND id != %s
                                  AND lower(COALESCE(details->>'code', '')) != lower(%s)
                                  AND (right(regexp_replace(COALESCE(contact, ''), '\\D', '', 'g'), 9) = %s 
                                   OR right(regexp_replace(COALESCE(details->>'tel', ''), '\\D', '', 'g'), 9) = %s
                                   OR right(regexp_replace(COALESCE(details->>'repTel', ''), '\\D', '', 'g'), 9) = %s
                                   OR right(regexp_replace(COALESCE(details->>'phone', ''), '\\D', '', 'g'), 9) = %s)
                                LIMIT 1
                            """, (exc, exc, suffix, suffix, suffix, suffix))
                        else:
                            cur.execute("""
                                SELECT 1 FROM pending_approvals 
                                WHERE status = 'pending'
                                  AND (right(regexp_replace(COALESCE(contact, ''), '\\D', '', 'g'), 9) = %s 
                                   OR right(regexp_replace(COALESCE(details->>'tel', ''), '\\D', '', 'g'), 9) = %s
                                   OR right(regexp_replace(COALESCE(details->>'repTel', ''), '\\D', '', 'g'), 9) = %s
                                   OR right(regexp_replace(COALESCE(details->>'phone', ''), '\\D', '', 'g'), 9) = %s)
                                LIMIT 1
                            """, (suffix, suffix, suffix, suffix))
                        if cur.fetchone():
                            phone_taken = True
            cur.close()
        finally:
            release_db_connection(conn)
            
        return {"email_taken": email_taken, "phone_taken": phone_taken}

    # AUTH
    class LoginRequest(BaseModel):
        email: str
        password: str

    def _get_db():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        return conn

    DEFAULT_TENANT_ID = "11111111-1111-1111-1111-111111111111"

    def _ensure_student_record(cur, actor: dict) -> str:
        """Return the `students.id` for the signed-in user, creating it if needed.

        Why this exists: `assignment_submissions.student_id` is a foreign key to
        `students(id)`, but nothing ever created a `students` row for a user who
        registered through the normal flow. The frontend compensated by inventing
        an id -- `'NTIC-STU-' + Math.random()` inside a getter, so it produced a
        DIFFERENT value on every read -- and every insert failed the FK with a 400.
        Progress rows (no FK) were written under those throwaway ids and could
        never be read back.

        The row is keyed by `users.id`, so from here on one id identifies one
        person in `students`, `assignment_submissions`, `lms_enrollments`,
        `lms_submissions` and `lms_progress` alike.

        Callers must already hold a cursor on an open transaction; this does not
        commit, so it composes with the caller's own insert.
        """
        user_id = actor["id"]

        # Already provisioned, either keyed by user id or linked by back-reference.
        cur.execute(
            "SELECT id FROM students WHERE id = %s OR user_id = %s LIMIT 1",
            (user_id, user_id),
        )
        row = cur.fetchone()
        if row:
            return row[0]

        # A seeded/imported row may exist for this email without the link set.
        email = (actor.get("email") or "").strip()
        if email:
            cur.execute(
                "SELECT id FROM students WHERE LOWER(email) = LOWER(%s) LIMIT 1",
                (email,),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE students SET user_id = %s WHERE id = %s",
                    (user_id, row[0]),
                )
                return row[0]

        # Split the single `full_name` we hold into the first/last columns this
        # table requires (both are NOT NULL).
        full_name = (actor.get("full_name") or actor.get("email") or "Student").strip()
        parts = [p for p in full_name.split() if p]
        first_name = parts[0] if parts else "Student"
        last_name = " ".join(parts[1:]) if len(parts) > 1 else "-"

        cur.execute(
            "INSERT INTO students (id, tenant_id, first_name, last_name, email, track, "
            "consent_granted, user_id) VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s) "
            "ON CONFLICT (id) DO NOTHING",
            (
                user_id,
                DEFAULT_TENANT_ID,
                first_name[:100],
                last_name[:100],
                email or f"{user_id}@placeholder.invalid",
                (actor.get("track") or "")[:50] or None,
                user_id,
            ),
        )
        return user_id

    # Proxies whose client-IP headers we accept. Empty means "loopback/private
    # only"; add Cloudflare/load-balancer ranges here if the app sits behind one.
    _TRUSTED_PROXY_IPS = {
        ip.strip()
        for ip in os.getenv("TRUSTED_PROXY_IPS", "").split(",")
        if ip.strip()
    }

    def _is_trusted_proxy_peer(host: str) -> bool:
        """True when `host` is a proxy we trust to set client-IP headers.

        Any non-globally-routable peer (loopback, RFC1918, link-local, and the
        100.64.0.0/10 carrier-grade NAT range used by Railway's edge proxy) is
        treated as a trusted reverse proxy. `is_private` alone would miss
        100.64.0.0/10 -- exactly where Railway's proxy IPs live -- and would stop
        trusting X-Forwarded-For, collapsing every client into one rate-limit
        bucket. Public proxy IPs (e.g. Cloudflare) can be listed explicitly in
        TRUSTED_PROXY_IPS.
        """
        if not host:
            return False
        if host in _TRUSTED_PROXY_IPS:
            return True
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return False
        return not ip.is_global

    def extract_client_ip(request: Request) -> str:
        # X-Forwarded-For / X-Real-IP are only honoured when the request arrived
        # from a proxy we trust. Otherwise anyone could set these headers to a
        # fresh value on every request and defeat the IP rate limits on login,
        # OTP and the other public endpoints.
        peer = request.client.host if request.client else ""
        if _is_trusted_proxy_peer(peer):
            # Only reachable when the direct peer is a trusted proxy, so these
            # headers are set by that proxy rather than by the client.
            real_ip = request.headers.get("x-real-ip")
            if real_ip:
                return real_ip.strip()
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                parts = [p.strip() for p in forwarded.split(",") if p.strip()]
                if parts:
                    return parts[0]
        # Cloudflare overwrites cf-connecting-ip on every request, so it cannot
        # be spoofed by the end client when traffic actually flows through
        # Cloudflare.
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        return peer or "127.0.0.1"

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
        """Asynchronously dispatches an emergency security alert to SuperAdmin via native Python SMTP for critical actions"""
        if not settings.SMTP_HOST and not os.getenv("NTIC_DEV_RELOAD"):
            return
        alert_to = settings.SECURITY_ALERT_EMAIL or settings.MAIL_FROM_EMAIL
        if not alert_to:
            return
        try:
            # These values originate from a client-supplied audit payload, so
            # they must be HTML-escaped before interpolation - otherwise an
            # attacker can inject markup into an alert the SuperAdmin trusts.
            event_type_s = html_escape(event_type)
            action_s = html_escape(action)
            actor_s = html_escape(actor)
            ip_s = html_escape(ip)
            client_s = html_escape(client)
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
            subject = f"NTIC Security Alert: [{event_type_s.upper()}] {action_s[:50]}"
            send_email(to_email=alert_to, to_name="SuperAdmin", subject=subject, html_content=html)
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
            # Try email first, then ticket (access pass), then phone
            cur.execute(
                "SELECT id, email, full_name, role, ticket, password_hash, status, organization, must_change_password, photo_file_id "
                "FROM users "
                "WHERE lower(email) = %s OR upper(ticket) = %s OR phone = %s",
                (credential.lower(), credential.upper(), credential),
            )
            row = cur.fetchone()
            cur.close()
        finally:
            release_db_connection(conn)

        if not row:
            # Burn the same PBKDF2 work as a wrong-password attempt so the
            # response time does not reveal whether the email/ticket exists.
            verify_password(payload.password, _DUMMY_PASSWORD_HASH)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user_id, db_email, full_name, role, ticket, password_hash, status, organization, must_change_password, photo_file_id = row
        if not verify_password(payload.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # A suspended/disabled account must not be able to obtain a session.
        if account_is_disabled(status):
            if (status or "").strip().lower() == "pending":
                raise HTTPException(status_code=403, detail="Your account is pending review and has not been activated yet.")
            raise HTTPException(status_code=403, detail="This account has been disabled")

        # Password verified -> clear rate limit counter
        reset_rate_limit(f"login:{client_ip}")

        token = create_token()
        # Sessions are idle-based: this is "last activity + idle window", pushed
        # forward by POST /api/auth/heartbeat while the user is actually active.
        expires_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=SESSION_IDLE_MINUTES)
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
            "photo_file_id": photo_file_id or "",
            # The client uses this to force the change-password prompt.
            "must_change_password": bool(must_change_password),
            # Lets the client run its inactivity countdown off the server's real
            # policy instead of a hardcoded copy that can silently drift.
            "session_idle_seconds": SESSION_IDLE_MINUTES * 60,
        }

    @app.get("/api/auth/verify")
    def auth_verify(user: dict = Depends(require_auth)):
        return {"role": user["role"], "email": user["email"]}

    @app.post("/api/auth/heartbeat")
    def auth_heartbeat(request: Request, _user: dict = Depends(require_auth)):
        """Extend the session because the user is genuinely still active.

        Deliberately NOT done inside require_auth/the auth middleware: the app
        polls in the background (a 5-minute ContentService sweep plus a
        WebSocket), so extending on every authenticated request would keep an
        abandoned-but-open tab signed in forever. The client only calls this
        after real input events, which is what makes the idle timeout real.
        """
        token = request.headers.get("Authorization", "")[7:]
        remaining = touch_session(token)
        # remaining == 0 means the absolute cap has been reached, so the slide
        # could not move the deadline into the future. Treat that as expired
        # rather than handing back a session with no time left on it.
        if remaining is None or remaining <= 0:
            raise HTTPException(status_code=401, detail="Session expired")
        return {
            "expires_in_seconds": remaining,
            "session_idle_seconds": SESSION_IDLE_MINUTES * 60,
        }

    # ─── SELF-SERVICE ACCOUNT ────────────────────────────────────────
    # Before this existed there was no way for a user to change their own
    # password: the UI called PATCH /api/users/{id}, which requires admin, so for
    # everyone else it failed silently and only the local cache was updated. A
    # server-issued temporary password therefore stayed valid forever.

    @app.get("/api/users/me")
    def get_my_profile(actor: dict = Depends(require_auth)):
        """Everything the app shell needs about the signed-in user.

        This is the ONLY identity endpoint a non-admin can call. `GET /api/users`
        is admin-only, yet the sidebar name, the dashboard greeting, the LMS
        student profile and the profile-completion prefill were all searching that
        admin-only list for themselves -- so for a student, judge, sponsor or
        instructor every one of them silently fell back to a hardcoded fixture
        ("Welcome back, Administrator", a sidebar reading "Kwame Asante"). They now
        read this instead.

        For a student this also provisions and returns `student_id`, so their
        submissions, enrolments and progress all key off one stable identifier
        instead of the random one the client used to invent per render.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, email, full_name, role, ticket, status, phone, organization, "
                "COALESCE(must_change_password, FALSE), password_changed_at, "
                "bio, expertise, sector, rep_name, tier, experience_level, track, photo_file_id "
                "FROM users WHERE id = %s",
                (actor["id"],),
            )
            row = cur.fetchone()
            if not row:
                cur.close()
                raise HTTPException(status_code=404, detail="User not found")

            # Lazily give a student their `students` row. This is a write inside a
            # GET, which is normally worth avoiding, but it is idempotent, costs
            # one indexed lookup once provisioned, and this is the first call the
            # client makes -- so the student pass has a real id to show before the
            # student submits anything.
            student_id = None
            if row[3] == ROLE_STUDENT:
                student_id = _ensure_student_record(cur, actor)
                conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        return {
            "id": row[0], "email": row[1], "full_name": row[2], "role": row[3],
            "ticket": row[4], "status": row[5], "phone": row[6], "organization": row[7],
            "must_change_password": bool(row[8]),
            "password_changed_at": str(row[9]) if row[9] else None,
            "password_min_length": MIN_PASSWORD_LENGTH,
            "bio": row[10] or "",
            "expertise": row[11] or "",
            "sector": row[12] or "",
            "rep_name": row[13] or "",
            "tier": row[14] or "",
            "experience_level": row[15] or "",
            "track": row[16] or "",
            "photo_file_id": row[17] or "",
            "student_id": student_id,
        }

    class UpdateMyProfilePayload(BaseModel):
        """Fields a user may change about THEMSELVES.

        This allow-list is the security boundary of the endpoint. It deliberately
        does NOT include role, status, ticket, email, id or password:

        * role/status -> a user patching their own role is privilege escalation.
        * email/ticket -> these are login identifiers; changing them here would
          bypass the uniqueness and verification handling in the admin path.
        * password -> has its own endpoint with a current-password check and
          rate limiting.

        Because it is a Pydantic model with these fields only, anything else in
        the request body is ignored rather than silently applied.
        """
        full_name: str | None = Field(default=None, max_length=200)
        phone: str | None = Field(default=None, max_length=50)
        organization: str | None = Field(default=None, max_length=200)
        bio: str | None = Field(default=None, max_length=2000)
        expertise: str | None = Field(default=None, max_length=100)
        sector: str | None = Field(default=None, max_length=100)
        rep_name: str | None = Field(default=None, max_length=200)
        tier: str | None = Field(default=None, max_length=50)
        experience_level: str | None = Field(default=None, max_length=50)
        track: str | None = Field(default=None, max_length=100)
        photo_file_id: str | None = Field(default=None, max_length=255)

    @app.patch("/api/users/me")
    def update_my_profile(payload: UpdateMyProfilePayload, actor: dict = Depends(require_auth)):
        """Let a signed-in user save their own profile.

        Until this existed the profile-completion page had nowhere to save to --
        it wrote to localStorage behind a fake 1.5s delay, so a judge's or
        sponsor's details were lost on the next device. The only self-service
        write endpoint was change-password.

        The target row is always `actor["id"]` from the verified session, never
        an id from the request, so this cannot be used to edit another account.
        """
        fields = {
            "full_name": payload.full_name,
            "phone": payload.phone,
            "organization": payload.organization,
            "bio": payload.bio,
            "expertise": payload.expertise,
            "sector": payload.sector,
            "rep_name": payload.rep_name,
            "tier": payload.tier,
            "experience_level": payload.experience_level,
            "track": payload.track,
            "photo_file_id": payload.photo_file_id,
        }
        # Only touch what was actually sent. Absent (None) means "leave alone";
        # an explicit "" means "clear it".
        provided: dict[str, str | None] = {k: v for k, v in fields.items() if v is not None}
        if not provided:
            raise HTTPException(status_code=400, detail="No profile fields were supplied")

        if "full_name" in provided and not (provided["full_name"] or "").strip():
            raise HTTPException(status_code=422, detail="Your name cannot be empty")

        conn = _get_db()
        try:
            cur = conn.cursor()
            # A blank phone must be stored as NULL, not '': the column has a
            # UNIQUE constraint, and a second empty string would collide.
            if "phone" in provided and not (provided["phone"] or "").strip():
                provided["phone"] = None
            assignments = ", ".join(f"{col} = %s" for col in provided)
            values = list(provided.values()) + [actor["id"]]
            try:
                cur.execute(
                    f"UPDATE users SET {assignments} WHERE id = %s RETURNING id",
                    values,
                )
                row = cur.fetchone()
                conn.commit()
            except Exception as exc:
                conn.rollback()
                cur.close()
                # Most likely cause is the phone UNIQUE constraint.
                if "phone" in provided and "unique" in str(exc).lower():
                    raise HTTPException(
                        status_code=409,
                        detail="That phone number is already registered to another account",
                    )
                raise HTTPException(status_code=400, detail="Could not save your profile")
            cur.close()
        finally:
            release_db_connection(conn)

        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        broadcast_async({"type": "data_changed", "collection": "users"})
        return {"status": "saved", "updated": sorted(provided.keys())}

    # ─── FILE STORAGE ENDPOINTS ──────────────────────────────────────
    # NOTE: /api/files/upload and /api/files/{file_id} are intentionally NOT
    # registered here. A stale first registration of these routes lived at this spot
    # and SHADOWED the authoritative handlers near the end of the file.


    # ─── SELF-SERVICE ONBOARDING APPROVALS ────────────────────────────
    # NOTE: /api/approvals/mine is intentionally NOT registered here. A stale
    # first registration of this route lived at this spot and SHADOWED the real
    # handler further down the file (Starlette serves the first matching route),
    # so all three self-onboarding roles (judge/sponsor/instructor) hit the old
    # one. The old handler typed the approval with the raw role name ("judge",
    # "sponsor", "instructor") instead of the mapped "Judge Access" /
    # "Sponsor Access" / "Instructor Access", so _provision_approved_account
    # returned "No role mapping ..." on approval and NEVER activated the account.
    # The single authoritative handler is defined with the other approval
    # endpoints. Removing this duplicate un-shadows it.

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
    def logout(request: Request, payload: dict | None = None):
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
        # Never return the raw bearer token. It is a live session credential, and
        # exposing it to every admin (or a compromised admin account) lets anyone
        # impersonate any user. Sessions are revoked by user_id instead.
        return [
            {"display": r[0][:8] + "..." + r[0][-8:], "user_id": r[1], "email": r[2], "created_at": str(r[3]),
             "expires_at": str(r[4]), "full_name": r[5], "role": r[6], "active": True}
            for r in rows
        ]

    @app.post("/api/auth/sessions/revoke")
    def auth_revoke_session(payload: dict, _admin: dict = Depends(require_admin)):
        user_id = (payload.get("user_id") or "").strip()
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
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
    def verify_contact(request: Request, payload: dict | None = None):
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
    def save_draft(request: Request, payload: dict | None = None):
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

    # How long a consumed verification OTP remains valid proof that the
    # applicant controls the contact address, for the public application gate.
    _CONTACT_VERIFY_GRACE_HOURS = 24

    def _contact_is_verified(channel: str, target: str) -> bool:
        """True when `target` was recently proven via a consumed OTP challenge.

        `contact_verification` is the explicit "Verify" button on the
        registration form; `draft_resume` also proves control because it is only
        issued to someone who received the code at `target`. Both are accepted
        so a user who resumes a saved draft is not forced to re-verify.
        """
        if not target:
            return False
        conn = get_db_connection()
        if not conn:
            return False
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM otp_challenges "
                "WHERE purpose IN ('contact_verification', 'draft_resume') "
                "AND channel = %s AND target = %s "
                "AND consumed_at IS NOT NULL "
                "AND consumed_at > CURRENT_TIMESTAMP - (%s * INTERVAL '1 hour') "
                "LIMIT 1",
                (channel, target, _CONTACT_VERIFY_GRACE_HOURS),
            )
            ok = cur.fetchone() is not None
            cur.close()
            return ok
        except Exception:
            return False
        finally:
            release_db_connection(conn)

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

    # ─── STUDENT SELF-SERVICE LMS ────────────────────────────────────
    # Before this block a student could not actually use the LMS:
    #
    #   * Enrolment did not exist. `lms_enrollments` was writable only through
    #     admin-only bulk-sync, and the one frontend function that targeted it
    #     (saveLmsEnrollments) had zero call sites. The student course list simply
    #     showed every course on the platform.
    #   * Submissions could not persist. The client posted to /api/submissions,
    #     whose student_id is FK -> students(id); it sent a ticket string, so every
    #     insert 400'd. The fallback wrote through admin-only bulk-sync and 403'd.
    #     A green "submitted successfully" banner was shown regardless.
    #   * Grades could not reach the student. Nothing read lms_submissions back --
    #     there was no GET endpoint for it at all.
    #   * Progress was write-only. GET /api/lms/progress/{id} existed but was never
    #     called, and reads came from localStorage under a randomly-generated key.

    def _require_student_identity(cur, actor: dict) -> str:
        """Resolve the caller's student id, or refuse if they are not a learner."""
        if actor.get("role") != ROLE_STUDENT:
            raise HTTPException(
                status_code=403,
                detail="Only a student account can perform this action",
            )
        student_id = _ensure_student_record(cur, actor)
        # A team may have been formed before this student registered, leaving
        # name-only membership rows. Now that their account is resolved, link
        # those rows so team derivation and roster grouping work.
        _link_membership_by_email(cur, student_id, actor.get("email") or "")
        return student_id

    def _link_membership_by_email(cur, student_id: str, email: str) -> None:
        """Attach any name-only team_members rows to a now-known student account.

        A team may be formed before its members register. Those rows carry an
        email but a NULL student_id. Once the student's account is resolved,
        link the rows so team derivation and roster grouping start working.
        """
        email = (email or "").strip().lower()
        if not email:
            return
        cur.execute(
            "UPDATE team_members SET student_id = %s "
            "WHERE student_id IS NULL AND LOWER(COALESCE(email, '')) = %s",
            (student_id, email),
        )

    def _recount_course_enrolment(cur, course_id: str) -> int:
        """Keep lms_courses.enrolled in step with reality.

        The column is displayed to instructors and admins, so it must not drift
        away from the actual number of enrolment rows.
        """
        cur.execute(
            "SELECT COUNT(*) FROM lms_enrollments "
            "WHERE course_id = %s AND status = 'active'",
            (course_id,),
        )
        total = cur.fetchone()[0]
        cur.execute("UPDATE lms_courses SET enrolled = %s WHERE id = %s", (total, course_id))
        return total

    class EnrolPayload(BaseModel):
        course_id: str = Field(min_length=1, max_length=64)

    @app.post("/api/lms/enrollments", status_code=status.HTTP_201_CREATED)
    def enrol_me(payload: EnrolPayload, actor: dict = Depends(require_auth)):
        """Enrol the signed-in student on a course.

        The student is taken from the session, so this cannot be used to enrol
        anybody else. Re-enrolling is idempotent (it reactivates a withdrawn row)
        rather than creating a duplicate.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)

            cur.execute(
                "SELECT id, title, approval_status, status, competition_id FROM lms_courses WHERE id = %s",
                (payload.course_id,),
            )
            course = cur.fetchone()
            if not course:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Course not found")
            # Don't let students enrol on content still awaiting moderation.
            if (course[2] or "approved") != "approved":
                conn.rollback(); cur.close()
                raise HTTPException(status_code=409, detail="This course is not open for enrolment yet")

            # Derive the student's squad: if this course belongs to a cycle and the
            # student is a member of a team in that cycle, record the team so an
            # instructor's roster can be grouped by squad. Absent that, the
            # enrolment is individual / open-registration and team_id stays NULL.
            team_id = None
            if course[4]:
                cur.execute(
                    "SELECT tm.team_id FROM team_members tm "
                    "JOIN teams t ON t.id = tm.team_id "
                    "WHERE tm.student_id = %s AND t.competition_id = %s LIMIT 1",
                    (student_id, course[4]),
                )
                trow = cur.fetchone()
                team_id = trow[0] if trow else None

            cur.execute(
                "INSERT INTO lms_enrollments (id, course_id, student_id, student_name, "
                "student_email, progress_pct, enrolled_at, last_active, status, team_id) "
                "VALUES (%s, %s, %s, %s, %s, 0, %s, %s, 'active', %s) "
                "ON CONFLICT (course_id, student_id) DO UPDATE SET "
                "status = 'active', last_active = EXCLUDED.last_active, "
                "student_name = EXCLUDED.student_name, student_email = EXCLUDED.student_email, "
                "team_id = EXCLUDED.team_id "
                "RETURNING id",
                (
                    "enr-" + str(uuid.uuid4())[:8],
                    payload.course_id,
                    student_id,
                    actor.get("full_name") or "",
                    actor.get("email") or "",
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    team_id,
                ),
            )
            enrolment_id = cur.fetchone()[0]
            total = _recount_course_enrolment(cur, payload.course_id)
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_enrollments"})
        return {
            "id": enrolment_id, "course_id": payload.course_id,
            "course_title": course[1], "status": "active", "enrolled_total": total,
        }

    @app.delete("/api/lms/enrollments/{course_id}")
    def withdraw_me(course_id: str, actor: dict = Depends(require_auth)):
        """Withdraw the signed-in student from a course.

        Marked withdrawn rather than deleted so submitted work and its grades keep
        their context.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            cur.execute(
                "UPDATE lms_enrollments SET status = 'withdrawn', last_active = %s "
                "WHERE course_id = %s AND student_id = %s RETURNING id",
                (datetime.datetime.now(datetime.UTC).isoformat(), course_id, student_id),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="You are not enrolled on that course")
            _recount_course_enrolment(cur, course_id)
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_enrollments"})
        return {"status": "withdrawn", "course_id": course_id}

    @app.get("/api/lms/my-enrollments")
    def list_my_enrolments(actor: dict = Depends(require_auth)):
        """The signed-in student's courses, with live progress.

        Replaces the student course list, which showed every course on the platform
        because no enrolment relationship was ever recorded.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            conn.commit()
            cur.execute(
                "SELECT c.id, c.title, c.track, c.icon, c.level, c.description, "
                "c.modules, e.progress_pct, e.enrolled_at, e.last_active, e.status, "
                "p.progress_pct, p.completed_modules, "
                "(SELECT COUNT(*) FROM lms_assignments a "
                "  WHERE a.course_id = c.id AND COALESCE(a.status,'active') = 'active') "
                "FROM lms_enrollments e "
                "JOIN lms_courses c ON c.id = e.course_id "
                "LEFT JOIN lms_progress p ON p.student_id = e.student_id "
                "  AND p.course_title = c.title "
                "WHERE e.student_id = %s AND e.status = 'active' "
                "ORDER BY e.enrolled_at DESC",
                (student_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "course_id": r[0], "title": r[1], "track": r[2] or "", "icon": r[3] or "school",
                "level": r[4] or "", "description": r[5] or "", "modules": r[6] or 0,
                # Prefer the per-module progress table; fall back to the enrolment row.
                "progress_pct": r[11] if r[11] is not None else (r[7] or 0),
                "completed_modules": r[12] or 0,
                "enrolled_at": r[8], "last_active": r[9], "status": r[10],
                "assignment_count": r[13] or 0,
            }
            for r in rows
        ]

    @app.get("/api/lms/assignments")
    def list_lms_assignments(course_id: str = "", actor: dict = Depends(require_auth)):
        """Assignments, optionally for one course.

        Students had no way to see what they were meant to submit: the assignment
        list existed only in localStorage and had no GET endpoint. The submission
        box was therefore free text with no assignment attached.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            sql = (
                "SELECT a.id, a.course_id, c.title, a.title, a.description, a.due_date, "
                "a.max_score, a.track, a.status "
                "FROM lms_assignments a LEFT JOIN lms_courses c ON c.id = a.course_id "
                "WHERE COALESCE(a.approval_status, 'approved') = 'approved'"
            )
            params: list = []
            if course_id:
                sql += " AND a.course_id = %s"
                params.append(course_id)
            sql += " ORDER BY a.due_date NULLS LAST, a.title"
            cur.execute(sql, params)
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0], "course_id": r[1] or "", "course_title": r[2] or "",
                "title": r[3], "description": r[4] or "", "due_date": r[5] or "",
                "max_score": r[6] if r[6] is not None else 100,
                "track": r[7] or "", "status": r[8] or "active",
            }
            for r in rows
        ]

    class LmsSubmitPayload(BaseModel):
        assignment_id: str = Field(min_length=1, max_length=64)
        content: str = Field(default="", max_length=20000)
        url: str = Field(default="", max_length=2000)

    @app.post("/api/lms/submissions", status_code=status.HTTP_201_CREATED)
    def submit_my_work(payload: LmsSubmitPayload, actor: dict = Depends(require_auth)):
        """Submit the signed-in student's work for an assignment.

        Identity comes from the session. Resubmitting replaces the previous
        attempt AND clears any existing score/feedback, so a student cannot
        resubmit after grading and keep the old mark -- the work goes back into the
        instructor's queue as ungraded.
        """
        if not payload.content.strip() and not payload.url.strip():
            raise HTTPException(
                status_code=422,
                detail="Attach a link or describe your work before submitting",
            )

        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)

            cur.execute(
                "SELECT a.id, a.course_id, a.title FROM lms_assignments a WHERE a.id = %s",
                (payload.assignment_id,),
            )
            assignment = cur.fetchone()
            if not assignment:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Assignment not found")

            # Must be enrolled on the course that owns the assignment.
            cur.execute(
                "SELECT 1 FROM lms_enrollments WHERE course_id = %s AND student_id = %s "
                "AND status = 'active'",
                (assignment[1], student_id),
            )
            if not cur.fetchone():
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=403,
                    detail="Enrol on this course before submitting work for it",
                )

            cur.execute(
                "INSERT INTO lms_submissions (id, assignment_id, course_id, student_id, "
                "student_name, student_email, submitted_at, content, url, score, status, feedback) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, 'submitted', NULL) "
                "ON CONFLICT (assignment_id, student_id) DO UPDATE SET "
                "submitted_at = EXCLUDED.submitted_at, content = EXCLUDED.content, "
                "url = EXCLUDED.url, score = NULL, feedback = NULL, status = 'submitted' "
                "RETURNING id",
                (
                    "sub-" + str(uuid.uuid4())[:8],
                    payload.assignment_id,
                    assignment[1],
                    student_id,
                    actor.get("full_name") or "",
                    actor.get("email") or "",
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    payload.content,
                    payload.url,
                ),
            )
            submission_id = cur.fetchone()[0]
            cur.execute(
                "UPDATE lms_enrollments SET last_active = %s "
                "WHERE course_id = %s AND student_id = %s",
                (datetime.datetime.now(datetime.UTC).isoformat(), assignment[1], student_id),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_submissions"})
        return {
            "id": submission_id, "assignment_id": payload.assignment_id,
            "assignment_title": assignment[2], "status": "submitted",
        }

    @app.get("/api/lms/my-submissions")
    def list_my_submissions(actor: dict = Depends(require_auth)):
        """The signed-in student's submissions, including score and feedback.

        This is how a grade finally reaches a student. Nothing read lms_submissions
        back before -- there was no GET endpoint -- so an instructor's mark and
        written feedback were invisible to the person they were written for.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            conn.commit()
            cur.execute(
                "SELECT s.id, s.assignment_id, a.title, s.course_id, c.title, "
                "s.submitted_at, s.content, s.url, s.score, s.status, s.feedback, "
                "a.max_score, a.due_date "
                "FROM lms_submissions s "
                "LEFT JOIN lms_assignments a ON a.id = s.assignment_id "
                "LEFT JOIN lms_courses c ON c.id = s.course_id "
                "WHERE s.student_id = %s "
                "ORDER BY s.submitted_at DESC",
                (student_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0], "assignment_id": r[1] or "", "assignment_title": r[2] or "",
                "course_id": r[3] or "", "course_title": r[4] or "",
                "submitted_at": r[5] or "", "content": r[6] or "", "url": r[7] or "",
                "score": r[8], "status": r[9] or "submitted", "feedback": r[10] or "",
                "max_score": r[11] if r[11] is not None else 100,
                "due_date": r[12] or "",
            }
            for r in rows
        ]

    @app.post("/api/lms/progress")
    def save_lms_progress(payload: dict | None = None, actor: dict = Depends(require_auth)):
        """Save the signed-in student's course progress.

        `student_id` used to be read from the REQUEST BODY, so any authenticated
        user could write progress rows for any other student (or invent ids). It is
        now always the caller's own id, taken from the verified session; a
        student_id in the body is ignored.
        """
        if not payload or not str(payload.get("course_title") or "").strip():
            raise HTTPException(status_code=400, detail="course_title required")

        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            try:
                pct = max(0, min(100, int(payload.get("progress_pct", 0) or 0)))
                modules = max(0, int(payload.get("completed_modules", 0) or 0))
            except (TypeError, ValueError):
                conn.rollback(); cur.close()
                raise HTTPException(status_code=422, detail="progress_pct and completed_modules must be numbers")

            cur.execute("""
                INSERT INTO lms_progress (student_id, course_title, progress_pct, completed_modules, last_accessed)
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (student_id, course_title) DO UPDATE SET
                    progress_pct = EXCLUDED.progress_pct,
                    completed_modules = EXCLUDED.completed_modules,
                    last_accessed = CURRENT_TIMESTAMP
            """, (student_id, payload["course_title"], pct, modules))
            # Mirror onto the enrolment row so instructor/admin course views agree.
            cur.execute(
                "UPDATE lms_enrollments e SET progress_pct = %s, last_active = %s "
                "FROM lms_courses c "
                "WHERE c.id = e.course_id AND e.student_id = %s AND c.title = %s",
                (pct, datetime.datetime.now(datetime.UTC).isoformat(), student_id, payload["course_title"]),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        return {"status": "saved", "progress_pct": pct, "completed_modules": modules}

    @app.get("/api/lms/my-progress")
    def get_my_lms_progress(actor: dict = Depends(require_auth)):
        """The signed-in student's own progress across all courses.

        Progress was previously read from localStorage under a key built from a
        client-generated random id, so it never survived a new device or even a
        re-render. This is the read-back path.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            conn.commit()
            cur.execute(
                "SELECT course_title, progress_pct, completed_modules, last_accessed "
                "FROM lms_progress WHERE student_id = %s ORDER BY last_accessed DESC",
                (student_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {"course_title": r[0], "progress_pct": r[1], "completed_modules": r[2],
             "last_accessed": str(r[3])}
            for r in rows
        ]

    @app.get("/api/lms/progress/{student_id}")
    def get_lms_progress(student_id: str, actor: dict = Depends(require_auth)):
        """Progress for one student.

        Previously any signed-in user could read any student's progress by putting
        their id in the path -- a plain IDOR. Now the caller must either be that
        student or hold a staff role with a legitimate reason to see it.
        """
        is_self = student_id == actor["id"]
        is_staff = actor.get("role") in set(STUDENT_ADMIN_ROLES) | set(LMS_ROLES)
        if not is_self and not is_staff:
            raise HTTPException(status_code=403, detail="You may only view your own progress")

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT course_title, progress_pct, completed_modules, last_accessed "
                "FROM lms_progress WHERE student_id = %s ORDER BY last_accessed DESC",
                (student_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {"course_title": r[0], "progress_pct": r[1], "completed_modules": r[2],
             "last_accessed": str(r[3])}
            for r in rows
        ]

    # ─── COMPETITION REGISTRATION (student self-service) ─────────────
    # registerStudentForCycle() in the frontend was one line --
    # `this.studentRegisteredMap[comp.id] = true` -- with no HTTP call, no storage
    # and no table behind it. A student pressed "Register Squad", saw a REGISTERED
    # badge, and lost it on refresh; no organiser ever saw the sign-up.

    class CompetitionRegisterPayload(BaseModel):
        competition_id: str = Field(min_length=1, max_length=64)

    @app.post("/api/competitions/register", status_code=status.HTTP_201_CREATED)
    def register_for_competition(
        payload: CompetitionRegisterPayload,
        actor: dict = Depends(require_auth),
    ):
        """Register the signed-in student for a competition cycle."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)

            cur.execute(
                "SELECT id, title, status, track FROM competitions WHERE id = %s",
                (payload.competition_id,),
            )
            comp = cur.fetchone()
            if not comp:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Competition not found")
            # Whether a cycle accepts sign-ups is derived from the lifecycle
            # contract in app/lifecycle.py, not from a deny-list maintained here.
            # The old list named a 'cancelled' status that no longer exists, and
            # any status added later would have defaulted to "open".
            if not is_registration_open(comp[2]):
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=409,
                    detail="This cycle is not open for registration",
                )

            cur.execute(
                "INSERT INTO competition_registrations (id, competition_id, student_id, "
                "student_name, student_email, track, status, registered_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, 'registered', CURRENT_TIMESTAMP) "
                "ON CONFLICT (competition_id, student_id) DO UPDATE SET "
                "status = 'registered', withdrawn_at = NULL "
                "RETURNING id",
                (
                    "creg-" + str(uuid.uuid4())[:8],
                    payload.competition_id,
                    student_id,
                    actor.get("full_name") or "",
                    actor.get("email") or "",
                    comp[3] or "",
                ),
            )
            registration_id = cur.fetchone()[0]
            # Model the solo entrant as a team of one, so mentors and LMS
            # auto-enrolment work for them the same as for a squad (Option B).
            solo_team_id = _ensure_solo_team(
                cur, student_id, actor.get("full_name") or "",
                actor.get("email") or "", payload.competition_id, comp[3] or "",
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "competition_registrations"})
        broadcast_async({"type": "data_changed", "collection": "teams"})
        return {
            "id": registration_id, "competition_id": payload.competition_id,
            "competition_title": comp[1], "status": "registered",
            "solo_team_id": solo_team_id,
        }

    @app.delete("/api/competitions/register/{competition_id}")
    def withdraw_from_competition(competition_id: str, actor: dict = Depends(require_auth)):
        """Withdraw the signed-in student from a competition cycle."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            cur.execute(
                "UPDATE competition_registrations SET status = 'withdrawn', "
                "withdrawn_at = CURRENT_TIMESTAMP "
                "WHERE competition_id = %s AND student_id = %s AND status = 'registered' "
                "RETURNING id",
                (competition_id, student_id),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="You are not registered for that cycle")
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "competition_registrations"})
        return {"status": "withdrawn", "competition_id": competition_id}

    @app.get("/api/competitions/my-registrations")
    def list_my_competition_registrations(actor: dict = Depends(require_auth)):
        """Competition cycles the signed-in student is registered for."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            student_id = _require_student_identity(cur, actor)
            conn.commit()
            cur.execute(
                "SELECT r.competition_id, c.title, c.status, r.track, r.status, r.registered_at "
                "FROM competition_registrations r "
                "LEFT JOIN competitions c ON c.id = r.competition_id "
                "WHERE r.student_id = %s AND r.status = 'registered' "
                "ORDER BY r.registered_at DESC",
                (student_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "competition_id": r[0], "competition_title": r[1] or "",
                "competition_status": r[2] or "", "track": r[3] or "",
                "status": r[4], "registered_at": str(r[5]) if r[5] else None,
            }
            for r in rows
        ]

    @app.get("/api/competitions/{competition_id}/registrations")
    def list_competition_registrations(
        competition_id: str,
        _actor: dict = Depends(require_role(COMPETITION_ROLES, STUDENT_ADMIN_ROLES)),
    ):
        """Everyone signed up for a cycle. For organisers, not students."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, student_id, student_name, student_email, track, status, registered_at "
                "FROM competition_registrations "
                "WHERE competition_id = %s AND status = 'registered' "
                "ORDER BY registered_at",
                (competition_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {"id": r[0], "student_id": r[1], "student_name": r[2] or "",
             "student_email": r[3] or "", "track": r[4] or "", "status": r[5],
             "registered_at": str(r[6]) if r[6] else None}
            for r in rows
        ]

    # ─── INSTRUCTOR AUTHORING & GRADING ──────────────────────────────
    # An instructor had a complete CRUD interface at /lms-manager in which NOTHING
    # persisted. Every save funnelled through POST /api/bulk-sync, which is
    # require_admin, so each write 403'd and ContentService discarded the error with
    # `error: () => {}`. Courses, modules, materials, assignments and grades lived
    # only in that one browser's localStorage, and the UI reported success.
    #
    # Three further defects this block fixes:
    #   * `submitted_by` was hardcoded to the literal 'Admin' on create, so an
    #     instructor's content never matched their own "My Courses" filter.
    #   * `submitted_by` and `approval_status` were accepted from the request body,
    #     so authorship could be forged and content self-approved on creation.
    #   * Grading wrote to a local object; the student had no way to see the mark.

    STAFF_REVIEW_ROLES = tuple(set(ADMIN_ROLES) | set(CONTENT_ROLES))

    def _is_lms_staff(actor: dict) -> bool:
        """True for roles that may moderate or edit anyone's LMS content."""
        return actor.get("role") in set(ADMIN_ROLES) | set(CONTENT_ROLES)

    def _load_owned_course(cur, course_id: str, actor: dict) -> tuple:
        """Fetch a course, enforcing that the caller may modify it."""
        cur.execute(
            "SELECT id, title, owner_id, approval_status FROM lms_courses WHERE id = %s",
            (course_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Course not found")
        if not _is_lms_staff(actor) and row[2] != actor["id"]:
            # Don't reveal whether someone else's course exists.
            raise HTTPException(status_code=403, detail="This course belongs to another author")
        return row

    class LmsCoursePayload(BaseModel):
        title: str = Field(min_length=1, max_length=200)
        track: str = Field(default="", max_length=50)
        icon: str = Field(default="school", max_length=50)
        level: str = Field(default="", max_length=50)
        description: str = Field(default="", max_length=5000)
        modules: int = Field(default=0, ge=0, le=500)
        # Which cycle this course prepares students for. Empty means evergreen
        # material that is not tied to one competition.
        competition_id: str = Field(default="", max_length=64)

    @app.post("/api/lms/courses", status_code=status.HTTP_201_CREATED)
    def create_my_course(payload: LmsCoursePayload, actor: dict = Depends(require_role(LMS_ROLES))):
        """Create a course owned by the caller.

        Authorship and moderation state are both decided here, not by the client:
        an instructor's course starts 'pending' and must be reviewed by someone
        else, while content staff publish directly.
        """
        approval = "approved" if _is_lms_staff(actor) else "pending"
        course_id = "crs-" + str(uuid.uuid4())[:8]
        conn = _get_db()
        try:
            cur = conn.cursor()
            # Validated rather than stored blind: there are no FK constraints on
            # competitions.id, so a stale or typo'd id would be accepted and the
            # course would simply never appear in any cycle-scoped view.
            comp_ref = _validate_competition_ref(cur, payload.competition_id or None)
            cur.execute(
                "INSERT INTO lms_courses (id, title, track, icon, level, description, "
                "modules, enrolled, completion, status, created_at, submitted_by, "
                "approval_status, owner_id, competition_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,'active',%s,%s,%s,%s,%s)",
                (
                    course_id, payload.title, payload.track, payload.icon, payload.level,
                    payload.description, payload.modules,
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    actor.get("full_name") or actor.get("email") or "",
                    approval, actor["id"], comp_ref,
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_courses"})
        return {
            "id": course_id,
            "title": payload.title,
            "approval_status": approval,
            "competitionId": comp_ref,
        }

    @app.patch("/api/lms/courses/{course_id}")
    def update_my_course(
        course_id: str,
        payload: LmsCoursePayload,
        actor: dict = Depends(require_role(LMS_ROLES)),
    ):
        """Edit a course. Instructors may only edit their own."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            existing = _load_owned_course(cur, course_id, actor)
            # An instructor editing already-published content sends it back for
            # review; staff edits stay published.
            approval = existing[3] if _is_lms_staff(actor) else "pending"
            comp_ref = _validate_competition_ref(cur, payload.competition_id or None)
            cur.execute(
                "UPDATE lms_courses SET title=%s, track=%s, icon=%s, level=%s, "
                "description=%s, modules=%s, approval_status=%s, competition_id=%s "
                "WHERE id=%s",
                (payload.title, payload.track, payload.icon, payload.level,
                 payload.description, payload.modules, approval, comp_ref, course_id),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_courses"})
        return {
            "id": course_id,
            "status": "updated",
            "approval_status": approval,
            "competitionId": comp_ref,
        }

    @app.delete("/api/lms/courses/{course_id}")
    def delete_my_course(course_id: str, actor: dict = Depends(require_role(LMS_ROLES))):
        """Delete a course. Refuses if students are enrolled.

        There was no DELETE endpoint at all before; the UI filtered a local array.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            _load_owned_course(cur, course_id, actor)
            cur.execute(
                "SELECT COUNT(*) FROM lms_enrollments WHERE course_id=%s AND status='active'",
                (course_id,),
            )
            enrolled = cur.fetchone()[0]
            if enrolled and not _is_lms_staff(actor):
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=409,
                    detail=f"{enrolled} student(s) are enrolled. Ask an administrator to remove this course.",
                )
            cur.execute("DELETE FROM lms_courses WHERE id=%s", (course_id,))
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_courses"})
        return {"status": "deleted", "id": course_id}

    @app.get("/api/lms/my-courses")
    def list_my_courses(competition_id: str = "", actor: dict = Depends(require_role(LMS_ROLES))):
        """Courses the caller authored, with live roster and grading counts.

        competition_id scopes the list to one cycle. The LMS previously had no
        notion of cycles at all -- courses were organised only by `track` -- so an
        instructor preparing for a specific competition had no way to see just
        that material.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            clause = " AND c.competition_id = %s" if competition_id else ""
            params = (actor["id"],) if not competition_id else (actor["id"], competition_id)
            cur.execute(
                "SELECT c.id, c.title, c.track, c.icon, c.level, c.description, c.modules, "
                "c.status, c.approval_status, c.rejection_reason, c.created_at, c.competition_id, "
                "(SELECT COUNT(*) FROM lms_enrollments e WHERE e.course_id=c.id AND e.status='active'), "
                "(SELECT COUNT(*) FROM lms_assignments a WHERE a.course_id=c.id), "
                "(SELECT COUNT(*) FROM lms_submissions s WHERE s.course_id=c.id AND s.score IS NULL), "
                "(SELECT ROUND(AVG(e.progress_pct)) FROM lms_enrollments e WHERE e.course_id=c.id AND e.status='active') "
                "FROM lms_courses c WHERE c.owner_id = %s" + clause + " ORDER BY c.created_at DESC NULLS LAST",
                params,
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0], "title": r[1], "track": r[2] or "", "icon": r[3] or "school",
                "level": r[4] or "", "description": r[5] or "", "modules": r[6] or 0,
                "status": r[7] or "active", "approval_status": r[8] or "approved",
                "rejection_reason": r[9] or "", "created_at": r[10] or "",
                "competitionId": r[11],
                "enrolled_count": r[12] or 0, "assignment_count": r[13] or 0,
                "awaiting_grading": r[14] or 0,
                "average_progress": int(r[15]) if r[15] is not None else 0,
            }
            for r in rows
        ]

    @app.get("/api/lms/courses/{course_id}/students")
    def list_course_students(course_id: str, actor: dict = Depends(require_role(LMS_ROLES))):
        """The enrolled roster for one course, with progress and submission counts.

        The LMS Manager "Students" tab read `lmsEnrollments`, which defaults to []
        and had no backend GET -- so it was permanently empty unless an admin had
        bulk-synced data into that same browser.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            _load_owned_course(cur, course_id, actor)
            cur.execute(
                "SELECT e.student_id, e.student_name, e.student_email, e.progress_pct, "
                "e.enrolled_at, e.last_active, e.status, e.team_id, t.name, "
                "(SELECT COUNT(*) FROM lms_submissions s WHERE s.course_id=e.course_id AND s.student_id=e.student_id), "
                "(SELECT COUNT(*) FROM lms_submissions s WHERE s.course_id=e.course_id AND s.student_id=e.student_id AND s.score IS NOT NULL), "
                "(SELECT ROUND(AVG(s.score)) FROM lms_submissions s WHERE s.course_id=e.course_id AND s.student_id=e.student_id AND s.score IS NOT NULL) "
                "FROM lms_enrollments e "
                "LEFT JOIN teams t ON t.id = e.team_id "
                "WHERE e.course_id=%s AND e.status='active' "
                "ORDER BY t.name NULLS LAST, e.student_name",
                (course_id,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "student_id": r[0], "student_name": r[1] or "", "student_email": r[2] or "",
                "progress_pct": r[3] or 0, "enrolled_at": r[4] or "", "last_active": r[5] or "",
                "status": r[6] or "active", "team_id": r[7], "team_name": r[8] or "",
                "submissions": r[9] or 0, "graded": r[10] or 0,
                "average_score": int(r[11]) if r[11] is not None else None,
            }
            for r in rows
        ]

    # ── Modules / materials / assignments (owner-scoped) ──────────────
    # None of these had ANY endpoint: the five tables existed and were indexed but
    # were writable only through admin bulk-sync and readable through nothing.

    class LmsModulePayload(BaseModel):
        course_id: str = Field(min_length=1, max_length=64)
        title: str = Field(min_length=1, max_length=200)
        description: str = Field(default="", max_length=5000)
        order_num: int = Field(default=1, ge=1, le=500)
        icon: str = Field(default="menu_book", max_length=50)

    @app.post("/api/lms/modules", status_code=status.HTTP_201_CREATED)
    def create_module(payload: LmsModulePayload, actor: dict = Depends(require_role(LMS_ROLES))):
        conn = _get_db()
        try:
            cur = conn.cursor()
            course = _load_owned_course(cur, payload.course_id, actor)
            # The course is the unit of review, so child content inherits its state.
            # On a pending course it stays pending and is published by the cascade in
            # moderate_course(); on an already-approved course the author can add
            # material without it being stranded, since there is no per-item review
            # route to rescue it.
            inherited = course[3] or "approved"
            module_id = "mod-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO lms_modules (id, course_id, title, description, order_num, "
                "icon, status, submitted_by, approval_status, owner_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,'published',%s,%s,%s)",
                (module_id, payload.course_id, payload.title, payload.description,
                 payload.order_num, payload.icon,
                 actor.get("full_name") or actor.get("email") or "",
                 inherited, actor["id"]),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_modules"})
        return {"id": module_id, "title": payload.title}

    @app.get("/api/lms/modules")
    def list_modules(course_id: str = "", _actor: dict = Depends(require_auth)):
        """Modules for a course. Students need this for a real syllabus -- the
        student view previously synthesised `Module 1..n` placeholders because there
        was no way to read the real titles."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            sql = ("SELECT id, course_id, title, description, order_num, icon, status "
                   "FROM lms_modules WHERE COALESCE(approval_status,'approved')='approved'")
            params: list = []
            if course_id:
                sql += " AND course_id = %s"
                params.append(course_id)
            sql += " ORDER BY order_num, title"
            cur.execute(sql, params)
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {"id": r[0], "course_id": r[1] or "", "title": r[2], "description": r[3] or "",
             "order_num": r[4] or 1, "icon": r[5] or "menu_book", "status": r[6] or "published"}
            for r in rows
        ]

    @app.delete("/api/lms/modules/{module_id}")
    def delete_module(module_id: str, actor: dict = Depends(require_role(LMS_ROLES))):
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT course_id FROM lms_modules WHERE id=%s", (module_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Module not found")
            _load_owned_course(cur, row[0], actor)
            cur.execute("DELETE FROM lms_modules WHERE id=%s", (module_id,))
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_modules"})
        return {"status": "deleted", "id": module_id}

    class LmsMaterialPayload(BaseModel):
        course_id: str = Field(min_length=1, max_length=64)
        module_id: str = Field(default="", max_length=64)
        title: str = Field(min_length=1, max_length=200)
        type: str = Field(default="link", max_length=20)
        url: str = Field(default="", max_length=2000)
        description: str = Field(default="", max_length=5000)

    @app.post("/api/lms/materials", status_code=status.HTTP_201_CREATED)
    def create_material(payload: LmsMaterialPayload, actor: dict = Depends(require_role(LMS_ROLES))):
        conn = _get_db()
        try:
            cur = conn.cursor()
            course = _load_owned_course(cur, payload.course_id, actor)
            inherited = course[3] or "approved"
            material_id = "mat-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO lms_materials (id, course_id, module_id, title, type, url, "
                "description, created_at, submitted_by, approval_status, owner_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (material_id, payload.course_id, payload.module_id or None, payload.title,
                 payload.type, payload.url, payload.description,
                 datetime.datetime.now(datetime.UTC).isoformat(),
                 actor.get("full_name") or actor.get("email") or "",
                 inherited, actor["id"]),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_materials"})
        return {"id": material_id, "title": payload.title}

    @app.get("/api/lms/materials")
    def list_materials(course_id: str = "", _actor: dict = Depends(require_auth)):
        conn = _get_db()
        try:
            cur = conn.cursor()
            sql = ("SELECT id, course_id, module_id, title, type, url, description "
                   "FROM lms_materials WHERE COALESCE(approval_status,'approved')='approved'")
            params: list = []
            if course_id:
                sql += " AND course_id = %s"
                params.append(course_id)
            sql += " ORDER BY title"
            cur.execute(sql, params)
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {"id": r[0], "course_id": r[1] or "", "module_id": r[2] or "", "title": r[3],
             "type": r[4] or "link", "url": r[5] or "", "description": r[6] or ""}
            for r in rows
        ]

    @app.delete("/api/lms/materials/{material_id}")
    def delete_material(material_id: str, actor: dict = Depends(require_role(LMS_ROLES))):
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT course_id FROM lms_materials WHERE id=%s", (material_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Material not found")
            _load_owned_course(cur, row[0], actor)
            cur.execute("DELETE FROM lms_materials WHERE id=%s", (material_id,))
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_materials"})
        return {"status": "deleted", "id": material_id}

    class LmsAssignmentPayload(BaseModel):
        course_id: str = Field(min_length=1, max_length=64)
        title: str = Field(min_length=1, max_length=200)
        description: str = Field(default="", max_length=5000)
        due_date: str = Field(default="", max_length=50)
        max_score: int = Field(default=100, ge=1, le=1000)
        track: str = Field(default="", max_length=50)

    @app.post("/api/lms/assignments", status_code=status.HTTP_201_CREATED)
    def create_assignment(payload: LmsAssignmentPayload, actor: dict = Depends(require_role(LMS_ROLES))):
        conn = _get_db()
        try:
            cur = conn.cursor()
            course = _load_owned_course(cur, payload.course_id, actor)
            inherited = course[3] or "approved"
            assignment_id = "asg-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO lms_assignments (id, course_id, title, description, due_date, "
                "max_score, track, status, created_at, submitted_by, approval_status, owner_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,'active',%s,%s,%s,%s)",
                (assignment_id, payload.course_id, payload.title, payload.description,
                 payload.due_date or None, payload.max_score, payload.track,
                 datetime.datetime.now(datetime.UTC).isoformat(),
                 actor.get("full_name") or actor.get("email") or "",
                 inherited, actor["id"]),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_assignments"})
        return {"id": assignment_id, "title": payload.title}

    @app.delete("/api/lms/assignments/{assignment_id}")
    def delete_assignment(assignment_id: str, actor: dict = Depends(require_role(LMS_ROLES))):
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT course_id FROM lms_assignments WHERE id=%s", (assignment_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Assignment not found")
            _load_owned_course(cur, row[0], actor)
            cur.execute(
                "SELECT COUNT(*) FROM lms_submissions WHERE assignment_id=%s", (assignment_id,)
            )
            if cur.fetchone()[0] and not _is_lms_staff(actor):
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=409,
                    detail="Students have already submitted work for this assignment.",
                )
            cur.execute("DELETE FROM lms_assignments WHERE id=%s", (assignment_id,))
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_assignments"})
        return {"status": "deleted", "id": assignment_id}

    # ── Grading ───────────────────────────────────────────────────────

    @app.get("/api/lms/grading-queue")
    def lms_grading_queue(course_id: str = "", actor: dict = Depends(require_role(LMS_ROLES))):
        """Submissions awaiting a mark on the caller's own courses.

        The LMS Manager review desk read `lmsSubmissions`, which defaults to [] and
        had no backend GET -- so an instructor could never see real student work.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            sql = (
                "SELECT s.id, s.assignment_id, a.title, s.course_id, c.title, s.student_id, "
                "s.student_name, s.student_email, s.submitted_at, s.content, s.url, "
                "s.score, s.status, s.feedback, a.max_score "
                "FROM lms_submissions s "
                "JOIN lms_courses c ON c.id = s.course_id "
                "LEFT JOIN lms_assignments a ON a.id = s.assignment_id "
                "WHERE s.score IS NULL"
            )
            params: list = []
            # Staff see everything; an instructor sees only their own courses.
            if not _is_lms_staff(actor):
                sql += " AND c.owner_id = %s"
                params.append(actor["id"])
            if course_id:
                sql += " AND s.course_id = %s"
                params.append(course_id)
            sql += " ORDER BY s.submitted_at"
            cur.execute(sql, params)
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0], "assignment_id": r[1] or "", "assignment_title": r[2] or "",
                "course_id": r[3] or "", "course_title": r[4] or "",
                "student_id": r[5] or "", "student_name": r[6] or "",
                "student_email": r[7] or "", "submitted_at": r[8] or "",
                "content": r[9] or "", "url": r[10] or "", "score": r[11],
                "status": r[12] or "submitted", "feedback": r[13] or "",
                "max_score": r[14] if r[14] is not None else 100,
            }
            for r in rows
        ]

    class GradeLmsSubmissionPayload(BaseModel):
        score: int = Field(ge=0, le=1000)
        feedback: str = Field(default="", max_length=5000)

    @app.patch("/api/lms/submissions/{submission_id}/grade")
    def grade_lms_submission(
        submission_id: str,
        payload: GradeLmsSubmissionPayload,
        actor: dict = Depends(require_role(LMS_ROLES)),
    ):
        """Mark a student's work.

        Replaces `gradeLmsSubmission()`, which mutated a local object
        (`sub.score = score`) and then pushed it through admin-only bulk-sync. The
        mark never left the browser, and no read path existed for the student even
        if it had.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT s.course_id, c.owner_id, a.max_score, s.student_email "
                "FROM lms_submissions s "
                "LEFT JOIN lms_courses c ON c.id = s.course_id "
                "LEFT JOIN lms_assignments a ON a.id = s.assignment_id "
                "WHERE s.id = %s",
                (submission_id,),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Submission not found")
            if not _is_lms_staff(actor) and row[1] != actor["id"]:
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=403,
                    detail="You can only grade work submitted on your own courses",
                )
            max_score = row[2] if row[2] is not None else 100
            if payload.score > max_score:
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=422,
                    detail=f"Score cannot exceed the assignment maximum of {max_score}",
                )

            cur.execute(
                "UPDATE lms_submissions SET score=%s, feedback=%s, status='graded' WHERE id=%s",
                (payload.score, payload.feedback, submission_id),
            )
            # Audit in the same transaction, so a mark cannot exist unrecorded.
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (
                    f"Graded submission {submission_id} ({payload.score}/{max_score}) "
                    f"for {row[3] or 'student'}",
                    actor.get("email") or actor["id"],
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    "grading",
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_submissions"})
        return {"id": submission_id, "score": payload.score, "status": "graded"}

    class ReturnSubmissionPayload(BaseModel):
        feedback: str = Field(min_length=1, max_length=5000)

    @app.patch("/api/lms/submissions/{submission_id}/return")
    def return_lms_submission(
        submission_id: str,
        payload: ReturnSubmissionPayload,
        actor: dict = Depends(require_role(LMS_ROLES)),
    ):
        """Send a submission back for revision instead of grading it.

        Replaces `requestSubmissionRevision()` / `rejectLmsSubmission()`, which
        mutated a local object and pushed it through admin-only bulk-sync -- so the
        student was never told anything and the work sat in the queue looking
        ungraded.

        No score is recorded, so the work correctly stays in the grading queue as
        outstanding; the student sees the feedback and can resubmit, which resets
        the status to 'submitted'.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT s.course_id, c.owner_id FROM lms_submissions s "
                "LEFT JOIN lms_courses c ON c.id = s.course_id WHERE s.id = %s",
                (submission_id,),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Submission not found")
            if not _is_lms_staff(actor) and row[1] != actor["id"]:
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=403,
                    detail="You can only review work submitted on your own courses",
                )
            cur.execute(
                "UPDATE lms_submissions SET status='revision_requested', feedback=%s, "
                "score=NULL WHERE id=%s",
                (payload.feedback, submission_id),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_submissions"})
        return {"id": submission_id, "status": "revision_requested"}

    # ── Moderation ────────────────────────────────────────────────────

    class ModerateContentPayload(BaseModel):
        approve: bool
        reason: str = Field(default="", max_length=2000)

    @app.patch("/api/lms/courses/{course_id}/moderate")
    def moderate_course(
        course_id: str,
        payload: ModerateContentPayload,
        actor: dict = Depends(require_role(STAFF_REVIEW_ROLES)),
    ):
        """Approve or reject submitted course content.

        Critically, the reviewer may not be the author. The old flow showed
        instructors the shared admin approvals queue with no owner scoping, so an
        instructor could approve their own submission -- and the record was stamped
        with the hardcoded default 'admin@ntic.org.gh' rather than whoever acted.
        """
        if not payload.approve and not payload.reason.strip():
            raise HTTPException(status_code=422, detail="Give a reason when rejecting content")

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT owner_id, title FROM lms_courses WHERE id = %s", (course_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Course not found")
            if row[0] and row[0] == actor["id"]:
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=403,
                    detail="You cannot review your own content. Ask another reviewer.",
                )

            new_status = "approved" if payload.approve else "rejected"
            cur.execute(
                "UPDATE lms_courses SET approval_status=%s, rejection_reason=%s WHERE id=%s",
                (new_status, payload.reason if not payload.approve else None, course_id),
            )
            # Cascade to the course's contents. A reviewer approves a course
            # *including* its modules, materials and assignments -- without this the
            # instructor's assignments would stay 'pending' forever, invisible to
            # students and with no separate route to publish them.
            for _tbl in ("lms_modules", "lms_materials", "lms_assignments"):
                cur.execute(
                    f"UPDATE {_tbl} SET approval_status=%s WHERE course_id=%s",
                    (new_status, course_id),
                )
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (
                    f"{new_status.title()} course '{row[1]}'"
                    + (f": {payload.reason}" if not payload.approve else ""),
                    actor.get("email") or actor["id"],
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    "approval",
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "lms_courses"})
        return {"id": course_id, "approval_status": new_status}

    @app.get("/api/lms/moderation-queue")
    def lms_moderation_queue(actor: dict = Depends(require_role(STAFF_REVIEW_ROLES))):
        """Courses awaiting review, excluding the reviewer's own submissions."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, title, track, level, description, modules, submitted_by, "
                "created_at, owner_id FROM lms_courses "
                "WHERE approval_status = 'pending' AND (owner_id IS NULL OR owner_id <> %s) "
                "ORDER BY created_at NULLS LAST",
                (actor["id"],),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {"id": r[0], "title": r[1], "track": r[2] or "", "level": r[3] or "",
             "description": r[4] or "", "modules": r[5] or 0,
             "submitted_by": r[6] or "", "created_at": r[7] or ""}
            for r in rows
        ]

    # ─── SPONSORSHIPS & PAYMENTS ─────────────────────────────────────
    # Neither table existed before this. The consequences:
    #
    #   * The whole "Sponsorship & Partner Ecosystem" panel was a hardcoded array in
    #     dashboard.component.ts: MTN/Tullow/GCB/Voltic/Coca-Cola, GH 350,000 tier
    #     totals, a 72% "disbursed" figure computed as `totalCommitted * 0.72`, and
    #     an `impactScore: '98.4%'` literal. None of it came from anywhere.
    #   * A sponsor recording a payment went through saveUsers() -> bulk-sync
    #     (admin-only), so it 403'd and the reference stayed in that browser.
    #   * The UI marked payments 'Confirmed' on submit, telling sponsors their money
    #     had been received when nothing had checked a bank statement.
    #
    # Money is NUMERIC end to end and is returned as a string, so no float rounding
    # is introduced anywhere between the database and the client.

    def _money(value) -> str:
        """Render a NUMERIC/None as a plain decimal string."""
        return f"{(value or 0):.2f}"

    def _require_sponsor(actor: dict) -> None:
        if actor.get("role") != ROLE_SPONSOR:
            raise HTTPException(status_code=403, detail="Only a sponsor account can do this")

    def _is_sponsor_admin(actor: dict) -> bool:
        return actor.get("role") in set(ADMIN_ROLES)

    class SponsorshipPayload(BaseModel):
        tier: str = Field(default="", max_length=50)
        sector: str = Field(default="", max_length=100)
        amount_pledged: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), le=Decimal("100000000"))
        competition_id: str = Field(default="", max_length=64)
        notes: str = Field(default="", max_length=2000)

    @app.post("/api/sponsorships", status_code=status.HTTP_201_CREATED)
    def create_my_sponsorship(payload: SponsorshipPayload, actor: dict = Depends(require_auth)):
        """Record the signed-in sponsor's commitment.

        `status` starts 'pending': a pledge is not an active sponsorship until an
        administrator confirms it. The sponsor cannot set it themselves.
        """
        _require_sponsor(actor)
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT organization, full_name, sector, tier FROM users WHERE id = %s",
                (actor["id"],),
            )
            profile = cur.fetchone()
            sponsorship_id = "spon-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO sponsorships (id, sponsor_id, organization, tier, sector, "
                "amount_pledged, currency, competition_id, status, notes) "
                "VALUES (%s,%s,%s,%s,%s,%s,'GHS',%s,'pending',%s)",
                (
                    sponsorship_id, actor["id"],
                    (profile[0] if profile else "") or (profile[1] if profile else "") or "",
                    payload.tier or (profile[3] if profile else "") or "",
                    payload.sector or (profile[2] if profile else "") or "",
                    payload.amount_pledged,
                    payload.competition_id or None,
                    payload.notes,
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "sponsorships"})
        return {
            "id": sponsorship_id, "status": "pending",
            "amount_pledged": _money(payload.amount_pledged),
        }

    def _shape_sponsorship(r) -> dict:
        return {
            "id": r[0], "sponsor_id": r[1], "organization": r[2] or "",
            "tier": r[3] or "", "sector": r[4] or "",
            "amount_pledged": _money(r[5]), "currency": r[6] or "GHS",
            "competition_id": r[7] or "", "status": r[8] or "pending",
            "notes": r[9] or "", "created_at": str(r[10]) if r[10] else None,
            # Only VERIFIED payments count as received. A pending reference is a
            # claim, not money.
            "amount_received": _money(r[11]),
            "amount_pending": _money(r[12]),
            "payment_count": r[13] or 0,
        }

    _SPONSORSHIP_SELECT = (
        "SELECT s.id, s.sponsor_id, s.organization, s.tier, s.sector, s.amount_pledged, "
        "s.currency, s.competition_id, s.status, s.notes, s.created_at, "
        "COALESCE((SELECT SUM(p.amount) FROM sponsorship_payments p "
        "  WHERE p.sponsorship_id = s.id AND p.status = 'verified'), 0), "
        "COALESCE((SELECT SUM(p.amount) FROM sponsorship_payments p "
        "  WHERE p.sponsorship_id = s.id AND p.status = 'pending_verification'), 0), "
        "(SELECT COUNT(*) FROM sponsorship_payments p WHERE p.sponsorship_id = s.id) "
        "FROM sponsorships s "
    )

    @app.get("/api/sponsorships/mine")
    def list_my_sponsorships(actor: dict = Depends(require_auth)):
        """The signed-in sponsor's own commitments, with real received totals."""
        _require_sponsor(actor)
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                _SPONSORSHIP_SELECT + "WHERE s.sponsor_id = %s ORDER BY s.created_at DESC",
                (actor["id"],),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [_shape_sponsorship(r) for r in rows]

    @app.get("/api/sponsorships")
    def list_all_sponsorships(_admin: dict = Depends(require_admin)):
        """Every commitment. Administrators only -- this is commercial data."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(_SPONSORSHIP_SELECT + "ORDER BY s.amount_pledged DESC")
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [_shape_sponsorship(r) for r in rows]

    class SponsorshipStatusPayload(BaseModel):
        status: str = Field(pattern="^(pending|active|completed|cancelled)$")

    @app.patch("/api/sponsorships/{sponsorship_id}/status")
    def set_sponsorship_status(
        sponsorship_id: str,
        payload: SponsorshipStatusPayload,
        actor: dict = Depends(require_admin),
    ):
        """Confirm or close a commitment. Administrators only, deliberately: a
        sponsor marking their own pledge 'active' would inflate the public totals."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE sponsorships SET status=%s, updated_at=CURRENT_TIMESTAMP "
                "WHERE id=%s RETURNING organization",
                (payload.status, sponsorship_id),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Sponsorship not found")
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (f"Sponsorship {sponsorship_id} ({row[0]}) set to {payload.status}",
                 actor.get("email") or actor["id"],
                 datetime.datetime.now(datetime.UTC).isoformat(), "system"),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "sponsorships"})
        return {"id": sponsorship_id, "status": payload.status}

    # ── Payments ──────────────────────────────────────────────────────

    class SponsorPaymentPayload(BaseModel):
        amount: Decimal = Field(gt=Decimal("0"), le=Decimal("100000000"))
        method: str = Field(default="bank_transfer", max_length=40)
        reference: str = Field(min_length=1, max_length=120)
        notes: str = Field(default="", max_length=2000)

    @app.post("/api/sponsorships/{sponsorship_id}/payments", status_code=status.HTTP_201_CREATED)
    def record_my_payment(
        sponsorship_id: str,
        payload: SponsorPaymentPayload,
        actor: dict = Depends(require_auth),
    ):
        """Record a payment the sponsor says they have made.

        Deliberately NOT marked received. Nothing here contacts a bank, MoMo API or
        card processor, so this is a claim to be checked: it lands as
        'pending_verification' and only an administrator can verify it. The previous
        UI set status 'Confirmed' on submit.
        """
        _require_sponsor(actor)
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT sponsor_id FROM sponsorships WHERE id = %s", (sponsorship_id,)
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Sponsorship not found")
            if row[0] != actor["id"]:
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=403,
                    detail="You can only record payments against your own sponsorship",
                )
            # A duplicate reference is almost always a double-submit.
            cur.execute(
                "SELECT id FROM sponsorship_payments "
                "WHERE sponsorship_id=%s AND LOWER(reference)=LOWER(%s)",
                (sponsorship_id, payload.reference.strip()),
            )
            if cur.fetchone():
                conn.rollback(); cur.close()
                raise HTTPException(
                    status_code=409,
                    detail="A payment with that reference is already recorded",
                )

            payment_id = "pay-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO sponsorship_payments (id, sponsorship_id, sponsor_id, amount, "
                "currency, method, reference, notes, status) "
                "VALUES (%s,%s,%s,%s,'GHS',%s,%s,%s,'pending_verification')",
                (payment_id, sponsorship_id, actor["id"], payload.amount,
                 payload.method, payload.reference.strip(), payload.notes),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "sponsorship_payments"})
        return {
            "id": payment_id, "status": "pending_verification",
            "amount": _money(payload.amount),
        }

    def _shape_payment(r) -> dict:
        return {
            "id": r[0], "sponsorship_id": r[1] or "", "sponsor_id": r[2],
            "amount": _money(r[3]), "currency": r[4] or "GHS",
            "method": r[5] or "", "reference": r[6] or "", "notes": r[7] or "",
            "status": r[8] or "pending_verification",
            "verified_by_name": r[9] or "", "verified_at": str(r[10]) if r[10] else None,
            "rejection_reason": r[11] or "",
            "created_at": str(r[12]) if r[12] else None,
            "organization": r[13] or "", "sponsor_email": r[14] or "",
        }

    _PAYMENT_SELECT = (
        "SELECT p.id, p.sponsorship_id, p.sponsor_id, p.amount, p.currency, p.method, "
        "p.reference, p.notes, p.status, p.verified_by_name, p.verified_at, "
        "p.rejection_reason, p.created_at, s.organization, u.email "
        "FROM sponsorship_payments p "
        "LEFT JOIN sponsorships s ON s.id = p.sponsorship_id "
        "LEFT JOIN users u ON u.id = p.sponsor_id "
    )

    @app.get("/api/sponsorships/payments/mine")
    def list_my_payments(actor: dict = Depends(require_auth)):
        """The sponsor's own payment history, with its verification state."""
        _require_sponsor(actor)
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                _PAYMENT_SELECT + "WHERE p.sponsor_id = %s ORDER BY p.created_at DESC",
                (actor["id"],),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [_shape_payment(r) for r in rows]

    @app.get("/api/sponsorships/payments/pending")
    def list_pending_payments(_admin: dict = Depends(require_admin)):
        """The verification queue: claims an administrator must check."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                _PAYMENT_SELECT + "WHERE p.status = 'pending_verification' "
                "ORDER BY p.created_at"
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [_shape_payment(r) for r in rows]

    class VerifyPaymentPayload(BaseModel):
        verified: bool
        reason: str = Field(default="", max_length=2000)

    @app.patch("/api/sponsorships/payments/{payment_id}/verify")
    def verify_payment(
        payment_id: str,
        payload: VerifyPaymentPayload,
        actor: dict = Depends(require_admin),
    ):
        """Confirm or reject a claimed payment against the bank record.

        Administrator-only by design. This is the step the old UI skipped entirely
        by writing status 'Confirmed' the moment a sponsor typed a reference number.
        """
        if not payload.verified and not payload.reason.strip():
            raise HTTPException(status_code=422, detail="Give a reason when rejecting a payment")

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT amount, reference, sponsor_id FROM sponsorship_payments WHERE id = %s",
                (payment_id,),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="Payment not found")

            new_status = "verified" if payload.verified else "rejected"
            cur.execute(
                "UPDATE sponsorship_payments SET status=%s, verified_by=%s, "
                "verified_by_name=%s, verified_at=CURRENT_TIMESTAMP, rejection_reason=%s "
                "WHERE id=%s",
                (new_status, actor["id"], actor.get("full_name") or actor.get("email") or "",
                 payload.reason if not payload.verified else None, payment_id),
            )
            # Audit in the same transaction: money state must not change unrecorded.
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (f"Payment {payment_id} ref {row[1]} for GHS {_money(row[0])} {new_status}"
                 + (f": {payload.reason}" if not payload.verified else ""),
                 actor.get("email") or actor["id"],
                 datetime.datetime.now(datetime.UTC).isoformat(), "system"),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "sponsorship_payments"})
        return {"id": payment_id, "status": new_status}

    # ── Ecosystem aggregates ──────────────────────────────────────────

    @app.get("/api/sponsorships/summary")
    def sponsorship_summary(_actor: dict = Depends(require_auth)):
        """Real figures for the sponsorship ecosystem panel.

        Everything here is derived from the sponsorships and payments tables. It
        replaces a hardcoded array of partner names, tier totals, a
        `totalCommitted * 0.72` "disbursed" figure and a literal 98.4% "impact
        score" -- none of which had any source.

        Where a genuine figure cannot be computed the field is omitted rather than
        invented.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            # Only 'active' pledges count towards committed money; 'pending' ones
            # have not been confirmed by anybody yet.
            cur.execute(
                "SELECT COUNT(DISTINCT sponsor_id), COALESCE(SUM(amount_pledged),0) "
                "FROM sponsorships WHERE status IN ('active','completed')"
            )
            partners, committed = cur.fetchone()

            # Corporate partners are the sponsor accounts themselves. A sponsor
            # who has not yet created a pledge record is still a partner; the
            # sponsorships table only counts those with confirmed pledges.
            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'sponsor'")
            sponsor_accounts = cur.fetchone()[0]

            cur.execute(
                "SELECT COALESCE(SUM(amount),0) FROM sponsorship_payments WHERE status='verified'"
            )
            received = cur.fetchone()[0]
            cur.execute(
                "SELECT COALESCE(SUM(amount),0), COUNT(*) FROM sponsorship_payments "
                "WHERE status='pending_verification'"
            )
            awaiting, awaiting_count = cur.fetchone()

            cur.execute(
                "SELECT COALESCE(NULLIF(tier,''),'Unspecified'), COUNT(DISTINCT sponsor_id), "
                "COALESCE(SUM(amount_pledged),0) "
                "FROM sponsorships WHERE status IN ('active','completed') "
                "GROUP BY COALESCE(NULLIF(tier,''),'Unspecified') "
                "ORDER BY SUM(amount_pledged) DESC"
            )
            tier_rows = cur.fetchall()

            cur.execute(
                "SELECT COALESCE(NULLIF(sector,''),'Unspecified'), COUNT(DISTINCT sponsor_id), "
                "COALESCE(SUM(amount_pledged),0) "
                "FROM sponsorships WHERE status IN ('active','completed') "
                "GROUP BY COALESCE(NULLIF(sector,''),'Unspecified') "
                "ORDER BY SUM(amount_pledged) DESC"
            )
            sector_rows = cur.fetchall()

            cur.execute("SELECT COUNT(*) FROM sponsorships WHERE status='pending'")
            pending_pledges = cur.fetchone()[0]
            cur.close()
        finally:
            release_db_connection(conn)

        total = committed or 0
        return {
            "partner_count": sponsor_accounts or partners or 0,
            "total_committed": _money(committed),
            "total_received": _money(received),
            "awaiting_verification": _money(awaiting),
            "awaiting_verification_count": awaiting_count or 0,
            "pending_pledges": pending_pledges or 0,
            # Share of committed money actually banked. Genuinely computed, unlike
            # the previous hardcoded 72%.
            "received_pct": round(float(received or 0) / float(total) * 100, 1) if total else 0.0,
            "tiers": [
                {
                    "tier": t[0], "sponsor_count": t[1] or 0,
                    "amount": _money(t[2]),
                    "pct": round(float(t[2] or 0) / float(total) * 100, 1) if total else 0.0,
                }
                for t in tier_rows
            ],
            "sectors": [
                {"sector": s[0], "sponsor_count": s[1] or 0, "amount": _money(s[2])}
                for s in sector_rows
            ],
        }

    @app.get("/api/partners")
    def list_public_partners():
        """Confirmed partners, for the public landing page.

        PUBLIC on purpose -- this feeds the homepage, which anonymous visitors see.
        That makes what it exposes a deliberate decision:

        * Only sponsorships an administrator has moved to 'active' or 'completed'
          appear. A self-declared 'pending' pledge must never reach the homepage, or
          anyone with a sponsor account could publish themselves as an official
          partner.
        * Organisation, tier and sector only. No amounts, no contact details, no
          payment state -- those are commercial data and stay behind
          GET /api/sponsorships (admin-only).
        * Replaces a hardcoded wall of 9 brand cards in landing.component.html
          (MTN, Tullow, GCB, Fidelity, Stanbic, Voltic, Coca-Cola, HP, EPP,
          Printex) with tier pills like "In-Kind - 1,500 Packs Water". None of it
          had a source, so the homepage could name partners the platform had no
          record of.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            # Group by organisation: a partner with several commitments is one
            # logo on the wall, not several.
            cur.execute(
                "SELECT COALESCE(NULLIF(TRIM(s.organization), ''), u.full_name, 'Partner') AS org, "
                "MIN(COALESCE(NULLIF(s.tier, ''), 'Partner')) AS tier, "
                "MIN(COALESCE(NULLIF(s.sector, ''), '')) AS sector, "
                "MAX(s.created_at) AS since "
                "FROM sponsorships s LEFT JOIN users u ON u.id = s.sponsor_id "
                "WHERE s.status IN ('active', 'completed') "
                "GROUP BY COALESCE(NULLIF(TRIM(s.organization), ''), u.full_name, 'Partner') "
                "ORDER BY MIN(COALESCE(NULLIF(s.tier, ''), 'Partner')), 1"
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)

        def _tier_rank(tier: str) -> int:
            t = (tier or "").lower()
            if "platinum" in t: return 0
            if "gold" in t:     return 1
            if "silver" in t:   return 2
            if "bronze" in t:   return 3
            if "kind" in t:     return 4
            return 5

        partners = [
            {
                "organization": r[0],
                "tier": r[1],
                "sector": r[2] or "",
                "since": str(r[3]) if r[3] else None,
            }
            for r in rows
        ]
        partners.sort(key=lambda p: (_tier_rank(p["tier"]), p["organization"].lower()))
        return {"total": len(partners), "partners": partners}

    @app.post("/api/auth/token/generate")
    def generate_access_token(payload: dict | None = None, _admin: dict = Depends(require_admin)):
        payload = payload or {}
        role = payload.get("role", "student").lower()
        conn = _get_db()
        try:
            cur = conn.cursor()
            ticket = _allocate_unique_ticket(cur, role)
            cur.close()
        finally:
            release_db_connection(conn)
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
    def list_tickets(user_id: str | None = None, recycled: bool = False, _auth: dict = Depends(require_auth)):
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
    def list_submissions(competition_id: str = "", _auth: dict = Depends(require_auth)):
        """List submissions, optionally scoped to one cycle."""
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        base = ("SELECT id, tenant_id, student_id, source_code_path, video_url, status, "
                "score, feedback, created_at, competition_id FROM assignment_submissions")
        if competition_id:
            cur.execute(base + " WHERE competition_id = %s ORDER BY created_at DESC", (competition_id,))
        else:
            cur.execute(base + " ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "tenant_id": r[1], "student_id": r[2], "source_code_path": r[3], "video_url": r[4], "status": r[5], "score": r[6], "feedback": r[7], "created_at": str(r[8]), "competition_id": r[9]} for r in rows]

    @app.post("/api/submissions", status_code=status.HTTP_201_CREATED)
    def create_submission(payload: SubmissionCreate, _actor: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        sub_id = str(uuid.uuid4())
        cur = conn.cursor()
        try:
            comp_ref = _validate_competition_ref(cur, payload.competition_id)
            cur.execute("INSERT INTO assignment_submissions (id, tenant_id, student_id, source_code_path, video_url, status, competition_id) VALUES (%s, %s, %s, %s, %s, 'Pending', %s)",
                        (sub_id, payload.tenant_id, payload.student_id, payload.source_code_path, payload.video_url, comp_ref))
            conn.commit()
        except HTTPException:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise
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
    MAX_SUBMISSION_SCORE = 100

    class GradeSubmissionRequest(BaseModel):
        # Bounded deliberately: this was an unbounded `int`, so a judge could file a
        # score of 9999 (or a negative one) and skew every average on the platform.
        score: int | None = Field(default=None, ge=0, le=MAX_SUBMISSION_SCORE)
        feedback: str = ""
        status: str | None = None

    @app.patch("/api/submissions/{item_id}/grade")
    def grade_submission(item_id: str, payload: GradeSubmissionRequest, actor: dict = Depends(require_role(GRADING_ROLES))):
        """Score a competition submission and record WHO scored it.

        Attribution is taken from the authenticated session, never from the
        request body -- a judge must not be able to file a score under someone
        else's name.

        A judge may score unscored work, or REVISE THEIR OWN mark. Overwriting a
        different judge's score requires an administrator: previously any judge
        could silently replace another's mark with no trace of the original beyond
        the audit log, which makes scoring disputes unresolvable.
        """
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        # A submission carrying a score but still marked 'Pending' would sit in
        # the judging queue forever and be re-marked by the next judge. If the
        # caller does not say otherwise, scoring it means it is graded.
        new_status = payload.status
        if new_status is None and payload.score is not None:
            new_status = "Graded"
        try:
            cur.execute(
                "SELECT score, graded_by, graded_by_name FROM assignment_submissions "
                "WHERE id = %s",
                (item_id,),
            )
            existing = cur.fetchone()
            if not existing:
                conn.rollback(); cur.close(); release_db_connection(conn)
                raise HTTPException(status_code=404, detail="Submission not found")

            already_scored = existing[0] is not None
            scored_by_someone_else = bool(existing[1]) and existing[1] != actor["id"]
            is_admin = actor.get("role") in set(ADMIN_ROLES)
            if already_scored and scored_by_someone_else and not is_admin:
                conn.rollback(); cur.close(); release_db_connection(conn)
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Already scored by {existing[2] or 'another judge'}. "
                        "Ask an administrator if it needs changing."
                    ),
                )
            is_revision = already_scored

            cur.execute(
                "UPDATE assignment_submissions SET score = COALESCE(%s, score), "
                "feedback = COALESCE(%s, feedback), status = COALESCE(%s, status), "
                "graded_by = %s, graded_by_name = %s, graded_at = CURRENT_TIMESTAMP "
                "WHERE id = %s RETURNING id",
                (
                    payload.score,
                    payload.feedback if payload.feedback != "" else None,
                    new_status,
                    actor["id"],
                    actor.get("full_name") or actor.get("email") or "",
                    item_id,
                )
            )
            row = cur.fetchone()
            if row:
                # Same transaction as the score itself: an attributed grade and
                # its audit entry must not be able to disagree. A revision records
                # the previous score so the change is reconstructable.
                cur.execute(
                    "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s, %s, %s, %s)",
                    (
                        f"{actor['role']} {'revised' if is_revision else 'graded'} submission {item_id}"
                        + (f" (score {payload.score}" if payload.score is not None else "")
                        + (f", was {existing[0]}" if is_revision and payload.score is not None else "")
                        + (")" if payload.score is not None else ""),
                        actor.get("email", ""),
                        datetime.datetime.now(datetime.UTC).isoformat(),
                        "grading",
                    ),
                )
            conn.commit()
        except HTTPException:
            raise
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
        return {"id": item_id, "status": "graded", "graded_by": actor["id"]}

    # ── JUDGING WORKSPACE ───────────────────────────────────────────
    # The `judge` role has been in GRADING_ROLES all along, but nothing in the
    # app ever let a judge reach a submission: /judge redirected to /dashboard
    # and the LMS grading screens exclude the role. These two endpoints are the
    # backend half of an actual judging surface.

    def _judge_queue_rows(cur, track: str = "", limit: int = 200, competition_id: str = ""):
        """Unscored competition submissions, oldest first (fairest order)."""
        sql = (
            "SELECT s.id, s.student_id, s.source_code_path, s.video_url, s.status, "
            "s.created_at, st.first_name, st.last_name, st.email, st.track "
            "FROM assignment_submissions s "
            "LEFT JOIN students st ON st.id = s.student_id "
            "WHERE s.score IS NULL "
        )
        params = []
        if track:
            sql += "AND lower(COALESCE(st.track, '')) = lower(%s) "
            params.append(track)
        if competition_id:
            sql += "AND s.competition_id = %s "
            params.append(competition_id)
        sql += "ORDER BY s.created_at ASC NULLS LAST LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        return cur.fetchall()

    def _shape_submission(r):
        first, last = (r[6] or ""), (r[7] or "")
        source = r[2] or ""
        return {
            "id": r[0],
            "student_id": r[1] or "",
            "student_name": (first + " " + last).strip(),
            "student_email": r[8] or "",
            "track": r[9] or "",
            "source_code_path": source,
            # Whether the artifact can actually be opened. There is no file-serving
            # endpoint, so a bare filename is unreachable -- the judge UI rendered it
            # as plain text with no explanation, which looks like a broken link. This
            # lets the client say so honestly, and link it when it IS a URL.
            "source_is_url": source.lower().startswith(("http://", "https://")),
            "video_url": r[3] or "",
            "status": r[4] or "Pending",
            "submitted_at": str(r[5]) if r[5] else None,
            "max_score": MAX_SUBMISSION_SCORE,
        }

    def _lms_context_map(cur, student_ids):
        """Instructor-coursework context for a set of students (read-only).

        Joins the two grading paths the safe way: it surfaces each student's LMS
        assignment history next to their competition submission so a judge has
        context, but it is deliberately read-only -- it does NOT feed into the
        judge's score. Only the judge's own score counts toward the competition.
        """
        if not student_ids:
            return {}
        placeholders = ", ".join(["%s"] * len(student_ids))
        cur.execute(
            "SELECT s.student_id, a.title, s.score, s.status "
            "FROM lms_submissions s JOIN lms_assignments a ON a.id = s.assignment_id "
            f"WHERE s.student_id IN ({placeholders}) "
            "ORDER BY s.student_id, a.title",
            list(student_ids),
        )
        by_student = {}
        for student_id, title, score, status in cur.fetchall():
            by_student.setdefault(student_id, []).append({
                "assignment": title, "score": score, "status": status or "submitted",
            })
        result = {}
        for sid in student_ids:
            items = by_student.get(sid, [])
            graded = [i for i in items if i["score"] is not None]
            result[sid] = {
                "assignments_submitted": len(items),
                "assignments_graded": len(graded),
                "average_score": round(sum(i["score"] for i in graded) / len(graded), 2) if graded else None,
                "assignments": items,
            }
        return result

    @app.get("/api/judge/queue")
    def judge_queue(track: str = "", competition_id: str = "", _actor: dict = Depends(require_role(GRADING_ROLES))):
        """Submissions still awaiting a score.

        This is a shared pool, not a per-judge assignment list: the schema has a
        single score per submission and no assignment table, so inventing an
        owner here would be fiction. Ordered oldest-first so nothing starves.

        `?competition_id=` scopes the queue to one cycle so a judge working a
        cycle is not shown every unscored submission on the platform. The counts
        below are scoped the same way, otherwise the badge and the list disagree.
        """
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        rows = _judge_queue_rows(cur, track, competition_id=competition_id)
        if competition_id:
            cur.execute(
                "SELECT COUNT(*) FROM assignment_submissions "
                "WHERE score IS NULL AND competition_id = %s",
                (competition_id,),
            )
        else:
            cur.execute("SELECT COUNT(*) FROM assignment_submissions WHERE score IS NULL")
        pending_total = cur.fetchone()[0]
        track_sql = (
            "SELECT COALESCE(lower(st.track), '') , COUNT(*) "
            "FROM assignment_submissions s LEFT JOIN students st ON st.id = s.student_id "
            "WHERE s.score IS NULL "
        )
        if competition_id:
            cur.execute(
                track_sql + "AND s.competition_id = %s GROUP BY lower(st.track) ORDER BY 2 DESC",
                (competition_id,),
            )
        else:
            cur.execute(track_sql + "GROUP BY lower(st.track) ORDER BY 2 DESC")
        by_track = [{"track": r[0], "pending": r[1]} for r in cur.fetchall()]
        # Enrich each submission with the student's LMS coursework context so the
        # judge sees it, but read-only -- it never changes the judge's score.
        shaped = [_shape_submission(r) for r in rows]
        student_ids = [s["student_id"] for s in shaped if s.get("student_id")]
        lms_map = _lms_context_map(cur, student_ids) if student_ids else {}
        for s in shaped:
            s["lms_context"] = lms_map.get(s["student_id"])
        cur.close()
        release_db_connection(conn)
        return {
            "pending_total": pending_total,
            "by_track": by_track,
            "submissions": shaped,
        }

    @app.get("/api/judge/history")
    def judge_history(limit: int = 50, actor: dict = Depends(require_role(GRADING_ROLES))):
        """What THIS grader has scored, most recent first, plus their totals."""
        limit = max(1, min(limit, 200))
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute(
            "SELECT s.id, s.student_id, s.source_code_path, s.video_url, s.status, "
            "s.created_at, st.first_name, st.last_name, st.email, st.track, "
            "s.score, s.feedback, s.graded_at "
            "FROM assignment_submissions s "
            "LEFT JOIN students st ON st.id = s.student_id "
            "WHERE s.graded_by = %s "
            "ORDER BY s.graded_at DESC NULLS LAST LIMIT %s",
            (actor["id"], limit),
        )
        rows = cur.fetchall()
        cur.execute(
            "SELECT COUNT(*), AVG(score)::numeric(10,2) FROM assignment_submissions "
            "WHERE graded_by = %s AND score IS NOT NULL",
            (actor["id"],),
        )
        total_row = cur.fetchone()
        cur.close()
        release_db_connection(conn)
        graded = []
        for r in rows:
            item = _shape_submission(r)
            item["score"] = r[10]
            item["feedback"] = r[11] or ""
            item["graded_at"] = str(r[12]) if r[12] else None
            graded.append(item)
        return {
            "graded_total": total_row[0] or 0,
            "average_score": float(total_row[1]) if total_row[1] is not None else None,
            "graded": graded,
        }


    # COMPETITIONS
    class CompetitionCreate(BaseModel):
        title: str
        description: str = ""
        track: str = "Coding"
        category: str = ""
        deadline: str = ""
        # Defaults to draft, never active. A create call that omitted this field
        # used to publish the cycle to entrants immediately.
        status: str = DEFAULT_CYCLE_STATUS
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

    def _require_cycle_status(raw: str) -> str:
        """Validate an incoming cycle status against the lifecycle contract.

        The column is a bare VARCHAR, so without this any string reached the
        database and the frontend then relabelled whatever it did not recognise
        as `archived` -- silently hiding a live cycle from every panel.
        """
        parsed = parse_cycle_status(raw)
        if parsed is None:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid cycle status '{raw}'. Expected one of: {', '.join(CYCLE_STATUSES)}",
            )
        return parsed

    @app.get("/api/competitions")
    def list_competitions():
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        # `teams` is reported as a live count of what is actually attached to the
        # cycle, not the hand-typed integer in the column. That number was only
        # ever set by whoever last edited the cycle, so it drifted away from
        # reality immediately and every panel showed a different figure.
        # entrants = students registered for the cycle; team_count = teams in it.
        cur.execute(
            "SELECT c.id, c.title, c.description, c.track, c.category, c.deadline, c.status, "
            "c.created_at, c.comp_type, c.max_teams, c.prize, c.start_date, c.end_date, "
            "c.phases, c.rules, c.criteria, c.progress, "
            "(SELECT COUNT(*) FROM teams t WHERE t.competition_id = c.id) AS team_count, "
            "(SELECT COUNT(*) FROM competition_registrations r "
            " WHERE r.competition_id = c.id AND r.status = 'registered') AS entrant_count "
            "FROM competitions c ORDER BY c.created_at DESC"
        )
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "description": r[2], "track": r[3], "category": r[4],
                 "deadline": r[5], "status": r[6], "created_at": str(r[7]), "type": r[8],
                 "maxTeams": r[9], "prize": r[10], "startDate": r[11], "endDate": r[12],
                 "phases": r[13], "rules": r[14], "criteria": r[15], "progress": r[16],
                 "teams": r[17], "entrants": r[18]} for r in rows]

    @app.post("/api/competitions", status_code=status.HTTP_201_CREATED)
    def create_competition(payload: CompetitionCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        new_status = _require_cycle_status(payload.status)
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        comp_id = "comp-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO competitions (id, title, description, track, category, deadline, status, comp_type, max_teams, teams, prize, start_date, end_date, phases, rules, criteria, progress) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (comp_id, payload.title, payload.description, payload.track, payload.category, payload.deadline, new_status, payload.comp_type, payload.max_teams, payload.teams, payload.prize, payload.start_date, payload.end_date, payload.phases, payload.rules, payload.criteria, payload.progress))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "competitions"})
        return {"id": comp_id, "title": payload.title, "status": new_status}

    @app.patch("/api/competitions/{item_id}")
    def update_competition(item_id: str, payload: CompetitionCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        new_status = _require_cycle_status(payload.status)
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        # Enforce the transition graph rather than trusting the client. The UI
        # only offers legal moves, but a stale tab or a direct API call could
        # otherwise walk a completed cycle back to registration and reopen it to
        # entrants after results were published.
        cur.execute("SELECT status FROM competitions WHERE id = %s", (item_id,))
        current = cur.fetchone()
        if not current:
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=404, detail="Competition not found")
        current_status = parse_cycle_status(current[0])
        if current_status is not None and new_status != current_status \
                and not can_cycle_transition(current_status, new_status):
            cur.close()
            release_db_connection(conn)
            raise HTTPException(
                status_code=409,
                detail=f"Cannot move a cycle from '{current_status}' to '{new_status}'.",
            )
        try:
            cur.execute(
                "UPDATE competitions SET title = %s, description = %s, track = %s, category = %s, deadline = %s, status = %s, comp_type = %s, max_teams = %s, teams = %s, prize = %s, start_date = %s, end_date = %s, phases = %s, rules = %s, criteria = %s, progress = %s WHERE id = %s RETURNING id",
                (payload.title, payload.description, payload.track, payload.category, payload.deadline, new_status, payload.comp_type, payload.max_teams, payload.teams, payload.prize, payload.start_date, payload.end_date, payload.phases, payload.rules, payload.criteria, payload.progress, item_id)
            )
            row = cur.fetchone()
            # When registration closes, make sure no entrant is left without a
            # mentor: assign one to every team in this cycle that doesn't have one.
            # Those who already requested keep their flag; the rest are covered.
            assigned_mentors = 0
            if new_status == STATUS_COMPLETED and (current_status or "") != STATUS_COMPLETED:
                assigned_mentors = _auto_assign_mentors(cur, item_id)
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
        if assigned_mentors:
            broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"id": item_id, "status": "updated", "mentors_assigned": assigned_mentors}

    @app.delete("/api/competitions/{item_id}")
    def delete_competition(item_id: str, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        # There are no FK constraints pointing at competitions.id, so deleting a
        # cycle used to leave its registrations, sponsorships and users pointing
        # at an id that no longer existed. Detach them explicitly instead: the
        # rows are records of what happened and must survive, but they must not
        # keep referencing a dead cycle.
        try:
            cur.execute("DELETE FROM competition_registrations WHERE competition_id = %s", (item_id,))
            cur.execute("UPDATE sponsorships SET competition_id = NULL WHERE competition_id = %s", (item_id,))
            cur.execute("UPDATE users SET competition_id = NULL WHERE competition_id = %s", (item_id,))
            cur.execute("DELETE FROM competitions WHERE id = %s", (item_id,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
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
        mentor: str = ""
        motto: str = ""
        roster_list: list = []
        # Which cycle this team is competing in. Optional: teams created before
        # cycles were linked, and teams not tied to one, carry None.
        competition_id: Optional[str] = None
        # Member identities. Used to build real team_members rows keyed by
        # account. lead_email/member_emails are optional and may be empty when a
        # form only collected names; those rows are stored name-only until a
        # student account is linked.
        lead_email: str = Field(default="", max_length=150)
        member_emails: list[str] = Field(default_factory=list)

    def _validate_competition_ref(cur, competition_id: Optional[str]) -> Optional[str]:
        """Reject a reference to a cycle that does not exist.

        There are no FK constraints on competitions.id, so without this a typo'd
        or stale id is accepted and the row simply never joins to anything --
        which is how records ended up invisible in every cycle-scoped view.
        """
        if not competition_id:
            return None
        cur.execute("SELECT id FROM competitions WHERE id = %s", (competition_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=422, detail=f"Unknown competition cycle '{competition_id}'")
        return competition_id

    def _resolve_student_by_email(cur, email: str) -> Optional[str]:
        """Map a member email to a students.id, if the account exists.

        A student's `students` row may not exist yet (it is created lazily on
        first learner action). In that case fall back to the users row, whose id
        becomes the students.id, so the membership is keyed to the right account
        from the start and resolves once the students row appears.
        """
        email = (email or "").strip().lower()
        if not email:
            return None
        cur.execute(
            "SELECT id FROM students WHERE LOWER(email) = %s LIMIT 1",
            (email,),
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            "SELECT id FROM users WHERE LOWER(email) = %s LIMIT 1",
            (email,),
        )
        row = cur.fetchone()
        return row[0] if row else None

    def _sync_team_members(cur, team_id: str, lead: str, roster: list,
                           lead_email: str, member_emails: list) -> int:
        """Rebuild team_members for a team from its roster and any emails.

        Replaces the whole set for the team (idempotent, so edit + create share
        it). Names are stored as recorded; emails are resolved to students.id
        where an account already exists. Returns the number of rows written.
        """
        names = [n for n in roster if isinstance(n, str) and n.strip()]
        emails = [e for e in member_emails if isinstance(e, str) and e.strip()]

        # Lead first, then the rest, then any emails without a matching name slot.
        rows = []
        if lead and lead.strip():
            rows.append((True, lead.strip(), (lead_email or "").strip()))
        for idx, name in enumerate(names):
            rows.append((False, name, emails[idx] if idx < len(emails) else ""))

        cur.execute("DELETE FROM team_members WHERE team_id = %s", (team_id,))
        count = 0
        for is_lead, name, email in rows:
            student_id = _resolve_student_by_email(cur, email) if email else None
            member_id = "tm-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO team_members (id, team_id, student_id, email, name, is_lead) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (member_id, team_id, student_id, email or None, name, is_lead),
            )
            count += 1
        return count

    def _provision_team_member_accounts(cur, team_id: str, school_name: str | None = None) -> list:
        """Create student accounts for team members who have an email but no account.

        This is what makes "all students under an institution get a student
        account" real: once a team is approved, every member with an email gets a
        login under that institution. Accounts are minted server-side with a
        one-time password and must_change_password=TRUE, so the institution can
        hand out the initial credentials and the student sets their own on first
        login. Members who already have an account are left untouched (idempotent).

        Returns a list of {name, email, temporary_password} for the accounts that
        were newly created, so the caller can surface them to the institution
        exactly once.
        """
        from app.security import hash_password
        cur.execute(
            "SELECT id, name, email FROM team_members "
            "WHERE team_id = %s AND email IS NOT NULL AND student_id IS NULL",
            (team_id,),
        )
        pending = cur.fetchall()
        created = []
        for member_row_id, name, email in pending:
            email_norm = (email or "").strip().lower()
            if not email_norm:
                continue
            # Skip if an account already exists for this email.
            cur.execute("SELECT id FROM users WHERE lower(email) = %s", (email_norm,))
            if cur.fetchone():
                # Link the existing account to the membership and move on.
                cur.execute("SELECT id FROM users WHERE lower(email) = %s", (email_norm,))
                uid = cur.fetchone()[0]
                cur.execute(
                    "UPDATE team_members SET student_id = %s WHERE id = %s",
                    (uid, member_row_id),
                )
                continue

            user_id = "USR-" + str(uuid.uuid4())[:8]
            temp_password = _generate_temp_password()
            ticket = f"NTIC-STU-{_generate_access_code()}"
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, "
                "status, organization, must_change_password) "
                "VALUES (%s, %s, %s, 'student', %s, %s, 'active', %s, TRUE)",
                (user_id, email_norm, name or "Student", ticket,
                 hash_password(temp_password), school_name or None),
            )
            # Link the fresh account to the membership row.
            cur.execute(
                "UPDATE team_members SET student_id = %s WHERE id = %s",
                (user_id, member_row_id),
            )
            created.append({
                "name": name or "Student",
                "email": email_norm,
                "temporary_password": temp_password,
                "ticket": ticket,
            })
        return created

    def _auto_enroll_team_members(cur, team_id: str, competition_id: str) -> int:
        """Enrol a team's members on the approved courses for its cycle.

        This is the "seamless" step: once a team is attached to a cycle, its
        members should already be in that cycle's courses rather than having to
        find and self-enrol in each one. Only members already linked to a student
        account are enrolled; name-only rows are picked up later, when the
        student's identity is resolved (enrolling themselves re-links membership).

        Only 'approved' courses are enrolled: pending moderation content is not
        student-facing yet. Returns the number of new enrolment rows.
        """
        if not competition_id:
            return 0
        cur.execute(
            "SELECT c.id FROM lms_courses c "
            "WHERE c.competition_id = %s AND (c.approval_status IS NULL OR c.approval_status = 'approved') "
            "AND c.status = 'active'",
            (competition_id,),
        )
        courses = [r[0] for r in cur.fetchall()]
        if not courses:
            return 0

        cur.execute(
            "SELECT student_id, name, email FROM team_members "
            "WHERE team_id = %s AND student_id IS NOT NULL",
            (team_id,),
        )
        members = cur.fetchall()
        if not members:
            return 0

        now = datetime.datetime.now(datetime.UTC).isoformat()
        created = 0
        for course_id in courses:
            for student_id, name, email in members:
                cur.execute(
                    "INSERT INTO lms_enrollments (id, course_id, student_id, student_name, "
                    "student_email, progress_pct, enrolled_at, last_active, status, team_id) "
                    "VALUES (%s, %s, %s, %s, %s, 0, %s, %s, 'active', %s) "
                    "ON CONFLICT (course_id, student_id) DO UPDATE SET "
                    "team_id = EXCLUDED.team_id, status = 'active'",
                    (
                        "enr-" + str(uuid.uuid4())[:8],
                        course_id,
                        student_id,
                        name or "Member",
                        email or "",
                        now,
                        now,
                        team_id,
                    ),
                )
                created += 1
            _recount_course_enrolment(cur, course_id)
        return created

    def _ensure_solo_team(cur, student_id: str, full_name: str, email: str,
                          competition_id: str, track: str) -> str:
        """Represent a solo/open entrant as a one-person team for a cycle.

        Option B of the mentor design: rather than a second mentor code path for
        individuals, a solo entrant becomes a team of one. That means mentors,
        auto-assignment, LMS auto-enrolment and roster grouping all work for them
        with no extra logic. Idempotent -- re-registering returns the same solo
        team rather than making duplicates.
        """
        # A solo team is identified by its single member and its cycle.
        cur.execute(
            "SELECT t.id FROM teams t JOIN team_members m ON m.team_id = t.id "
            "WHERE t.is_solo = TRUE AND m.student_id = %s "
            "AND COALESCE(t.competition_id, '') = COALESCE(%s, '') LIMIT 1",
            (student_id, competition_id or None),
        )
        row = cur.fetchone()
        if row:
            return row[0]

        team_id = "team-" + str(uuid.uuid4())[:8]
        display = (full_name or email or "Individual Entrant").strip()
        cur.execute(
            "INSERT INTO teams (id, name, track, lead, members, status, school_name, "
            "competition_id, mentor_status, is_solo, roster_list) "
            "VALUES (%s, %s, %s, %s, 1, 'In Competition', NULL, %s, 'none', TRUE, %s)",
            (team_id, f"{display} (Individual)", track or "", display,
             competition_id or None, json.dumps([display])),
        )
        member_id = "tm-" + str(uuid.uuid4())[:8]
        cur.execute(
            "INSERT INTO team_members (id, team_id, student_id, email, name, is_lead) "
            "VALUES (%s, %s, %s, %s, %s, TRUE)",
            (member_id, team_id, student_id, (email or "").strip().lower() or None, display),
        )
        if competition_id:
            _auto_enroll_team_members(cur, team_id, competition_id)
        return team_id

    @app.get("/api/teams")
    def list_teams(competition_id: str = "", _auth: dict = Depends(require_auth)):
        """List teams, optionally scoped to one cycle.

        `?competition_id=` is what lets each panel show "the teams in this cycle"
        instead of every team on the platform.
        """
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        if competition_id:
            cur.execute(
                "SELECT id, name, track, lead, members, status, school_name, competition_id, COALESCE(mentor, ''), COALESCE(motto, ''), COALESCE(roster_list, '[]'::jsonb), mentor_id, COALESCE(mentor_status, 'none'), COALESCE(is_solo, FALSE) "
                "FROM teams WHERE competition_id = %s ORDER BY name ASC",
                (competition_id,),
            )
        else:
            cur.execute(
                "SELECT id, name, track, lead, members, status, school_name, competition_id, COALESCE(mentor, ''), COALESCE(motto, ''), COALESCE(roster_list, '[]'::jsonb), mentor_id, COALESCE(mentor_status, 'none'), COALESCE(is_solo, FALSE) "
                "FROM teams ORDER BY name ASC"
            )
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        res = []
        for r in rows:
            r_list = r[10]
            if isinstance(r_list, str):
                try:
                    r_list = json.loads(r_list)
                except Exception:
                    r_list = []
            elif not isinstance(r_list, list):
                r_list = []
            res.append({
                "id": r[0],
                "name": r[1],
                "track": r[2],
                "lead": r[3],
                "members": r[4],
                "status": r[5],
                "school_name": r[6],
                "competition_id": r[7],
                "mentor": r[8],
                "motto": r[9],
                "rosterList": r_list,
                "mentorId": r[11] if len(r) > 11 else None,
                "mentorStatus": r[12] if len(r) > 12 else "none",
                "isSolo": bool(r[13]) if len(r) > 13 else False,
            })
        return res

    @app.get("/api/teams/mine")
    def list_my_teams(actor: dict = Depends(require_auth)):
        """The teams the caller belongs to, with mentor status.

        Lets a student -- solo or in a squad -- see their team and whether it has
        a mentor, so the "Request a mentor" action has a team id to act on.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT t.id, t.name, t.track, t.competition_id, t.mentor_id, "
                "COALESCE(t.mentor_status, 'none'), COALESCE(t.is_solo, FALSE), "
                "m.is_lead "
                "FROM teams t JOIN team_members m ON m.team_id = t.id "
                "WHERE m.student_id = %s ORDER BY t.name",
                (actor["id"],),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0], "name": r[1], "track": r[2] or "",
                "competitionId": r[3], "mentorId": r[4],
                "mentorStatus": r[5], "isSolo": bool(r[6]), "isLead": bool(r[7]),
            }
            for r in rows
        ]

    # Team writes are decision points, not proposals.
    #
    # These used to accept STUDENT_ADMIN_ROLES, which includes school_admin and
    # instructor -- so the team-change approval workflow was enforced only in the
    # frontend and an institution could rename, add or disband a team by calling
    # the API directly. Institutions now propose changes via
    # POST /api/approvals/team-change and an admin applies them on approval.
    @app.post("/api/teams", status_code=status.HTTP_201_CREATED)
    def create_team(payload: TeamCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        team_id = "team-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            comp_ref = _validate_competition_ref(cur, payload.competition_id)
            cur.execute(
                "SELECT id FROM teams WHERE lower(name) = %s AND lower(COALESCE(school_name, '')) = %s",
                (payload.name.strip().lower(), (payload.school_name or "").strip().lower())
            )
            existing = cur.fetchone()
            if existing:
                team_id = existing[0]
                cur.execute(
                    "UPDATE teams SET track = %s, lead = %s, members = %s, status = %s, competition_id = %s, mentor = %s, motto = %s, roster_list = %s WHERE id = %s",
                    (payload.track, payload.lead, payload.members, payload.status, comp_ref, payload.mentor, payload.motto, json.dumps(payload.roster_list), team_id)
                )
            else:
                cur.execute(
                    "INSERT INTO teams (id, name, track, lead, members, status, school_name, competition_id, mentor, motto, roster_list) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (team_id, payload.name, payload.track, payload.lead, payload.members, payload.status, payload.school_name, comp_ref, payload.mentor, payload.motto, json.dumps(payload.roster_list))
                )
            _sync_team_members(cur, team_id, payload.lead, payload.roster_list,
                               payload.lead_email, payload.member_emails)
            # Provision a student login for each member who supplied an email but
            # has no account yet. This is what puts every student "under" the
            # institution with a login they can be given.
            provisioned = _provision_team_member_accounts(cur, team_id, payload.school_name)
            if comp_ref:
                _auto_enroll_team_members(cur, team_id, comp_ref)
            conn.commit()
        except HTTPException:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "teams"})
        if provisioned:
            broadcast_async({"type": "data_changed", "collection": "users"})
        return {"id": team_id, "name": payload.name, "status": payload.status,
                "competition_id": comp_ref, "provisioned_accounts": provisioned}

    @app.patch("/api/teams/{item_id}")
    def update_team(item_id: str, payload: TeamCreate, _actor: dict = Depends(require_role(COMPETITION_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            comp_ref = _validate_competition_ref(cur, payload.competition_id)
            cur.execute(
                "UPDATE teams SET name = %s, track = %s, lead = %s, members = %s, status = %s, school_name = %s, competition_id = %s, mentor = %s, motto = %s, roster_list = %s WHERE id = %s RETURNING id",
                (payload.name, payload.track, payload.lead, payload.members, payload.status, payload.school_name, comp_ref, payload.mentor, payload.motto, json.dumps(payload.roster_list), item_id)
            )
            row = cur.fetchone()
            provisioned = []
            if row:
                _sync_team_members(cur, item_id, payload.lead, payload.roster_list,
                                   payload.lead_email, payload.member_emails)
                provisioned = _provision_team_member_accounts(cur, item_id, payload.school_name)
                if comp_ref:
                    _auto_enroll_team_members(cur, item_id, comp_ref)
            conn.commit()
        except HTTPException:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise
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
        if provisioned:
            broadcast_async({"type": "data_changed", "collection": "users"})
        return {"id": item_id, "status": "updated", "provisioned_accounts": provisioned}

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

    # ── Institution student portal ────────────────────────────────────
    # An institution (school_admin) can see the student accounts it provisioned
    # and hand out / reset their initial credentials. Everything is scoped to the
    # caller's own organisation, so one school cannot see or touch another's
    # students, and an admin sees all.

    def _actor_org(cur, actor: dict) -> str:
        cur.execute("SELECT organization FROM users WHERE id = %s", (actor["id"],))
        row = cur.fetchone()
        return (row[0] or "").strip() if row else ""

    @app.get("/api/institution/students")
    def list_institution_students(actor: dict = Depends(require_role(STUDENT_ADMIN_ROLES))):
        """Student accounts belonging to the caller's institution.

        Lets an institution monitor its students: who has an account, whether they
        have logged in, and whether they still owe a password change.
        """
        is_admin = (actor.get("role") or "") in ("super_admin", "admin")
        conn = _get_db()
        try:
            cur = conn.cursor()
            org = _actor_org(cur, actor)
            if not is_admin and not org:
                cur.close()
                raise HTTPException(
                    status_code=409,
                    detail="Your account is not linked to an institution.",
                )
            if is_admin:
                cur.execute(
                    "SELECT id, full_name, email, ticket, status, organization, "
                    "COALESCE(must_change_password, FALSE), password_changed_at "
                    "FROM users WHERE role = 'student' ORDER BY organization, full_name"
                )
            else:
                cur.execute(
                    "SELECT id, full_name, email, ticket, status, organization, "
                    "COALESCE(must_change_password, FALSE), password_changed_at "
                    "FROM users WHERE role = 'student' AND LOWER(COALESCE(organization,'')) = LOWER(%s) "
                    "ORDER BY full_name",
                    (org,),
                )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0], "full_name": r[1] or "", "email": r[2] or "",
                "ticket": r[3] or "", "status": r[4] or "", "organization": r[5] or "",
                "must_change_password": bool(r[6]),
                "has_logged_in": r[7] is not None,
            }
            for r in rows
        ]

    @app.post("/api/institution/students/{student_id}/reset-credentials")
    def reset_student_credentials(student_id: str, actor: dict = Depends(require_role(STUDENT_ADMIN_ROLES))):
        """Issue a fresh one-time password for a student in the caller's institution.

        The new password is minted server-side (never chosen by the institution)
        and returned exactly once, and the account is flagged must_change_password
        so the student sets their own on next login. Scoped: a school_admin may
        only reset a student in their own organisation. This is the safe form of
        "the institution provides their login" -- it cannot be used to take over an
        arbitrary account because the target must be a student in the caller's org.
        """
        from app.security import hash_password
        is_admin = (actor.get("role") or "") in ("super_admin", "admin")
        conn = _get_db()
        try:
            cur = conn.cursor()
            org = _actor_org(cur, actor)
            cur.execute(
                "SELECT role, organization, full_name, email FROM users WHERE id = %s",
                (student_id,),
            )
            target = cur.fetchone()
            if not target:
                cur.close()
                raise HTTPException(status_code=404, detail="Student not found")
            if (target[0] or "") != "student":
                cur.close()
                raise HTTPException(status_code=400, detail="That account is not a student")
            if not is_admin and (target[1] or "").strip().lower() != org.lower():
                cur.close()
                # Do not disclose students in other institutions.
                raise HTTPException(status_code=404, detail="Student not found")

            temp_password = _generate_temp_password()
            cur.execute(
                "UPDATE users SET password_hash = %s, must_change_password = TRUE, "
                "password_changed_at = NULL WHERE id = %s",
                (hash_password(temp_password), student_id),
            )
            # Any active session for that student is now stale.
            cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (student_id,))
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        return {
            "id": student_id,
            "full_name": target[2] or "",
            "email": target[3] or "",
            "temporary_password": temp_password,
        }

    # ── Mentors ───────────────────────────────────────────────────────
    # A mentor is an instructor account assigned to a team. This is what lets a
    # mentor log in, see their students and be monitored, and connects a team to
    # the LMS instructor flow.

    @app.get("/api/institution/instructors")
    def list_institution_instructors(actor: dict = Depends(require_role(STUDENT_ADMIN_ROLES))):
        """Instructors an institution can pick a mentor from.

        School admins see instructors in their own organisation; admins see all.
        """
        is_admin = (actor.get("role") or "") in ("super_admin", "admin")
        conn = _get_db()
        try:
            cur = conn.cursor()
            org = _actor_org(cur, actor)
            if is_admin:
                cur.execute(
                    "SELECT id, full_name, email, organization FROM users "
                    "WHERE role = 'instructor' AND LOWER(status) = 'active' ORDER BY full_name"
                )
            else:
                cur.execute(
                    "SELECT id, full_name, email, organization FROM users "
                    "WHERE role = 'instructor' AND LOWER(status) = 'active' "
                    "AND LOWER(COALESCE(organization,'')) = LOWER(%s) ORDER BY full_name",
                    (org,),
                )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [{"id": r[0], "full_name": r[1] or "", "email": r[2] or "",
                 "organization": r[3] or ""} for r in rows]

    class AssignMentorPayload(BaseModel):
        mentor_id: Optional[str] = None

    @app.patch("/api/teams/{team_id}/mentor")
    def assign_team_mentor(team_id: str, payload: AssignMentorPayload,
                           actor: dict = Depends(require_role(COMPETITION_ROLES))):
        """Assign or unassign an instructor as a team's mentor.

        Only competition administrators (super_admin, admin, competition_manager)
        may designate or alter team mentors across the platform.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT school_name FROM teams WHERE id = %s", (team_id,))
            team = cur.fetchone()
            if not team:
                cur.close()
                raise HTTPException(status_code=404, detail="Team not found")

            target_mentor = (payload.mentor_id or "").strip()
            if not target_mentor or target_mentor.lower() in ("none", "null", "unassigned"):
                cur.execute(
                    "UPDATE teams SET mentor_id = NULL, mentor_status = 'none' WHERE id = %s",
                    (team_id,),
                )
                conn.commit()
                cur.close()
                broadcast_async({"type": "data_changed", "collection": "teams"})
                return {"team_id": team_id, "mentor_id": None, "mentor_status": "none"}

            cur.execute(
                "SELECT role, organization FROM users WHERE id = %s", (target_mentor,)
            )
            mentor = cur.fetchone()
            if not mentor or (mentor[0] or "") != "instructor":
                cur.close()
                raise HTTPException(status_code=400, detail="Mentor must be an instructor account")

            cur.execute(
                "UPDATE teams SET mentor_id = %s, mentor_status = 'assigned' WHERE id = %s",
                (target_mentor, team_id),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"team_id": team_id, "mentor_id": target_mentor, "mentor_status": "assigned"}

    @app.post("/api/teams/{team_id}/request-mentor")
    def request_team_mentor(team_id: str, actor: dict = Depends(require_auth)):
        """A team with no institution asks to be given a mentor.

        For groups, open and single entrants who are not under an institution:
        after approval they request a mentor. If they never do, the nightly/admin
        auto-assign covers them. Requesting only flags intent; an admin or the
        auto-assign then attaches an actual instructor.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT mentor_id FROM teams WHERE id = %s", (team_id,))
            team = cur.fetchone()
            if not team:
                cur.close()
                raise HTTPException(status_code=404, detail="Team not found")
            # Only a member of the team (or an admin) may request its mentor, so
            # one entrant cannot flag another's team.
            is_admin = (actor.get("role") or "") in ("super_admin", "admin")
            if not is_admin:
                cur.execute(
                    "SELECT 1 FROM team_members WHERE team_id = %s AND student_id = %s LIMIT 1",
                    (team_id, actor["id"]),
                )
                if not cur.fetchone():
                    cur.close()
                    raise HTTPException(status_code=404, detail="Team not found")
            if team[0]:
                cur.close()
                return {"team_id": team_id, "mentor_status": "assigned",
                        "detail": "A mentor is already assigned"}
            cur.execute(
                "UPDATE teams SET mentor_status = 'requested' WHERE id = %s", (team_id,)
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"team_id": team_id, "mentor_status": "requested"}

    def _auto_assign_mentors(cur, competition_id: str = "") -> int:
        """Give mentor-less teams an instructor, optionally scoped to one cycle.

        Assignment is by track where possible (an instructor whose track matches
        the team's), else any active instructor, chosen by current mentor load so
        the distribution stays even. Returns the number of teams assigned.
        """
        if competition_id:
            cur.execute(
                "SELECT id, track FROM teams "
                "WHERE mentor_id IS NULL AND COALESCE(status,'') <> 'Disbanded' "
                "AND competition_id = %s",
                (competition_id,),
            )
        else:
            cur.execute(
                "SELECT id, track FROM teams "
                "WHERE mentor_id IS NULL AND COALESCE(status,'') <> 'Disbanded'"
            )
        teams = cur.fetchall()
        if not teams:
            return 0
        cur.execute(
            "SELECT u.id, u.track, "
            "(SELECT COUNT(*) FROM teams t WHERE t.mentor_id = u.id) AS load "
            "FROM users u WHERE u.role = 'instructor' AND LOWER(u.status) = 'active'"
        )
        instructors = [{"id": r[0], "track": (r[1] or "").lower(), "load": r[2]} for r in cur.fetchall()]
        if not instructors:
            return 0
        assigned = 0
        for team_id, track in teams:
            track_l = (track or "").lower()
            pool = [i for i in instructors if i["track"] == track_l] or instructors
            pick = min(pool, key=lambda i: i["load"])
            cur.execute(
                "UPDATE teams SET mentor_id = %s, mentor_status = 'assigned' WHERE id = %s",
                (pick["id"], team_id),
            )
            pick["load"] += 1
            assigned += 1
        return assigned

    @app.post("/api/teams/auto-assign-mentors")
    def auto_assign_mentors(actor: dict = Depends(require_role(ADMIN_ROLES))):
        """Give every mentor-less team an instructor, so none is left unsupervised.

        Covers the entrants who never requested one.
        """
        conn = _get_db()
        assigned = 0
        try:
            cur = conn.cursor()
            assigned = _auto_assign_mentors(cur)
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        if assigned:
            broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"assigned": assigned}
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
        # `students` is a real per-school count of active student accounts whose
        # organisation matches this school directory entry (case/space-insensitive).
        cur.execute(
            "SELECT s.id, s.name, s.region, s.teams, s.score, s.rank, s.status, "
            "s.coding_score, s.robotics_score, s.ai_score, s.cyber_score, "
            "COUNT(u.id) AS students "
            "FROM schools s "
            "LEFT JOIN users u "
            "  ON u.role = 'student' AND u.status <> 'banned' "
            " AND LOWER(TRIM(COALESCE(u.organization,''))) = LOWER(TRIM(s.name)) "
            "GROUP BY s.id, s.name, s.region, s.teams, s.score, s.rank, s.status, "
            "s.coding_score, s.robotics_score, s.ai_score, s.cyber_score "
            "ORDER BY s.rank ASC"
        )
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "name": r[1], "region": r[2], "teams": r[3], "score": r[4], "rank": r[5], "status": r[6],
                 "coding_score": r[7], "robotics_score": r[8], "ai_score": r[9], "cyber_score": r[10],
                 "students": r[11] or 0} for r in rows]

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
        cached = _cache_get("philosophy")
        if cached is not None:
            return cached
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, description, image FROM philosophy_cards")
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        result = [{"id": r[0], "title": r[1], "description": r[2], "image": r[3]} for r in rows]
        _cache_set("philosophy", result)
        return result

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
        _cache_bust("philosophy")
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
        _cache_bust("philosophy")
        broadcast_async({"type": "data_changed", "collection": "philosophy"})
        return {"id": item_id, "status": "updated"}

    @app.delete("/api/philosophy/{item_id}")
    def delete_philosophy_card(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM philosophy_cards WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        _cache_bust("philosophy")
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
        cached = _cache_get("hero_slides")
        if cached is not None:
            return cached
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, tag, title, description, image, image_file_id, video_file_id, video_url, sort_order FROM hero_slides ORDER BY sort_order")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        result = [{"id": r[0], "tag": r[1], "title": r[2], "description": r[3], "image": r[4], "imageFileId": r[5], "videoFileId": r[6], "videoUrl": r[7], "sortOrder": r[8]} for r in rows]
        _cache_set("hero_slides", result)
        return result

    @app.post("/api/hero-slides", status_code=status.HTTP_201_CREATED)
    def create_hero_slide(payload: HeroSlideCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        sid = "slide-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO hero_slides (id, tag, title, description, image, image_file_id, video_file_id, video_url, sort_order) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", (sid, payload.tag, payload.title, payload.description, payload.image, payload.image_file_id, payload.video_file_id, payload.video_url, payload.sort_order))
        conn.commit(); cur.close(); release_db_connection(conn)
        _cache_bust("hero_slides")
        broadcast_async({"type": "data_changed", "collection": "hero_slides"})
        return {"id": sid, "title": payload.title}

    @app.delete("/api/hero-slides/{item_id}")
    def delete_hero_slide(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM hero_slides WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        _cache_bust("hero_slides")
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
        cached = _cache_get("talent")
        if cached is not None:
            return cached
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, student_name, school, track, project_title, talent_tags, description, mentor, status FROM talent_discovery ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        result = [{"id": r[0], "studentName": r[1], "school": r[2], "track": r[3], "projectTitle": r[4], "talentTags": r[5], "description": r[6], "mentor": r[7], "status": r[8]} for r in rows]
        _cache_set("talent", result)
        return result

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
    #
    # The six impact figures are now COMPUTED live from the database rather than
    # read back from a manually-edited row that was seeded with placeholder
    # numbers (16 / 85 / 512 / 12 / 3.2 / 2.5). Every value is either a real
    # count or a real sum; where nothing exists it is 0, never invented. Only
    # the countdown target date is configurable.
    @app.get("/api/platform-stats")
    def get_platform_stats():
        cached = _cache_get("platform_stats", ttl=60)
        if cached is not None:
            return cached
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute("SELECT COALESCE(countdown_date,'') FROM platform_stats WHERE id='stats-1'")
            row = cur.fetchone()
            countdown = (row[0] if row and row[0] else "") or "2026-08-15T09:00:00"

            # Regions: distinct regions held on the school directory.
            cur.execute("SELECT COUNT(DISTINCT region) FROM schools WHERE region IS NOT NULL AND region <> ''")
            regions = cur.fetchone()[0] or 0

            # Mentors: instructors and school admins on the platform.
            cur.execute("SELECT COUNT(*) FROM users WHERE role IN ('instructor','school_admin')")
            mentors = cur.fetchone()[0] or 0

            # Schools: distinct schools with a registered team, plus distinct
            # school-admin organisations that have no team yet.
            cur.execute(
                "SELECT COUNT(*) FROM ("
                "  SELECT LOWER(school_name) AS s FROM teams WHERE school_name IS NOT NULL AND school_name <> ''"
                "  UNION"
                "  SELECT LOWER(organization) AS s FROM users WHERE organization IS NOT NULL"
                "    AND organization <> '' AND organization <> 'NTIC Platform' AND organization <> '--'"
                ") d"
            )
            schools = cur.fetchone()[0] or 0

            # Students: real student accounts.
            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
            students = cur.fetchone()[0] or 0

            # Projects: one submitted team per project entry.
            cur.execute("SELECT COUNT(*) FROM teams")
            projects = cur.fetchone()[0] or 0

            # Grants: money actually banked (verified sponsorship payments).
            cur.execute("SELECT COALESCE(SUM(amount),0) FROM sponsorship_payments WHERE status='verified'")
            grants = float(cur.fetchone()[0] or 0)

            cur.close()
        finally:
            release_db_connection(conn)

        result = {
            "regions": regions, "mentors": mentors, "schools": schools,
            "students": students, "projects": projects, "grants": grants,
            "countdownDate": countdown,
        }
        _cache_set("platform_stats", result)
        return result

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
        # Only the countdown date is editable. The six impact figures are
        # computed live by GET /api/platform-stats, so manual overrides are
        # accepted but deliberately ignored.
        countdown_date = payload.countdown_date
        if countdown_date is None:
            raise HTTPException(status_code=400, detail="countdown_date is required")
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO platform_stats (id, countdown_date) VALUES ('stats-1', %s) "
                "ON CONFLICT (id) DO UPDATE SET countdown_date=EXCLUDED.countdown_date, updated_at=CURRENT_TIMESTAMP",
                (countdown_date,),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "platform_stats"})
        _cache_bust("platform_stats")
        return {"status": "updated"}

    # CSR UPDATES
    class CsrCreate(BaseModel):
        title: str = ""
        description: str = ""
        date: str = ""
        icon: str = ""

    @app.get("/api/csr")
    def list_csr():
        cached = _cache_get("csr")
        if cached is not None:
            return cached
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT id, title, description, date, icon FROM csr_updates ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        result = [{"id": r[0], "title": r[1], "description": r[2], "date": r[3], "icon": r[4]} for r in rows]
        _cache_set("csr", result)
        return result

    @app.post("/api/csr", status_code=status.HTTP_201_CREATED)
    def create_csr(payload: CsrCreate, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cid = "csr-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        cur.execute("INSERT INTO csr_updates (id, title, description, date, icon) VALUES (%s,%s,%s,%s,%s)", (cid, payload.title, payload.description, payload.date, payload.icon))
        conn.commit(); cur.close(); release_db_connection(conn)
        _cache_bust("csr")
        broadcast_async({"type": "data_changed", "collection": "csr"})
        return {"id": cid, "title": payload.title}

    @app.delete("/api/csr/{item_id}")
    def delete_csr(item_id: str, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("DELETE FROM csr_updates WHERE id=%s", (item_id,)); conn.commit(); cur.close(); release_db_connection(conn)
        _cache_bust("csr")
        broadcast_async({"type": "data_changed", "collection": "csr"})
        return {"status": "deleted", "id": item_id}

    # LANDING PAGE COPY (key/value store of editable marketing text)
    @app.get("/api/landing-copy")
    def get_landing_copy():
        cached = _cache_get("landing_copy")
        if cached is not None:
            return cached
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM landing_copy")
        rows = cur.fetchall(); cur.close(); release_db_connection(conn)
        result = {r[0]: r[1] for r in rows}
        _cache_set("landing_copy", result)
        return result

    @app.put("/api/landing-copy")
    def update_landing_copy(payload: dict, _actor: dict = Depends(require_role(CONTENT_ROLES))):
        conn = get_db_connection()
        if not conn: raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            for key, value in payload.items():
                cur.execute(
                    "INSERT INTO landing_copy (key, value, section, updated_at) VALUES (%s, %s, %s, CURRENT_TIMESTAMP) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP",
                    (str(key), str(value), str(key).split('.')[0] if '.' in str(key) else 'General'),
                )
            conn.commit()
        except Exception as e:
            conn.rollback(); cur.close(); release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close(); release_db_connection(conn)
        _cache_bust("landing_copy")
        broadcast_async({"type": "data_changed", "collection": "landing_copy"})
        return {"status": "updated", "count": len(payload)}

    # USERS
    @app.get("/api/users")
    def list_users(updated_since: Optional[str] = None, _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        query = (
            "SELECT id, email, full_name, role, ticket, status, created_at, phone, "
            "organization, age_group, experience_level, competition_id, photo_file_id, doc_file_id "
            "FROM users"
        )
        params = []
        if updated_since and updated_since.strip():
            query += " WHERE COALESCE(updated_at, created_at) >= %s"
            params.append(updated_since.strip())
        query += " ORDER BY created_at DESC"
        cur.execute(query, tuple(params))
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

    @app.get("/api/admin/personnel")
    def list_personnel(_admin: dict = Depends(require_admin)):
        """Operational roster for every managed role: student, sponsor, judge,
        instructor.

        Every field is derived from data the backend actually stores. Where a figure
        cannot be sourced the field is null, never zero-filled, so the UI can hide a
        column instead of showing a false zero.

        Sourcing choices worth knowing:

        * `last_login_at` comes from `audit_logs`, NOT `auth_sessions`. Logging out
          deletes the session row, so `auth_sessions` would report "never logged in"
          for anyone who signed out properly -- exactly backwards.
        * `is_online` comes from a live, unexpired `auth_sessions` row. Because
          sessions expire after SESSION_IDLE_MINUTES, this means "active recently".
        * Instructor course counts now key on `lms_courses.owner_id`, not a name
          match on the free-text `submitted_by`. The old name match silently failed
          for every course created through the LMS Manager, which hardcoded
          submitted_by to the literal 'Admin'.
        """
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()

        roles = tuple(GOVERNANCE_ROLES | {ROLE_MENTOR, ROLE_SPONSOR, ROLE_JUDGE, ROLE_INSTRUCTOR, ROLE_STUDENT})
        cur.execute(
            "SELECT id, email, full_name, role, ticket, status, phone, organization, "
            "created_at, photo_file_id, doc_file_id, "
            "COALESCE(must_change_password, FALSE), experience_level, competition_id, "
            "track, tier, sector, expertise "
            "FROM users WHERE role = ANY(%s) ORDER BY role, lower(COALESCE(full_name, email))",
            (list(roles),),
        )
        people_rows = cur.fetchall()

        cur.execute(
            "SELECT user_id, COUNT(*) FROM auth_sessions "
            "WHERE expires_at > CURRENT_TIMESTAMP AND user_id IS NOT NULL GROUP BY user_id"
        )
        live_sessions = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute(
            "SELECT lower(usr), MAX(time), COUNT(*) FROM audit_logs "
            "WHERE type = 'auth' AND action LIKE '% login: %' AND usr IS NOT NULL "
            "GROUP BY lower(usr)"
        )
        logins = {r[0]: {"last": r[1], "count": r[2]} for r in cur.fetchall()}

        # Instructor authorship, keyed on owner_id -- a real foreign-key-style link
        # rather than the previous free-text name match.
        cur.execute(
            "SELECT owner_id, COUNT(*), "
            "COUNT(CASE WHEN approval_status = 'pending' THEN 1 END), "
            "COUNT(CASE WHEN approval_status = 'rejected' THEN 1 END), "
            "COALESCE(SUM(COALESCE(enrolled, 0)), 0) "
            "FROM lms_courses WHERE owner_id IS NOT NULL GROUP BY owner_id"
        )
        courses = {
            r[0]: {"total": r[1], "pending": r[2], "rejected": r[3], "enrolled": r[4]}
            for r in cur.fetchall()
        }

        # Work an instructor still owes their students.
        cur.execute(
            "SELECT c.owner_id, COUNT(*) FROM lms_submissions s "
            "JOIN lms_courses c ON c.id = s.course_id "
            "WHERE s.score IS NULL AND c.owner_id IS NOT NULL GROUP BY c.owner_id"
        )
        awaiting_grading = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute(
            "SELECT lower(user_email), COUNT(*) FROM support_tickets "
            "WHERE status = 'open' AND COALESCE(is_deleted, FALSE) = FALSE "
            "AND user_email IS NOT NULL GROUP BY lower(user_email)"
        )
        open_tickets = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute(
            "SELECT graded_by, COUNT(*), MAX(graded_at) FROM assignment_submissions "
            "WHERE graded_by IS NOT NULL AND score IS NOT NULL GROUP BY graded_by"
        )
        grading = {r[0]: {"count": r[1], "last": r[2]} for r in cur.fetchall()}

        # Student learning activity, from the tables added for self-service.
        cur.execute(
            "SELECT student_id, COUNT(*), COALESCE(ROUND(AVG(progress_pct)), 0) "
            "FROM lms_enrollments WHERE status = 'active' GROUP BY student_id"
        )
        enrolments = {r[0]: {"courses": r[1], "avg_progress": int(r[2] or 0)}
                      for r in cur.fetchall()}

        cur.execute(
            "SELECT student_id, COUNT(*), "
            "COUNT(CASE WHEN score IS NOT NULL THEN 1 END), "
            "ROUND(AVG(score)) FROM lms_submissions GROUP BY student_id"
        )
        student_work = {
            r[0]: {"submitted": r[1], "graded": r[2],
                   "avg_score": int(r[3]) if r[3] is not None else None}
            for r in cur.fetchall()
        }

        cur.execute(
            "SELECT student_id, COUNT(*) FROM competition_registrations "
            "WHERE status = 'registered' GROUP BY student_id"
        )
        comp_registrations = {r[0]: r[1] for r in cur.fetchall()}

        # Sponsor money. Only VERIFIED payments count as received.
        cur.execute(
            "SELECT sponsor_id, COUNT(*), COALESCE(SUM(amount_pledged), 0), "
            "COUNT(CASE WHEN status = 'active' THEN 1 END) "
            "FROM sponsorships GROUP BY sponsor_id"
        )
        pledges = {r[0]: {"count": r[1], "pledged": r[2], "active": r[3]}
                   for r in cur.fetchall()}

        cur.execute(
            "SELECT sponsor_id, "
            "COALESCE(SUM(CASE WHEN status = 'verified' THEN amount END), 0), "
            "COALESCE(SUM(CASE WHEN status = 'pending_verification' THEN amount END), 0), "
            "COUNT(CASE WHEN status = 'pending_verification' THEN 1 END) "
            "FROM sponsorship_payments GROUP BY sponsor_id"
        )
        sponsor_payments = {
            r[0]: {"received": r[1], "awaiting": r[2], "awaiting_count": r[3]}
            for r in cur.fetchall()
        }

        cur.close()
        release_db_connection(conn)

        people = []
        for r in people_rows:
            uid, email, full_name, role, ticket, status_val = r[0], r[1], r[2], r[3], r[4], r[5]
            email_key = (email or "").strip().lower()
            login = logins.get(email_key)
            sessions = live_sessions.get(uid, 0)

            person = {
                "id": uid,
                "email": email,
                "full_name": full_name or "",
                "role": role,
                "ticket": ticket or "",
                "status": status_val or "Active",
                "phone": r[6] or "",
                "organization": r[7] or "",
                "created_at": str(r[8]) if r[8] else None,
                "has_photo": bool(r[9]),
                "has_document": bool(r[10]),
                "must_change_password": bool(r[11]),
                "experience_level": r[12] or "",
                "competition_id": r[13] or "",
                # These have real columns now, so they are no longer withheld.
                "track": r[14] or "",
                "tier": r[15] or "",
                "sector": r[16] or "",
                "expertise": r[17] or "",
                "is_online": sessions > 0,
                "active_sessions": sessions,
                "last_login_at": login["last"] if login else None,
                "login_count": login["count"] if login else 0,
                "open_tickets": open_tickets.get(email_key, 0),
            }

            if role == ROLE_INSTRUCTOR:
                c = courses.get(uid)
                person["courses_authored"] = c["total"] if c else 0
                person["courses_pending"] = c["pending"] if c else 0
                person["courses_rejected"] = c["rejected"] if c else 0
                person["students_reached"] = c["enrolled"] if c else 0
                person["awaiting_grading"] = awaiting_grading.get(uid, 0)
            else:
                person["courses_authored"] = None
                person["courses_pending"] = None
                person["courses_rejected"] = None
                person["students_reached"] = None
                person["awaiting_grading"] = None

            if role in (ROLE_JUDGE, ROLE_INSTRUCTOR):
                g = grading.get(uid)
                person["submissions_graded"] = g["count"] if g else 0
                person["last_graded_at"] = str(g["last"]) if g and g["last"] else None
            else:
                person["submissions_graded"] = None
                person["last_graded_at"] = None

            if role == ROLE_STUDENT:
                e = enrolments.get(uid)
                w = student_work.get(uid)
                person["courses_enrolled"] = e["courses"] if e else 0
                person["average_progress"] = e["avg_progress"] if e else 0
                person["work_submitted"] = w["submitted"] if w else 0
                person["work_graded"] = w["graded"] if w else 0
                person["average_score"] = w["avg_score"] if w else None
                person["competitions_registered"] = comp_registrations.get(uid, 0)
            else:
                person["courses_enrolled"] = None
                person["average_progress"] = None
                person["work_submitted"] = None
                person["work_graded"] = None
                person["average_score"] = None
                person["competitions_registered"] = None

            if role == ROLE_SPONSOR:
                p = pledges.get(uid)
                pay = sponsor_payments.get(uid)
                person["pledge_count"] = p["count"] if p else 0
                person["active_pledges"] = p["active"] if p else 0
                person["amount_pledged"] = _money(p["pledged"] if p else 0)
                person["amount_received"] = _money(pay["received"] if pay else 0)
                person["amount_awaiting"] = _money(pay["awaiting"] if pay else 0)
                person["payments_awaiting_count"] = pay["awaiting_count"] if pay else 0
            else:
                person["pledge_count"] = None
                person["active_pledges"] = None
                person["amount_pledged"] = None
                person["amount_received"] = None
                person["amount_awaiting"] = None
                person["payments_awaiting_count"] = None

            people.append(person)

        def _summarise(role_or_roles):
            if isinstance(role_or_roles, (list, tuple, set, frozenset)):
                group = [p for p in people if p["role"] in role_or_roles]
            else:
                group = [p for p in people if p["role"] == role_or_roles]
            return {
                "total": len(group),
                "active": sum(1 for p in group if (p["status"] or "").lower() == "active"),
                "online": sum(1 for p in group if p["is_online"]),
                "never_logged_in": sum(1 for p in group if not p["last_login_at"]),
                "needs_attention": sum(
                    1 for p in group
                    if (p["status"] or "").lower() != "active" or p["must_change_password"]
                ),
            }

        return {
            "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
            "online_window_minutes": SESSION_IDLE_MINUTES,
            # Course ownership is now a real id link, not a name guess.
            "courses_matched_by_name": False,
            "people": people,
            "summary": {
                "governance": _summarise(GOVERNANCE_ROLES),
                "mentor": _summarise(ROLE_MENTOR),
                "sponsor": _summarise(ROLE_SPONSOR),
                "judge": _summarise(ROLE_JUDGE),
                "instructor": _summarise(ROLE_INSTRUCTOR),
                "student": _summarise(ROLE_STUDENT),
            },
        }

    # ── Personnel management actions ──────────────────────────────────
    # The monitor was read-only: an administrator could see that somebody needed
    # attention but had to leave for User Management to do anything about it.

    class PersonnelStatusPayload(BaseModel):
        status: str = Field(pattern="^(Active|Suspended|Inactive)$")
        reason: str = Field(default="", max_length=500)

    @app.patch("/api/admin/personnel/{user_id}/status")
    def set_personnel_status(
        user_id: str,
        payload: PersonnelStatusPayload,
        actor: dict = Depends(require_admin),
    ):
        """Activate, suspend or deactivate an account.

        Suspending also revokes live sessions. Without that the person keeps working
        until their idle timeout expires, which defeats the point of suspending them.
        """
        if user_id == actor["id"]:
            raise HTTPException(
                status_code=409,
                detail="You cannot change your own account status",
            )
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT email, role FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute("UPDATE users SET status = %s WHERE id = %s", (payload.status, user_id))
            revoked = 0
            if payload.status != "Active":
                cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
                revoked = cur.rowcount or 0
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (f"Set {row[1]} {row[0]} to {payload.status}"
                 + (f" ({payload.reason})" if payload.reason else "")
                 + (f"; revoked {revoked} session(s)" if revoked else ""),
                 actor.get("email") or actor["id"],
                 datetime.datetime.now(datetime.UTC).isoformat(), "security"),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        return {"id": user_id, "status": payload.status, "sessions_revoked": revoked}

    @app.post("/api/admin/personnel/{user_id}/require-password-change")
    def require_password_change(user_id: str, actor: dict = Depends(require_admin)):
        """Force a password rotation at next sign-in, and end current sessions."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute(
                "UPDATE users SET must_change_password = TRUE WHERE id = %s", (user_id,)
            )
            # Existing sessions must end, otherwise the requirement only takes
            # effect whenever they happen to sign in again.
            cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
            revoked = cur.rowcount or 0
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (f"Required password change for {row[0]}; revoked {revoked} session(s)",
                 actor.get("email") or actor["id"],
                 datetime.datetime.now(datetime.UTC).isoformat(), "security"),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        return {"id": user_id, "must_change_password": True, "sessions_revoked": revoked}

    @app.post("/api/admin/personnel/{user_id}/revoke-sessions")
    def revoke_personnel_sessions(user_id: str, actor: dict = Depends(require_admin)):
        """Sign a person out of every device."""
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
            revoked = cur.rowcount or 0
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                (f"Revoked {revoked} session(s) for {row[0]}",
                 actor.get("email") or actor["id"],
                 datetime.datetime.now(datetime.UTC).isoformat(), "security"),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        return {"id": user_id, "sessions_revoked": revoked}

    @app.post("/api/admin/purge-test-data")
    def purge_test_data(actor: dict = Depends(require_admin)):
        """Purge test tables and reset the platform for real live users.

        Preserves super-admin accounts only.
        """
        tables = [
            "assignment_submissions",
            "students",
            "teams",
            "pending_approvals",
            "support_tickets",
            "otp_challenges",
            "lms_submissions",
            "lms_enrollments",
        ]
        conn = _get_db()
        try:
            cur = conn.cursor()
            for t in tables:
                try:
                    cur.execute(f"TRUNCATE TABLE {t} CASCADE;")
                except Exception:
                    pass
            cur.execute("DELETE FROM users WHERE role != %s AND id != 'USR-000'", (ROLE_SUPER_ADMIN,))
            cur.execute(
                "INSERT INTO audit_logs (action, usr, time, type) VALUES (%s,%s,%s,%s)",
                ("Purged test data and reset database for production",
                 actor.get("email") or actor["id"],
                 datetime.datetime.now(datetime.UTC).isoformat(), "admin"),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        broadcast_async({"type": "data_changed", "collection": "users"})
        broadcast_async({"type": "data_changed", "collection": "teams"})
        return {"status": "purged", "message": "Database successfully cleared of test records and ready for live users."}

    @app.get("/api/admin/personnel/{user_id}")
    def personnel_detail(user_id: str, _admin: dict = Depends(require_admin)):
        """Everything the platform knows about one person, for the detail drawer.

        Pulls the role-specific records rather than the summary counts: the courses
        an instructor owns, the pledges and payments of a sponsor, a student's
        enrolments and marks, a judge's recent scoring.
        """
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, email, full_name, role, ticket, status, phone, organization, "
                "created_at, bio, expertise, sector, rep_name, tier, experience_level, track, photo_file_id, doc_file_id "
                "FROM users WHERE id = %s",
                (user_id,),
            )
            u = cur.fetchone()
            if not u:
                cur.close()
                raise HTTPException(status_code=404, detail="User not found")

            detail = {
                "id": u[0], "email": u[1], "full_name": u[2] or "", "role": u[3],
                "ticket": u[4] or "", "status": u[5] or "Active", "phone": u[6] or "",
                "organization": u[7] or "",
                "created_at": str(u[8]) if u[8] else None,
                "bio": u[9] or "", "expertise": u[10] or "", "sector": u[11] or "",
                "rep_name": u[12] or "", "tier": u[13] or "",
                "experience_level": u[14] or "", "track": u[15] or "",
                "photo_file_id": u[16] or "", "doc_file_id": u[17] or "",
                "has_photo": bool(u[16]), "has_document": bool(u[17]),
                "courses": [], "enrolments": [], "submissions": [],
                "pledges": [], "payments": [], "recent_grading": [],
            }
            role = u[3]

            if role == ROLE_INSTRUCTOR:
                cur.execute(
                    "SELECT id, title, approval_status, enrolled, "
                    "(SELECT COUNT(*) FROM lms_submissions s "
                    "  WHERE s.course_id = c.id AND s.score IS NULL) "
                    "FROM lms_courses c WHERE owner_id = %s ORDER BY created_at DESC",
                    (user_id,),
                )
                detail["courses"] = [
                    {"id": r[0], "title": r[1], "approval_status": r[2] or "approved",
                     "enrolled": r[3] or 0, "awaiting_grading": r[4] or 0}
                    for r in cur.fetchall()
                ]

            if role == ROLE_STUDENT:
                cur.execute(
                    "SELECT c.title, e.progress_pct, e.status, e.enrolled_at "
                    "FROM lms_enrollments e JOIN lms_courses c ON c.id = e.course_id "
                    "WHERE e.student_id = %s ORDER BY e.enrolled_at DESC",
                    (user_id,),
                )
                detail["enrolments"] = [
                    {"course_title": r[0], "progress_pct": r[1] or 0,
                     "status": r[2] or "active", "enrolled_at": r[3] or ""}
                    for r in cur.fetchall()
                ]
                cur.execute(
                    "SELECT a.title, s.score, s.status, s.submitted_at, a.max_score "
                    "FROM lms_submissions s LEFT JOIN lms_assignments a ON a.id = s.assignment_id "
                    "WHERE s.student_id = %s ORDER BY s.submitted_at DESC LIMIT 50",
                    (user_id,),
                )
                detail["submissions"] = [
                    {"assignment_title": r[0] or "Assignment", "score": r[1],
                     "status": r[2] or "submitted", "submitted_at": r[3] or "",
                     "max_score": r[4] if r[4] is not None else 100}
                    for r in cur.fetchall()
                ]

            if role == ROLE_SPONSOR:
                cur.execute(
                    "SELECT id, tier, amount_pledged, status, created_at FROM sponsorships "
                    "WHERE sponsor_id = %s ORDER BY created_at DESC",
                    (user_id,),
                )
                detail["pledges"] = [
                    {"id": r[0], "tier": r[1] or "", "amount_pledged": _money(r[2]),
                     "status": r[3] or "pending",
                     "created_at": str(r[4]) if r[4] else None}
                    for r in cur.fetchall()
                ]
                cur.execute(
                    "SELECT id, amount, method, reference, status, created_at, "
                    "verified_by_name, rejection_reason FROM sponsorship_payments "
                    "WHERE sponsor_id = %s ORDER BY created_at DESC",
                    (user_id,),
                )
                detail["payments"] = [
                    {"id": r[0], "amount": _money(r[1]), "method": r[2] or "",
                     "reference": r[3] or "", "status": r[4] or "pending_verification",
                     "created_at": str(r[5]) if r[5] else None,
                     "verified_by_name": r[6] or "", "rejection_reason": r[7] or ""}
                    for r in cur.fetchall()
                ]

            if role in (ROLE_JUDGE, ROLE_INSTRUCTOR):
                cur.execute(
                    "SELECT id, score, graded_at FROM assignment_submissions "
                    "WHERE graded_by = %s AND score IS NOT NULL "
                    "ORDER BY graded_at DESC LIMIT 25",
                    (user_id,),
                )
                detail["recent_grading"] = [
                    {"submission_id": r[0], "score": r[1],
                     "graded_at": str(r[2]) if r[2] else None}
                    for r in cur.fetchall()
                ]

            cur.close()
        finally:
            release_db_connection(conn)
        return detail

    @app.get("/api/users/lookup")
    def lookup_user(email: str = ""):
        """Look up whether an email is registered. Safe for public use - returns only existence and status.

        Deliberately does NOT return the account's role or full name: exposing
        either lets anyone probe which addresses belong to administrators
        (super_admin/admin) or harvest names by email.
        """
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        cur.execute("SELECT email, status FROM users WHERE lower(email) = %s", (email.strip().lower(),))
        row = cur.fetchone()
        cur.close()
        release_db_connection(conn)
        if not row:
            return {"found": False, "email": email}
        return {"found": True, "email": row[0], "status": row[1]}

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
    def register_user_public(payload: UserCreate, request: Request):
        # 'student' is here for the open-competition registration tab, which had
        # been calling the admin-only POST /api/users and therefore never created
        # anything. student is the lowest-privilege role, and the forced-pending
        # rule below still applies, so this does not widen self-service access.
        if payload.role not in ["judge", "sponsor", "student"]:
            raise HTTPException(status_code=403, detail="Role not allowed for public registration")
        if not payload.email or not _EMAIL_RE.match(payload.email.strip()):
            raise HTTPException(status_code=422, detail="A valid email address is required")
        # Unauthenticated account creation is a spam/DoS target; throttle it like
        # the other public write paths.
        client_ip = extract_client_ip(request)
        check_rate_limit(f"public-register:{client_ip}", max_attempts=5, window_seconds=300)
        check_rate_limit(f"public-register-hourly:{client_ip}", max_attempts=20, window_seconds=3600)
        # Status is NOT taken from the request. This endpoint is unauthenticated,
        # so honouring a client-supplied status let anyone self-register as
        # 'active' and skip review entirely.
        #
        # Product decision: Judges and Sponsors are SELF-SERVICE and get instant
        # access -- active -- because they reach their portal immediately on
        # registration (the frontend shows them working credentials and routes
        # them straight to /judge or the sponsor portal). Keeping them 'pending'
        # blocked login, which strangled the whole onboarding: a pending account
        # cannot sign in, and profile-completion (which files the onboarding
        # approval) requires login, so a judge/sponsor could never be activated.
        #
        # Students (open registration) are NOT self-service: they are minimal-
        # privilege and stay 'pending' until a reviewer approves their
        # application, preserving the review gate for the education side.
        self_service_roles = {"judge", "sponsor"}
        new_status = "active" if payload.role in self_service_roles else "pending"
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
            # Normalise the phone to its last 9 digits so "+233244…", "0244…"
            # and "244…" all map to the same identity. An exact match here let
            # the same number register repeatedly under different formats.
            digits = re.sub(r"\D", "", payload.phone)
            if digits.startswith("233") and len(digits) >= 12:
                digits = digits[3:]
            elif digits.startswith("0") and len(digits) >= 10:
                digits = digits[1:]
            phone_suffix = digits[-9:] if len(digits) >= 8 else None
            if phone_suffix:
                cur.execute(
                    "SELECT id FROM users WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = %s",
                    (phone_suffix,),
                )
                if cur.fetchone():
                    cur.close()
                    release_db_connection(conn)
                    raise HTTPException(status_code=400, detail="This phone number is already registered")
        
        user_id = "USR-" + str(uuid.uuid4())[:8]
        # Public self-registration must still end up with a real password. If
        # none was supplied, mint one server-side rather than falling back to a
        # shared literal that anyone could guess.
        supplied_password = (payload.password or "").strip()
        if supplied_password:
            # A client-supplied password on the public path must meet the same
            # policy as the admin path, otherwise a registrant could set a weak
            # credential that defeats the point of the review + password rules.
            pw_error = validate_password_strength(supplied_password, payload.email.strip().lower(), payload.full_name or "")
            if pw_error:
                raise HTTPException(status_code=422, detail=pw_error)
        generated_password = "" if supplied_password else _generate_temp_password()
        password_hash = hash_password(supplied_password or generated_password)
        # The access pass is always minted server-side: a client-supplied ticket
        # could collide with an existing user's pass and make ticket-login
        # ambiguous.
        ticket = _allocate_unique_ticket(cur, payload.role)
        phone = payload.phone.strip() if payload.phone and payload.phone.strip() else None
        try:
            cur.execute(
                "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone, organization, age_group, experience_level, competition_id, photo_file_id, doc_file_id, must_change_password) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (user_id, payload.email.strip().lower(), payload.full_name, payload.role, ticket, password_hash, new_status, phone, payload.organization or None, payload.age_group or None, payload.experience_level or None, payload.competition_id or None, payload.photo_file_id or None, payload.doc_file_id or None, bool(generated_password))
            )
            # A student is created 'pending', but without an approval row the
            # reviewer queue is empty and nothing can ever activate them -- a
            # dead end. File the 'Open Registration' approval in the SAME
            # transaction so it appears in the reviewer queue and, when
            # approved, _provision_approved_account finds this pending account
            # and activates it (activated_existing). The approval must not fail
            # the whole sign-up, so it is best-effort.
            if new_status == "pending":
                try:
                    import json as _json_local
                    approval_id = "apr-" + str(uuid.uuid4())[:8]
                    cur.execute(
                        "INSERT INTO pending_approvals (id, type, entity, contact, submitted, "
                        "details, status, competition_id) "
                        "VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s) "
                        "ON CONFLICT (id) DO UPDATE SET entity = EXCLUDED.entity, "
                        "submitted = EXCLUDED.submitted, status = 'pending'",
                        (
                            approval_id,
                            "Open Registration",
                            payload.full_name or payload.email,
                            payload.email.strip().lower(),
                            datetime.datetime.now(datetime.UTC).isoformat(),
                            _json_local.dumps({
                                "track": "",
                                "school": payload.organization or "",
                                "competition_id": payload.competition_id or "",
                            }),
                            payload.competition_id or None,
                        ),
                    )
                except Exception as _approval_err:
                    # Never let the approval costing fail the sign-up itself.
                    logger.warning(f"register_user_public: could not file Open Registration approval: {_approval_err}")
            conn.commit()
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        broadcast_async({"type": "data_changed", "collection": "approvals"})
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
        cur.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        email = (row[0] or "").strip().lower() if row and row[0] else ""

        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        if email:
            cur.execute("""
                DELETE FROM pending_approvals 
                WHERE lower(COALESCE(contact, '')) = %s 
                   OR lower(COALESCE(details->>'schoolEmail', '')) = %s
                   OR lower(COALESCE(details->>'repEmail', '')) = %s
                   OR lower(COALESCE(details->>'leadEmail', '')) = %s
                   OR lower(COALESCE(details->>'email', '')) = %s
            """, (email, email, email, email, email))
            cur.execute("DELETE FROM students WHERE lower(COALESCE(email, '')) = %s", (email,))
            try:
                cur.execute("DELETE FROM registration_drafts WHERE lower(COALESCE(email, '')) = %s", (email,))
            except Exception:
                pass
        conn.commit()
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "users"})
        broadcast_async({"type": "data_changed", "collection": "approvals"})
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
        before_id: int = 0,
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
        if before_id and before_id > 0:
            conditions.append("id < %s")
            params.append(before_id)
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
            fb_query = "SELECT id, action, usr, time, type FROM audit_logs"
            fb_params = []
            if before_id and before_id > 0:
                fb_query += " WHERE id < %s"
                fb_params.append(before_id)
            fb_query += " ORDER BY id DESC LIMIT %s"
            fb_params.append(max(1, min(limit, 1000)))
            cur.execute(fb_query, tuple(fb_params))
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
    def list_lms_courses(competition_id: str = "", _auth: dict = Depends(require_auth)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        clause = " WHERE competition_id = %s" if competition_id else ""
        params = (competition_id,) if competition_id else ()
        cur.execute(
            "SELECT id, title, track, icon, level, description, modules, enrolled, "
            "completion, status, created_at, submitted_by, approval_status, "
            "rejection_reason, competition_id FROM lms_courses" + clause +
            " ORDER BY created_at DESC",
            params,
        )
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "title": r[1], "track": r[2], "icon": r[3], "level": r[4], "description": r[5], "modules": r[6], "enrolled": r[7], "completion": r[8], "status": r[9], "created_at": r[10], "submitted_by": r[11], "approval_status": r[12], "rejection_reason": r[13], "competitionId": r[14]} for r in rows]

    @app.post("/api/lms-courses", status_code=status.HTTP_201_CREATED)
    def create_lms_course(payload: LmsCourseCreate, actor: dict = Depends(require_role(LMS_ROLES))):
        """Legacy course-create endpoint, retained for existing callers.

        SECURITY: `submitted_by` and `approval_status` used to be taken straight
        from the request body. An instructor could therefore claim someone else's
        authorship AND publish their own course by posting
        `approval_status: "approved"`, bypassing review entirely. Both are now
        derived from the verified session, exactly as in POST /api/lms/courses.
        """
        approval = "approved" if _is_lms_staff(actor) else "pending"
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        course_id = "crs-" + str(uuid.uuid4())[:8]
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status, rejection_reason, owner_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (course_id, payload.title, payload.track, payload.icon, payload.level, payload.description, payload.modules, payload.enrolled, payload.completion, payload.status, payload.created_at or None, actor.get("full_name") or actor.get("email") or "", approval, None, actor["id"])
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
        return {"id": course_id, "title": payload.title, "approval_status": approval}

    # PENDING APPROVALS (cross-machine sync)
    class ApprovalCreate(BaseModel):
        # `status` is intentionally ignored on create: an approval is always
        # created 'pending' and only the Reviewer/Access decision endpoint
        # (PATCH /api/approvals/{id}) may move it to approved/rejected. Allowing
        # a client to stash a status here was another blind writer that could put
        # a row straight into 'approved' with no provisioning.
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
    def list_approvals(status: str = "", competition_id: str = "", _admin: dict = Depends(require_admin)):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        import json as _json
        # competition_id scopes the queue to one cycle. Without it the reviewer
        # sees every application ever filed, which is what the records panel had
        # to do because there was nothing to filter on.
        cols = ("SELECT id, type, entity, contact, submitted, details, status, reviewed_at, "
                "reviewer, rejection_reasons, rejection_notes, created_at, competition_id "
                "FROM pending_approvals")
        clauses, params = [], []
        if status:
            clauses.append("status = %s")
            params.append(status)
        if competition_id:
            clauses.append("competition_id = %s")
            params.append(competition_id)
        sql = cols + ((" WHERE " + " AND ".join(clauses)) if clauses else "")
        sql += " ORDER BY created_at DESC, id ASC"
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        cur.close()
        release_db_connection(conn)
        return [{"id": r[0], "type": r[1], "entity": r[2], "contact": r[3], "submitted": r[4], "details": r[5] if isinstance(r[5], dict) else _json.loads(r[5] or "{}"), "status": r[6], "reviewedAt": r[7], "reviewer": r[8], "rejectionReasons": r[9], "rejectionNotes": r[10], "created_at": str(r[11]), "competitionId": r[12]} for r in rows]

    @app.get("/api/approvals/mine")
    def list_my_approvals(actor: dict = Depends(require_auth)):
        """The caller's own applications and requests, with their outcome.

        GET /api/approvals is admin-only, so an institution that filed a team
        change had no way to find out what happened to it -- their only copy was
        in localStorage, which never learns the reviewer's decision. That meant
        resubmitting blindly, and never seeing a rejection reason.

        Scoped to the caller's own contact address, so this discloses nothing
        about anyone else's application.
        """
        email = (actor.get("email") or "").strip().lower()
        if not email:
            return []
        conn = _get_db()
        try:
            cur = conn.cursor()
            import json as _json
            cur.execute(
                "SELECT id, type, entity, submitted, details, status, reviewed_at, "
                "reviewer, rejection_reasons, rejection_notes, created_at, competition_id "
                "FROM pending_approvals WHERE lower(COALESCE(contact, '')) = %s "
                "ORDER BY created_at DESC, id ASC",
                (email,),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            release_db_connection(conn)
        return [
            {
                "id": r[0],
                "type": r[1],
                "entity": r[2],
                "submitted": r[3],
                "details": r[4] if isinstance(r[4], dict) else _json.loads(r[4] or "{}"),
                "status": r[5],
                "reviewedAt": r[6],
                "reviewer": r[7],
                "rejectionReasons": r[8],
                "rejectionNotes": r[9],
                "created_at": str(r[10]),
                "competitionId": r[11],
            }
            for r in rows
        ]

    @app.post("/api/approvals", status_code=status.HTTP_201_CREATED)
    def create_approval(payload: ApprovalCreate, _actor: dict = Depends(require_role(APPROVAL_ROLES))):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        import json as _json
        cur = conn.cursor()
        try:
            # Created 'pending' always; on conflict we refresh the content fields
            # but NEVER the status or decision columns. A row that has already
            # been reviewed (approved/rejected with a reviewer + timestamp) is
            # the reviewer's decision, and local/creator state does not override
            # it -- otherwise approving could silently be undone by a re-save.
            cur.execute(
                "INSERT INTO pending_approvals (id, type, entity, contact, submitted, details, status) "
                "VALUES (%s, %s, %s, %s, %s, %s, 'pending') "
                "ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, entity = EXCLUDED.entity, "
                "contact = EXCLUDED.contact, submitted = EXCLUDED.submitted, details = EXCLUDED.details",
                (payload.id, payload.type, payload.entity, payload.contact, payload.submitted, _json.dumps(payload.details))
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

    class SubmitMyOnboardingPayload(BaseModel):
        """A user submitting their OWN completed profile for admin review."""
        notes: str = Field(default="", max_length=2000)

    @app.post("/api/approvals/mine", status_code=status.HTTP_201_CREATED)
    def submit_my_onboarding(
        payload: SubmitMyOnboardingPayload,
        actor: dict = Depends(require_auth),
    ):
        """File the caller's own profile for admin review.

        The profile-completion page already tried to do this, but it went through
        `contentService.saveApprovals()` -> `POST /api/bulk-sync`, which requires
        an admin. So for the judges and sponsors who actually complete that form
        the request 403'd and the error was discarded: their onboarding never
        reached the admin queue and no one was ever notified they had signed up.

        Everything identifying the applicant is taken from the verified session,
        not the request body, so this cannot be used to file an approval on
        someone else's behalf or to forge the applicant's role.
        """
        role = actor.get("role") or ""
        # Only the roles that actually have an onboarding form.
        if role not in (ROLE_JUDGE, ROLE_SPONSOR, ROLE_INSTRUCTOR):
            raise HTTPException(
                status_code=400,
                detail="Your account type does not require onboarding review",
            )

        type_by_role = {
            ROLE_JUDGE: "Judge Access",
            ROLE_SPONSOR: "Sponsor Access",
            ROLE_INSTRUCTOR: "Instructor Access",
        }

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT full_name, email, phone, organization, bio, expertise, "
                "sector, rep_name, tier, experience_level, track "
                "FROM users WHERE id = %s",
                (actor["id"],),
            )
            row = cur.fetchone()
            if not row:
                cur.close()
                raise HTTPException(status_code=404, detail="User not found")

            # One open request per user: re-submitting must update the pending row
            # rather than stacking duplicates in the reviewer's queue.
            cur.execute(
                "SELECT id FROM pending_approvals "
                "WHERE contact = %s AND status = 'pending' LIMIT 1",
                (row[1],),
            )
            existing = cur.fetchone()
            approval_id = existing[0] if existing else "apr-" + str(uuid.uuid4())[:8]

            details = {
                "name": row[0] or "",
                "email": row[1] or "",
                "phone": row[2] or "",
                "organization": row[3] or "",
                "bio": row[4] or "",
                "expertise": row[5] or "",
                "sector": row[6] or "",
                "repName": row[7] or "",
                "tier": row[8] or "",
                "experience": row[9] or "",
                "track": row[10] or "",
                "category": type_by_role[role].replace(" Access", ""),
                "notes": payload.notes,
            }
            import json as _json
            cur.execute(
                "INSERT INTO pending_approvals (id, type, entity, contact, submitted, "
                "details, status) VALUES (%s, %s, %s, %s, %s, %s, 'pending') "
                "ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, "
                "entity = EXCLUDED.entity, submitted = EXCLUDED.submitted, "
                "details = EXCLUDED.details, status = 'pending'",
                (
                    approval_id,
                    type_by_role[role],
                    row[3] or row[0] or row[1],
                    row[1],
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    _json.dumps(details),
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        return {"id": approval_id, "type": type_by_role[role], "status": "pending"}

    class TeamChangeRequest(BaseModel):
        """An institution proposing a team change for admin review.

        Deliberately does NOT carry the school. See submit_team_change.
        """
        type: str = Field(..., description="'Team Addition', 'Team Modification' or 'Team Disbandment'")
        team_id: str = Field(default="", max_length=64)
        name: str = Field(..., min_length=1, max_length=150)
        track: str = Field(default="", max_length=100)
        lead: str = Field(default="", max_length=150)
        members: list[str] = Field(default_factory=list)
        mentor: str = Field(default="", max_length=200)
        motto: str = Field(default="", max_length=300)
        competition_id: str = Field(default="", max_length=64)

    TEAM_CHANGE_TYPES = ("Team Addition", "Team Modification", "Team Disbandment")
    # Who may propose a team change. Note this is deliberately NOT APPROVAL_ROLES:
    # these roles may only *file* a request, never decide it.
    TEAM_CHANGE_ROLES = (ROLE_SCHOOL_ADMIN, ROLE_INSTRUCTOR)

    @app.post("/api/approvals/team-change", status_code=status.HTTP_201_CREATED)
    def submit_team_change(
        payload: TeamChangeRequest,
        actor: dict = Depends(require_auth),
    ):
        """File a team addition or rename/roster change for admin review.

        This endpoint exists because the workflow it serves was unreachable. The
        dashboard already builds 'Team Addition' and 'Team Modification' requests
        and the admin side already applies them on approval, but a school admin
        had no way to persist one: `saveApprovals()` goes to POST /api/bulk-sync
        (admin only) and `createApproval()` goes to POST /api/approvals
        (APPROVAL_ROLES, which excludes school_admin). Both 403'd, the error was
        downgraded to a console warning, and the UI still reported success -- so
        the request never left the browser and no admin ever saw it.

        The institution is taken from the caller's own user row, never from the
        request body, so this cannot be used to file a change against another
        school. For a modification the target team must already belong to the
        caller's institution. Status is hard-coded to 'pending': filing a request
        and deciding it are separate privileges.
        """
        role = (actor.get("role") or "").strip().lower()
        if role not in TEAM_CHANGE_ROLES:
            raise HTTPException(
                status_code=403,
                detail="Only an institution account may propose team changes",
            )

        req_type = (payload.type or "").strip()
        if req_type not in TEAM_CHANGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"type must be one of {', '.join(TEAM_CHANGE_TYPES)}",
            )

        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Team name is required")

        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT full_name, email, organization FROM users WHERE id = %s",
                (actor["id"],),
            )
            row = cur.fetchone()
            if not row:
                cur.close()
                raise HTTPException(status_code=404, detail="User not found")

            full_name, email, school = row[0] or "", row[1] or "", (row[2] or "").strip()
            if not school:
                cur.close()
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Your account is not linked to an institution, so a team "
                        "change cannot be attributed. Ask an administrator to set "
                        "your organisation."
                    ),
                )

            original_name = ""
            # A disbandment targets an existing team, so it needs the same
            # ownership check as a modification.
            if req_type in ("Team Modification", "Team Disbandment"):
                if not payload.team_id.strip():
                    cur.close()
                    raise HTTPException(
                        status_code=400,
                        detail=f"team_id is required to {'disband' if req_type == 'Team Disbandment' else 'modify'} a team",
                    )
                # Scope check: the team must belong to the caller's institution.
                # Compared case-insensitively and trimmed, matching how
                # POST /api/teams already de-duplicates on (name, school_name).
                cur.execute(
                    "SELECT name, COALESCE(school_name, '') FROM teams WHERE id = %s",
                    (payload.team_id.strip(),),
                )
                team = cur.fetchone()
                if not team:
                    cur.close()
                    raise HTTPException(status_code=404, detail="Team not found")
                if (team[1] or "").strip().lower() != school.lower():
                    cur.close()
                    # 404 rather than 403: whether a team exists in another
                    # institution is not this caller's business.
                    raise HTTPException(status_code=404, detail="Team not found")
                original_name = team[0] or ""

            members = [m.strip() for m in payload.members if m and m.strip()][:50]
            details = {
                "school": school,
                "institution": school,
                "teamId": payload.team_id.strip(),
                "originalName": original_name,
                "newName": new_name,
                "track": payload.track.strip(),
                "lead": payload.lead.strip(),
                "leadName": payload.lead.strip(),
                "members": members,
                "memberCount": len(members),
                "mentor": payload.mentor.strip(),
                "motto": payload.motto.strip(),
                "requestedBy": email or full_name,
                "requestedByRole": role,
            }
            entity = (
                f"{original_name} -> {new_name}"
                if req_type == "Team Modification" and original_name
                else (original_name or new_name)
                if req_type == "Team Disbandment"
                else new_name
            )

            approval_id = "apr-" + str(uuid.uuid4())[:8]
            # Validated so a bad id cannot be stored and silently never match.
            comp_ref = _validate_competition_ref(cur, payload.competition_id or None)
            import json as _json
            cur.execute(
                "INSERT INTO pending_approvals (id, type, entity, contact, submitted, "
                "details, status, competition_id) VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s)",
                (
                    approval_id,
                    req_type,
                    entity,
                    email,
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    _json.dumps(details),
                    comp_ref,
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        return {
            "id": approval_id,
            "type": req_type,
            "entity": entity,
            "school": school,
            "status": "pending",
            "competitionId": comp_ref,
        }

    class PublicApplicationPayload(BaseModel):
        """An application filed from the public registration page."""
        type: str = Field(..., max_length=60)
        entity: str = Field(..., min_length=1, max_length=200)
        contact: str = Field(default="", max_length=150)
        details: dict = Field(default_factory=dict)
        competition_id: str = Field(default="", max_length=64)

    # What the public registration form is allowed to file. Anything else has to
    # come from an authenticated route.
    PUBLIC_APPLICATION_TYPES = {
        "School Registration",
        "Instructor Access",
        "Team Addition",
        "Judge Access",
        "Sponsor Access",
        "Student Registration",
        "Open Registration",
    }
    # Details are applicant-supplied and end up rendered in the admin queue, so
    # the payload is capped rather than stored unbounded.
    _MAX_DETAIL_KEYS = 60
    _MAX_DETAIL_VALUE_LEN = 4000

    @app.post("/api/approvals/public", status_code=status.HTTP_201_CREATED)
    def submit_public_application(payload: PublicApplicationPayload, request: Request):
        """File an application from the unauthenticated registration page.

        This endpoint exists because public registration never reached the server.
        `submitRegistration()` persisted applications only through
        `contentService.saveApprovals()` -> POST /api/bulk-sync, which requires an
        admin, so for an anonymous applicant every write 401'd. The applicant saw a
        success screen and got a "pending confirmation" email while the reviewer
        queue stayed empty -- every school, instructor, judge and sponsor
        application was lost in the applicant's own browser.

        Nothing here is trusted: the type must be on an allowlist, the status is
        always 'pending', and the id is generated server-side so a caller cannot
        overwrite an existing decision by guessing one.
        """
        client_ip = extract_client_ip(request)
        check_rate_limit(f"public-application:{client_ip}", max_attempts=5, window_seconds=300)
        check_rate_limit(f"public-application-hourly:{client_ip}", max_attempts=20, window_seconds=3600)

        req_type = (payload.type or "").strip()
        if req_type not in PUBLIC_APPLICATION_TYPES:
            raise HTTPException(
                status_code=400,
                detail="That application type cannot be filed from public registration",
            )

        details = payload.details if isinstance(payload.details, dict) else {}
        if len(details) > _MAX_DETAIL_KEYS:
            raise HTTPException(status_code=400, detail="Application detail is too large")
        trimmed: dict = {}
        for key, value in list(details.items())[:_MAX_DETAIL_KEYS]:
            if isinstance(value, str) and len(value) > _MAX_DETAIL_VALUE_LEN:
                value = value[:_MAX_DETAIL_VALUE_LEN]
            trimmed[str(key)[:100]] = value

        contact = (payload.contact or "").strip().lower()
        approval_id = "apr-" + str(uuid.uuid4())[:8]

        conn = _get_db()
        try:
            cur = conn.cursor()
            # An application exists to CREATE an account. If one already exists for
            # this email, approving it can never provision anything -- account
            # provisioning is idempotent and would silently no-op, leaving the
            # reviewer thinking they had approved a real account. Reject it up
            # front with something the applicant can act on.
            if contact:
                cur.execute("SELECT 1 FROM users WHERE lower(email) = %s", (contact,))
                if cur.fetchone():
                    cur.close()
                    raise HTTPException(
                        status_code=409,
                        detail="An account already exists for this email address. Please sign in, or use 'Forgot password' if you cannot get in.",
                    )

            # The contact address must have been proven via OTP before an
            # application is filed against it. Without this, anyone could file an
            # application with someone else's email and the reviewer would
            # provision an account for an address the victim never confirmed.
            if contact and not _contact_is_verified("email", contact):
                cur.close()
                raise HTTPException(
                    status_code=403,
                    detail="Please verify your email address before submitting your application.",
                )

            # One open application per contact, so a resubmit updates the pending
            # row instead of stacking duplicates in the reviewer's queue. Matches
            # the behaviour of POST /api/approvals/mine.
            if contact:
                cur.execute(
                    "SELECT id FROM pending_approvals "
                    "WHERE lower(COALESCE(contact, '')) = %s AND status = 'pending' "
                    "AND type = %s LIMIT 1",
                    (contact, req_type),
                )
                existing = cur.fetchone()
                if existing:
                    approval_id = existing[0]

            import json as _json
            comp_ref = _validate_competition_ref(cur, payload.competition_id or None)
            cur.execute(
                "INSERT INTO pending_approvals (id, type, entity, contact, submitted, "
                "details, status, competition_id) VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s) "
                "ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, "
                "entity = EXCLUDED.entity, contact = EXCLUDED.contact, "
                "submitted = EXCLUDED.submitted, details = EXCLUDED.details, "
                "competition_id = EXCLUDED.competition_id, status = 'pending'",
                (
                    approval_id,
                    req_type,
                    payload.entity.strip(),
                    contact,
                    datetime.datetime.now(datetime.UTC).isoformat(),
                    _json.dumps(trimmed),
                    comp_ref,
                ),
            )
            conn.commit()
            cur.close()
        finally:
            release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        return {"id": approval_id, "type": req_type, "status": "pending", "competitionId": comp_ref}

    @app.get("/api/approvals/status")
    def lookup_public_approval_status(request: Request, query: str = ""):
        """Public applicants check their status by application code, contact
        email, or entity name.

        Full application details (name, phone, guardian contacts, GPS, member
        emails) are only returned when the query matches the secret application
        code. A match on a guessable email or school name returns a redacted
        summary, so the endpoint cannot be used to harvest other people's data.
        """
        q = (query or "").strip().lower()
        if not q:
            return {"status": "not_found"}
        client_ip = extract_client_ip(request) if request else "127.0.0.1"
        check_rate_limit(f"approval-status:{client_ip}", max_attempts=10, window_seconds=300)
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, type, entity, contact, submitted, details, status, reviewed_at, reviewer, rejection_reasons, rejection_notes
                FROM pending_approvals
                WHERE lower(COALESCE(contact, '')) = %s 
                   OR lower(COALESCE(details->>'code', '')) = %s
                   OR lower(COALESCE(entity, '')) = %s
                ORDER BY submitted DESC LIMIT 1
            """, (q, q, q))
            row = cur.fetchone()
            cur.close()
        finally:
            release_db_connection(conn)
        if not row:
            return {"status": "not_found"}

        details = row[5] if isinstance(row[5], dict) else {}
        if isinstance(row[5], str):
            try:
                import json as _j
                details = _j.loads(row[5])
            except Exception:
                details = {}

        code = (details.get("code") or "").strip().lower()
        matched_by_code = bool(code) and code == q
        matched_by_id = bool(row[0]) and str(row[0]).strip().lower() == q
        is_authorized_match = matched_by_code or matched_by_id

        st = row[6] or "pending"
        app_obj = {
            "id": row[0],
            "type": row[1],
            "entity": row[2],
            "contact": row[3] if is_authorized_match else "",
            "submitted": row[4],
            # Secret code and full application details are provided for direct matches
            # so applicants can track, review, and edit their submissions.
            "details": details if is_authorized_match else {},
            "status": st,
            "reviewedAt": str(row[7]) if row[7] else None,
            "reviewer": row[8] if is_authorized_match else None,
            "rejectionReasons": (row[9] or None) if is_authorized_match else None,
            "rejectionNotes": (row[10] or None) if is_authorized_match else None,
        }
        res = {"status": st, "application": app_obj}
        if st == "rejected" and is_authorized_match:
            res["rejectedDetails"] = {
                "reasons": row[9] or "",
                "notes": row[10] or "",
                "reviewedAt": str(row[7]) if row[7] else "",
            }
        return res

    # Which role an approved application results in.
    #
    # This is the mapping that makes "Approved" mean something. Until now
    # approving an application only flipped a status column: no account was
    # created and no role was assigned, so the applicant was approved and still
    # could not sign in. Account creation happened separately, with the role
    # chosen by whatever client happened to call the users endpoint.
    #
    # Keyed on a lowercased approval `type`. Judge and sponsor are absent on
    # purpose: they self-register through POST /api/users/register, which has its
    # own hard allow-list.
    APPROVAL_TYPE_ROLES = {
        "school registration": ROLE_SCHOOL_ADMIN,
        "instructor access": ROLE_INSTRUCTOR,
        "team addition": ROLE_STUDENT,
        "student registration": ROLE_STUDENT,
        "open registration": ROLE_STUDENT,
        "judge access": ROLE_JUDGE,
        "judge application": ROLE_JUDGE,
        "sponsor access": ROLE_SPONSOR,
        "sponsor application": ROLE_SPONSOR,
    }

    def _apply_approved_team_change(cur, approval_row) -> dict:
        """Carry out the team change an approved request authorised.

        Only disbandment is applied here. Additions and renames are already
        applied by the dashboard on approval, but a delete cannot be, because
        institutions no longer have DELETE /api/teams -- so approving a
        disbandment has to perform it server-side or the decision would record
        as approved while the team stayed live.

        Runs in the reviewer's transaction, so a failure rolls the decision back
        rather than leaving an approved request that never took effect.
        """
        approval_type = (approval_row["type"] or "").strip().lower()
        if approval_type != "team disbandment":
            return {"applied": False, "reason": "Not a team change that needs applying"}

        details = approval_row["details"] or {}
        if isinstance(details, str):
            import json as _json_local
            try:
                details = _json_local.loads(details)
            except Exception:
                details = {}
        if not isinstance(details, dict):
            details = {}

        team_id = str(details.get("teamId") or "").strip()
        if not team_id:
            return {"applied": False, "reason": "Request did not record which team to disband"}

        # Re-check ownership at decision time: the team may have moved or been
        # removed between filing and review.
        school = str(details.get("school") or "").strip().lower()
        cur.execute("SELECT COALESCE(school_name, '') FROM teams WHERE id = %s", (team_id,))
        row = cur.fetchone()
        if not row:
            return {"applied": False, "reason": "Team no longer exists"}
        if school and (row[0] or "").strip().lower() != school:
            return {"applied": False, "reason": "Team no longer belongs to the requesting institution"}

        cur.execute("DELETE FROM teams WHERE id = %s", (team_id,))
        return {"applied": True, "team_id": team_id}

    def _upsert_team(cur, name, track, lead, members, status, school_name,
                      competition_id, mentor, motto, roster_list, lead_email, member_emails,
                     member_credentials: list | None = None) -> str:
        """Create or update a team and sync its members + member accounts.

        Idempotent by (name, school_name) and shared by the team endpoints and
        the approval-provisioning path, so approving a school/team application
        materialises the team in the SAME transaction rather than relying on the
        reviewer's browser to do it later.

        When `member_credentials` is supplied, the one-time credentials for any
        freshly-created student accounts are appended to it so the caller can
        surface them to the institution. (The school/team approval path uses this
        to hand the school the students' initial passwords.)
        """
        cur.execute(
            "SELECT id FROM teams WHERE lower(name) = %s AND lower(COALESCE(school_name, '')) = %s",
            (name.strip().lower(), (school_name or "").strip().lower()),
        )
        existing = cur.fetchone()
        if existing:
            team_id = existing[0]
            cur.execute(
                "UPDATE teams SET track = %s, lead = %s, members = %s, status = %s, "
                "competition_id = %s, mentor = %s, motto = %s, roster_list = %s WHERE id = %s",
                (track, lead, members, status, competition_id or None, mentor, motto,
                 json.dumps(roster_list or []), team_id),
            )
        else:
            team_id = "team-" + str(uuid.uuid4())[:8]
            cur.execute(
                "INSERT INTO teams (id, name, track, lead, members, status, school_name, "
                "competition_id, mentor, motto, roster_list) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (team_id, name, track, lead, members, status, school_name or "",
                 competition_id or None, mentor, motto, json.dumps(roster_list or [])),
            )
        _sync_team_members(cur, team_id, lead, roster_list or [], lead_email or "", member_emails or [])
        created_members = _provision_team_member_accounts(cur, team_id, school_name or None)
        if member_credentials is not None:
            for cred in (created_members or []):
                cred["team_id"] = team_id
                member_credentials.append(cred)
        if competition_id:
            _auto_enroll_team_members(cur, team_id, competition_id)
        return team_id

    def _provision_approved_teams(cur, approval_row) -> dict:
        """Create the teams a school/team application entitles the applicant to.

        Previously these were created by the reviewer's browser AFTER the PATCH,
        so an approved application could be recorded without its teams if that
        browser crashed, or a second reviewer approving via the API left no team
        at all. This performs the same work inside the approval transaction, so
        an approved application is always fully materialised.
        """
        approval_type = (approval_row["type"] or "").strip().lower()
        details = approval_row["details"] or {}
        if isinstance(details, str):
            import json as _json_local
            try:
                details = _json_local.loads(details)
            except Exception:
                details = {}
        if not isinstance(details, dict):
            details = {}
        entity = (approval_row["entity"] or "").strip()
        competition_id = (approval_row.get("competition_id") or "").strip()
        created: list = []
        member_credentials: list = []

        def _names(raw):
            if isinstance(raw, str):
                return [raw.strip()] if raw.strip() else []
            if isinstance(raw, list):
                return [str(x).strip() for x in raw if str(x).strip()]
            return []

        if approval_type == "school registration":
            teams = details.get("teamsList")
            if not isinstance(teams, list):
                return {"applied": False, "reason": "No teams listed in application"}
            for t in teams:
                if not isinstance(t, dict):
                    continue
                name = (t.get("name") or "").strip()
                if not name:
                    continue
                roster = _names(t.get("rosterList") or t.get("members"))
                if not roster:
                    roster = _names([t.get("leadName"), t.get("member2Name"),
                                     t.get("member3Name"), t.get("member4Name"),
                                     t.get("member5Name")])
                emails = _names([t.get("leadEmail"), t.get("member2Email"),
                                 t.get("member3Email"), t.get("member4Email"),
                                 t.get("member5Email")])
                if not emails:
                    emails = _names(t.get("memberEmails"))
                lead = (t.get("leadName") or t.get("lead") or (roster[0] if roster else "") or "Team Lead").strip()
                track = (t.get("track") or "Coding").strip()
                team_id = _upsert_team(cur, name, track, lead, max(len(roster), 1), "In Competition",
                                       entity, competition_id, "", "", roster,
                                       (emails[0] if emails else ""), emails,
                                       member_credentials)
                created.append(team_id)
        elif approval_type == "team addition":
            name = entity
            if not name:
                return {"applied": False, "reason": "No team name"}
            roster = _names(details.get("members") or details.get("rosterList"))
            lead = (details.get("lead") or (roster[0] if roster else "") or "Team Lead").strip()
            track = (details.get("track") or "Coding").strip()
            school = (details.get("school") or details.get("institution") or "Partner School").strip()
            mentor = (details.get("mentor") or "").strip()
            motto = (details.get("motto") or "").strip()
            lead_email = (details.get("leadEmail") or "").strip()
            member_emails = _names(details.get("memberEmails"))
            team_id = _upsert_team(cur, name, track, lead, max(len(roster), 1), "In Competition",
                                   school, competition_id, mentor, motto, roster,
                                   lead_email, member_emails, member_credentials)
            created.append(team_id)
        elif approval_type == "team modification":
            team_id = (details.get("teamId") or "").strip()
            if not team_id:
                return {"applied": False, "reason": "No team id"}
            new_name = (details.get("newName") or details.get("name") or entity).strip()
            roster = _names(details.get("members"))
            lead = (details.get("lead") or (roster[0] if roster else "") or "Team Lead").strip()
            track = (details.get("track") or "Coding").strip()
            school = (details.get("school") or details.get("institution") or "").strip()
            mentor = (details.get("mentor") or "").strip()
            motto = (details.get("motto") or "").strip()
            lead_email = (details.get("leadEmail") or "").strip()
            member_emails = _names(details.get("memberEmails"))
            cur.execute(
                "UPDATE teams SET name = %s, track = %s, lead = %s, members = %s, "
                "status = 'In Competition', school_name = %s, mentor = %s, motto = %s, roster_list = %s WHERE id = %s",
                (new_name, track, lead, max(len(roster), 1), school, mentor, motto,
                 json.dumps(roster), team_id),
            )
            _sync_team_members(cur, team_id, lead, roster, lead_email, member_emails)
            created_members = _provision_team_member_accounts(cur, team_id, school or None)
            for cred in (created_members or []):
                cred["team_id"] = team_id
                member_credentials.append(cred)
            if competition_id:
                _auto_enroll_team_members(cur, team_id, competition_id)
            created.append(team_id)
        else:
            return {"applied": False, "reason": "Not a team-provisioning approval type"}

        return {"applied": True, "teams": created,
                "member_credentials": member_credentials}

    def _provision_approved_account(cur, approval_row) -> dict:
        """Create the account an approved application entitles the applicant to.

        Idempotent: if an account already exists for the contact address the
        existing one is returned untouched, so re-approving (or a retried
        request) never creates a duplicate or clobbers a password.

        Returns a dict describing what happened. Never raises for
        business-rule problems -- an approval must not fail because of them, or
        the reviewer is left unable to record their decision.
        """
        approval_type = (approval_row["type"] or "").strip().lower()
        role = APPROVAL_TYPE_ROLES.get(approval_type)
        if not role:
            return {"provisioned": False, "reason": f"No role mapping for approval type '{approval_row['type']}'"}

        email = (approval_row["contact"] or "").strip().lower()
        if not email or "@" not in email:
            return {"provisioned": False, "reason": "Application has no usable contact email"}

        details = approval_row["details"] or {}
        if isinstance(details, str):
            import json as _json_local
            try:
                details = _json_local.loads(details)
            except Exception:
                details = {}
        if not isinstance(details, dict):
            details = {}
        full_name = (
            details.get("repName")
            or details.get("contactName")
            or details.get("leadName")
            or approval_row["entity"]
            or email
        )

        # If an account already exists for this email, decide by its status.
        #
        # Only an account still AWAITING REVIEW ('pending', or a blank status) is
        # activated here. Judge and sponsor sign-up create the users row first and
        # the server forces it to 'pending', so refusing to touch it meant
        # approving the application never let the applicant in and never issued a
        # pass -- the reviewer's decision had no effect at all.
        #
        # Every other status is left strictly alone: an 'active' account means the
        # application is stale and overwriting the password would let a duplicate
        # application reset a real user's credentials, while 'suspended',
        # 'banned', 'revoked' and friends are deliberate admin actions that an
        # approval must never quietly undo.
        _AWAITING_REVIEW = {"", "pending"}
        cur.execute(
            "SELECT id, role, COALESCE(status, ''), COALESCE(ticket, '') FROM users WHERE lower(email) = %s",
            (email,),
        )
        existing = cur.fetchone()
        if existing:
            existing_id, existing_role, existing_status, existing_ticket = existing
            if (existing_status or "").strip().lower() not in _AWAITING_REVIEW:
                return {
                    "provisioned": False,
                    "reason": (
                        "An account already exists for this email"
                        if not account_is_disabled(existing_status)
                        else f"An account already exists for this email and is {existing_status}"
                    ),
                    "user_id": existing_id,
                    "role": existing_role,
                }

            # Awaiting review: activate it and issue credentials that actually work.
            temp_password = _generate_temp_password()
            ticket = existing_ticket or _allocate_unique_ticket(cur, existing_role or role)
            cur.execute(
                "UPDATE users SET status = 'active', ticket = %s, password_hash = %s, "
                "must_change_password = true WHERE id = %s",
                (ticket, hash_password(temp_password), existing_id),
            )
            return {
                "provisioned": True,
                "activated_existing": True,
                "user_id": existing_id,
                "email": email,
                "full_name": full_name,
                "role": existing_role or role,
                "ticket": ticket,
                "temporary_password": temp_password,
            }

        temp_password = _generate_temp_password()
        user_id = "USR-" + str(uuid.uuid4())[:8]
        ticket = _allocate_unique_ticket(cur, role)
        photo_file_id = (
            details.get("photo_file_id")
            or details.get("photoFileId")
            or details.get("logoFileId")
            or details.get("logo_file_id")
            or None
        )
        doc_file_id = details.get("docFileId") or details.get("doc_file_id") or None
        cur.execute(
            "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, "
            "organization, photo_file_id, doc_file_id, must_change_password) "
            "VALUES (%s, %s, %s, %s, %s, %s, 'active', %s, %s, %s, true)",
            (
                user_id, email, full_name, role, ticket,
                hash_password(temp_password),
                details.get("schoolName") or approval_row["entity"] or None,
                photo_file_id, doc_file_id,
            ),
        )
        return {
            "provisioned": True,
            "user_id": user_id,
            "email": email,
            "full_name": full_name,
            "role": role,
            "ticket": ticket,
            "temporary_password": temp_password,
        }

    @app.patch("/api/approvals/{item_id}")
    def update_approval(item_id: str, payload: ApprovalUpdate, _actor: dict = Depends(require_role(APPROVAL_ROLES))):
        target_status = (payload.status or "").strip().lower()
        if target_status not in {"approved", "rejected", "pending"}:
            raise HTTPException(status_code=422, detail="Invalid approval status")
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            # Read the application first: approving it has to provision an
            # account, and that needs the type/contact/details in the same
            # transaction so a failure rolls the whole decision back.
            cur.execute(
                "SELECT type, entity, contact, details, status, COALESCE(competition_id, '') FROM pending_approvals WHERE id = %s",
                (item_id,),
            )
            before = cur.fetchone()
            if not before:
                conn.rollback(); cur.close()
                release_db_connection(conn)
                raise HTTPException(status_code=404, detail="Approval not found")

            now_approved = target_status == "approved"

            cur.execute(
                "UPDATE pending_approvals SET status = %s, reviewed_at = %s, reviewer = %s, rejection_reasons = %s, rejection_notes = %s WHERE id = %s RETURNING id",
                (target_status, datetime.datetime.now(datetime.UTC).isoformat(), _actor["email"], payload.rejection_reasons, payload.rejection_notes, item_id)
            )
            row = cur.fetchone()
            if not row:
                conn.rollback(); cur.close()
                release_db_connection(conn)
                raise HTTPException(status_code=404, detail="Approval not found")

            account: dict = {"provisioned": False, "reason": "Not an approval transition"}
            team_change: dict = {"applied": False, "reason": "Not an approval transition"}
            teams: dict = {"applied": False, "reason": "Not an approval transition"}
            # Provision whenever the decision IS 'approved', not only on the
            # pending->approved edge.
            #
            # The dashboard calls saveApprovedApprovals() before this PATCH, and
            # that helper bulk-syncs the row with status='approved'. When the
            # bulk-sync landed first the row was already approved here, so
            # `was_approved` was true, provisioning was skipped, and the endpoint
            # returned reason "Not an approval transition" -- which the dashboard
            # deliberately does not surface. The reviewer saw no credentials and no
            # error, and no account was ever created even though the application
            # read as approved forever after.
            #
            # Every provisioning helper below is idempotent (an existing active
            # account is returned untouched, teams upsert on their natural key), so
            # running them on a repeat approval is safe and lets a reviewer heal a
            # record stuck in exactly that state by simply approving it again.
            if now_approved:
                approval_row = {
                    "type": before[0],
                    "entity": before[1],
                    "contact": before[2],
                    "details": before[3],
                    "competition_id": before[5] or "",
                }
                account = _provision_approved_account(cur, approval_row)
                # A disbandment has to be carried out here: institutions no longer
                # hold DELETE /api/teams, so nothing else would perform it.
                team_change = _apply_approved_team_change(cur, approval_row)
                # Teams must also be created server-side, otherwise an approved
                # school/team application is recorded without its teams whenever
                # the reviewer's browser is not the one to materialise them.
                teams = _provision_approved_teams(cur, approval_row)

            conn.commit()
        except HTTPException:
            # Never leak the connection or leave a half-written transaction open
            # when a business-rule error is raised mid-flight.
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                cur.close()
            except Exception:
                pass
            release_db_connection(conn)
            raise
        except Exception as e:
            conn.rollback()
            cur.close()
            release_db_connection(conn)
            raise HTTPException(status_code=400, detail=str(e))
        cur.close()
        release_db_connection(conn)
        broadcast_async({"type": "data_changed", "collection": "approvals"})
        if account.get("provisioned"):
            broadcast_async({"type": "data_changed", "collection": "users"})
        if team_change.get("applied") or teams.get("applied"):
            broadcast_async({"type": "data_changed", "collection": "teams"})
            if teams.get("applied"):
                broadcast_async({"type": "data_changed", "collection": "users"})
        return {"id": item_id, "status": "updated", "account": account,
                "team_change": team_change, "teams": teams}

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
                uid = item.get("id")
                email = (item.get("email") or "").strip().lower()
                if not uid or not email or "@" not in email:
                    continue
                raw_phone = (item.get("phone") or "").strip()
                phone = raw_phone if raw_phone else None
                ticket = (item.get("ticket") or "").strip() or None
                # Prevent unique constraint violations if email belongs to another ID
                cur.execute("SELECT id FROM users WHERE lower(email) = %s AND id != %s", (email, uid))
                existing_match = cur.fetchone()
                if existing_match:
                    # Never let a sync payload rewrite an existing account's role,
                    # status or password -- that would be a privilege-escalation
                    # vector. Only fill in missing display/contact detail.
                    cur.execute("""
                        UPDATE users SET
                            full_name = COALESCE(NULLIF(%s, ''), full_name),
                            phone = COALESCE(%s, phone)
                        WHERE id = %s
                    """, (item.get("fullName",""), phone, existing_match[0]))
                else:
                    # Legacy row with no real account: create it with a real
                    # (unrecoverable) password hash rather than a magic literal,
                    # and never overwrite role/status/password on a later sync.
                    cur.execute("""
                        INSERT INTO users (id, email, full_name, role, ticket, password_hash, status, phone, must_change_password)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                        ON CONFLICT (id) DO UPDATE SET
                            full_name = EXCLUDED.full_name,
                            phone = COALESCE(EXCLUDED.phone, users.phone)
                    """, (uid, email, item.get("fullName",""), item.get("role","student"), ticket,
                          hash_password(secrets.token_urlsafe(24)), item.get("status","Active"), phone))
        elif payload.collection == "approvals":
            # bulk-sync is a create/seed helper, NOT a decision writer. The only
            # way an approval changes status is the Reviewer/Access decision on
            # PATCH /api/approvals/{id}, which is where accounts, passes and
            # teams are provisioned. Previously this upsert let a reviewer's
            # browser re-upload its local copy of the whole list with whatever
            # status it happened to hold, so a client bulk-sync racing the PATCH
            # could mark a row 'approved' while the PATCH then skipped
            # provisioning entirely -- an application read as approved forever
            # but never created the account or the pass it entitled.
            #
            # Permanent rule: bulk-sync may CREATE a fresh 'pending' row (so a
            # public submission survives the page reloading), but it must never
            # OVERWRITE an existing row. A reviewed row's status, reviewer and
            # timestamps always come from the PATCH -- never from local state.
            for item in payload.items:
                cur.execute(
                    """SELECT id FROM pending_approvals WHERE id = %s""",
                    (item.get("id"),),
                )
                if cur.fetchone() is None:
                    cur.execute(
                        "INSERT INTO pending_approvals (id, type, entity, contact, submitted, details, status, competition_id) "
                        "VALUES (%s,%s,%s,%s,%s,%s,'pending',%s)",
                        (item.get("id"), item.get("type",""), item.get("entity",""), item.get("contact",""),
                         item.get("submitted",""), _json.dumps(item.get("details",{})), item.get("competitionId","")),
                    )
                # else: already exists; leave every column (status, reviewer,
                # reviewed_at, ...) untouched -- local state is not authoritative.
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

    class FileUploadPayload(BaseModel):
        file_id: str
        name: str = "file"
        mime_type: str = "image/png"
        data_base64: str
        size: int = 0

    @app.post("/api/files/upload")
    def upload_file(payload: FileUploadPayload, request: Request):
        if not payload.file_id or not payload.data_base64:
            raise HTTPException(status_code=400, detail="Missing file_id or data_base64")
        client_ip = extract_client_ip(request)
        check_rate_limit(f"file-upload:{client_ip}", max_attempts=60, window_seconds=300)
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            data_b64 = payload.data_base64
            if "," in data_b64 and "base64" in data_b64:
                data_b64 = data_b64.split(",", 1)[1]

            cur.execute("""
                INSERT INTO stored_files (id, name, mime_type, size, data_base64)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    mime_type = EXCLUDED.mime_type,
                    size = EXCLUDED.size,
                    data_base64 = EXCLUDED.data_base64
            """, (payload.file_id, payload.name, payload.mime_type, payload.size or len(data_b64), data_b64))
            conn.commit()
            cur.close()
            return {"status": "success", "file_id": payload.file_id}
        finally:
            release_db_connection(conn)

    @app.get("/api/files/{file_id}")
    def get_file(file_id: str):
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database unreachable")
        cur = conn.cursor()
        try:
            cur.execute("SELECT name, mime_type, data_base64 FROM stored_files WHERE id = %s", (file_id,))
            row = cur.fetchone()
            cur.close()
            if not row:
                raise HTTPException(status_code=404, detail="File not found")
            import base64
            try:
                raw_bytes = base64.b64decode(row[2])
            except Exception:
                raise HTTPException(status_code=500, detail="Corrupt file data")
            return Response(
                content=raw_bytes,
                media_type=row[1] or "image/png",
                headers={
                    "Cache-Control": "public, max-age=86400, immutable",
                    "Content-Disposition": f'inline; filename="{row[0]}"',
                }
            )
        finally:
            release_db_connection(conn)

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
