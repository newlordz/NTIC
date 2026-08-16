import asyncio
import json
import logging
import os
import select
import threading
import uuid
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger("ntic.ws")

# Roles permitted to receive live change notifications.
BROADCAST_ROLES = ("super_admin", "admin", "content_manager", "reviewer", "competition_manager")

# Hard ceiling on concurrent sockets. Without one, an authenticated client can
# open connections until the process runs out of memory or file descriptors.
MAX_CONNECTIONS = 200

# PostgreSQL NOTIFY channel used to fan changes out to every replica.
PG_CHANNEL = "ntic_data_changed"

# Identifies this process so we can ignore the echo of our own notifications
# (we already broadcast locally before publishing).
INSTANCE_ID = uuid.uuid4().hex[:12]


class WsManager:
    """Track connected admin clients and broadcast changes.

    Sockets are per-process. To make a change on one replica reach clients
    attached to another, every broadcast is also published on a PostgreSQL
    NOTIFY channel, and each replica listens on that channel. Postgres is
    already a required dependency, so this needs no extra infrastructure.
    """

    def __init__(self):
        self._sockets: Set[WebSocket] = set()
        # Captured at startup. Sync FastAPI endpoints run in a worker thread with
        # no running event loop, so they cannot schedule work without a handle to
        # the main loop -- see set_event_loop() / broadcast_async() below.
        self._loop: asyncio.AbstractEventLoop | None = None
        self._listener: threading.Thread | None = None
        self._listener_stop = threading.Event()

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def connection_count(self) -> int:
        return len(self._sockets)

    async def connect(self, ws: WebSocket, token: str):
        """Authenticate websocket and register it for broadcasts."""
        from app.security import verify_token

        if not token:
            logger.warning("WebSocket rejected: no token in the query string")
            await ws.close(code=4001, reason="Unauthorized")
            return False

        info = verify_token(token)
        if not info:
            logger.warning(
                "WebSocket rejected: token not valid or expired (token ...%s)", token[-6:]
            )
            await ws.close(code=4001, reason="Unauthorized")
            return False

        role = info.get("role", "")
        if role not in BROADCAST_ROLES:
            logger.warning(
                "WebSocket rejected: role %r is not permitted to receive broadcasts (%s)",
                role, info.get("email"),
            )
            await ws.close(code=4003, reason="Forbidden")
            return False

        if len(self._sockets) >= MAX_CONNECTIONS:
            logger.warning(
                f"Refusing WebSocket from {info.get('email')}: at capacity ({MAX_CONNECTIONS})"
            )
            await ws.close(code=1013, reason="Server at capacity")
            return False

        await ws.accept()
        self._sockets.add(ws)
        logger.info(
            f"WebSocket connected: {info.get('email')} ({role}) - total clients: {len(self._sockets)}"
        )
        return True

    def disconnect(self, ws: WebSocket):
        self._sockets.discard(ws)
        logger.info(f"WebSocket disconnected - remaining clients: {len(self._sockets)}")

    async def broadcast(self, payload: dict):
        """Push a message to every client attached to THIS process."""
        if not self._sockets:
            return
        dead: list[WebSocket] = []
        message = json.dumps(payload) if isinstance(payload, dict) else str(payload)
        # Iterate a copy: a send failure mutates the set.
        for ws in list(self._sockets):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._sockets.discard(ws)

    # ── Cross-replica fan-out ──────────────────────────────────────
    def publish(self, payload: dict) -> None:
        """Publish to other replicas via PostgreSQL NOTIFY. Best effort."""
        from app.database import get_db_connection, release_db_connection

        conn = get_db_connection()
        if not conn:
            return
        try:
            body = json.dumps({"origin": INSTANCE_ID, "payload": payload})
            # NOTIFY has an 8000-byte payload ceiling; our payloads are tiny
            # metadata signals, but guard anyway.
            if len(body) > 7000:
                body = json.dumps({"origin": INSTANCE_ID, "payload": {"type": "data_changed"}})
            cur = conn.cursor()
            cur.execute("SELECT pg_notify(%s, %s)", (PG_CHANNEL, body))
            conn.commit()
            cur.close()
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            logger.debug(f"Cross-replica publish skipped: {e}")
        finally:
            release_db_connection(conn)

    def start_listener(self) -> None:
        """Begin listening for notifications from other replicas.

        Runs in a daemon thread with its own dedicated connection, because a
        LISTEN connection must stay idle-but-open and cannot be returned to the
        pool. Entirely optional: if it cannot start, broadcasts simply stay
        local, which is the previous behaviour.
        """
        if os.getenv("NTIC_DISABLE_WS_FANOUT", "").strip().lower() in ("1", "true", "yes"):
            logger.info("Cross-replica WebSocket fan-out disabled by NTIC_DISABLE_WS_FANOUT")
            return
        if self._listener and self._listener.is_alive():
            return
        self._listener_stop.clear()
        self._listener = threading.Thread(
            target=self._listen_loop, name="ntic-ws-listener", daemon=True
        )
        self._listener.start()

    def stop_listener(self) -> None:
        self._listener_stop.set()

    def _listen_loop(self) -> None:
        import psycopg2
        import psycopg2.extensions
        from app.config import settings

        conn = None
        try:
            db_url = os.getenv("DATABASE_PRIVATE_URL", "") or os.getenv("DATABASE_URL", "")
            if db_url.strip():
                conn = psycopg2.connect(db_url.strip(), connect_timeout=10)
            else:
                host = settings.POSTGRES_HOST
                if host in ("localhost", ""):
                    host = "127.0.0.1"
                conn = psycopg2.connect(
                    host=host,
                    port=settings.POSTGRES_PORT,
                    user=settings.POSTGRES_USER,
                    password=settings.POSTGRES_PASSWORD,
                    dbname=settings.POSTGRES_DB,
                    connect_timeout=10,
                )
            conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute(f'LISTEN "{PG_CHANNEL}"')
            logger.info(f"Listening on PostgreSQL channel {PG_CHANNEL} (instance {INSTANCE_ID})")

            while not self._listener_stop.is_set():
                # select() on the raw socket, so this thread costs nothing while idle.
                if select.select([conn], [], [], 5) == ([], [], []):
                    continue
                conn.poll()
                while conn.notifies:
                    note = conn.notifies.pop(0)
                    self._handle_notification(note.payload)
        except Exception as e:
            logger.warning(
                f"Cross-replica WebSocket fan-out unavailable ({e}). "
                f"Broadcasts will only reach clients on this instance."
            )
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def _handle_notification(self, raw: str) -> None:
        try:
            envelope = json.loads(raw)
        except Exception:
            return
        if envelope.get("origin") == INSTANCE_ID:
            return  # our own message; already delivered locally
        payload = envelope.get("payload") or {"type": "data_changed"}
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(payload), loop)
        except Exception as e:
            logger.debug(f"Could not deliver a cross-replica broadcast: {e}")


