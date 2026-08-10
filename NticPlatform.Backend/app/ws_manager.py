import json
import logging
import datetime
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger("ntic.ws")

class WsManager:
    """Track connected admin clients and broadcast changes."""

    def __init__(self):
        self._sockets: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket, token: str):
        """Authenticate websocket and register it for broadcasts."""
        from app.security import verify_token
        info = verify_token(token)
        if not info:
            await ws.close(code=4001, reason="Unauthorized")
            return False

        role = info.get("role", "")
        if role not in ("super_admin", "admin", "content_manager", "reviewer", "competition_manager"):
            await ws.close(code=4003, reason="Forbidden")
            return False

        await ws.accept()
        self._sockets.add(ws)
        logger.info(f"WebSocket connected: {info.get('email')} ({role}) — total clients: {len(self._sockets)}")
        return True

    def disconnect(self, ws: WebSocket):
        self._sockets.discard(ws)
        logger.info(f"WebSocket disconnected — remaining clients: {len(self._sockets)}")

    async def broadcast(self, payload: dict):
        """Push a message to every connected admin."""
        dead: list[WebSocket] = []
        message = json.dumps(payload) if isinstance(payload, dict) else str(payload)
        for ws in self._sockets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._sockets.discard(ws)


ws_manager = WsManager()


def broadcast_async(payload: dict = None):
    """Fire-and-forget broadcast — safe to call from sync FastAPI endpoints."""
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(ws_manager.broadcast(payload or {"type": "data_changed"}))
    except RuntimeError:
        pass  # no running event loop