ws_manager = WsManager()


def broadcast_async(payload: dict = None):
    """Fire-and-forget broadcast, safe to call from sync or async endpoints.

    Most endpoints in this app are plain `def`, which Starlette runs in a thread
    from its worker pool. In that thread `asyncio.get_running_loop()` raises
    RuntimeError, so the previous implementation silently swallowed the error and
    **no broadcast from a sync endpoint ever fired** -- real-time sync only
    appeared to work. We now fall back to the loop captured at startup and hand
    the coroutine over in a thread-safe way.

    Also publishes to other replicas via PostgreSQL NOTIFY.
    """
    message = payload or {"type": "data_changed"}

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = ws_manager._loop
        if loop is not None and not loop.is_closed():
            try:
                asyncio.run_coroutine_threadsafe(ws_manager.broadcast(message), loop)
            except Exception as e:
                logger.warning(f"Broadcast dispatch failed: {e}")
        else:
            logger.debug("Local broadcast skipped: no event loop available yet")
        ws_manager.publish(message)
        return

    try:
        loop.create_task(ws_manager.broadcast(message))
    except Exception as e:
        logger.warning(f"Broadcast dispatch failed: {e}")
    # Publishing touches the database, so hand it to a worker thread rather than
    # blocking the event loop.
    try:
        loop.run_in_executor(None, ws_manager.publish, message)
    except Exception as e:
        logger.debug(f"Cross-replica publish skipped: {e}")
