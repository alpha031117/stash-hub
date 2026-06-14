"""Thread-safe SSE event bus.

Watcher threads publish events via call_soon_threadsafe → event loop distributes
to all connected async SSE subscribers.

Event types (Phase 3): sync_started, sync_done, error
Event types (Phase 4): unregistered_edit
"""

import asyncio
import json
import threading
from typing import Any

_subs: list[asyncio.Queue] = []
_lock = threading.Lock()
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    with _lock:
        _subs.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    with _lock:
        try:
            _subs.remove(q)
        except ValueError:
            pass


def _distribute(item: dict) -> None:
    """Must run on the event-loop thread — called via call_soon_threadsafe."""
    with _lock:
        subs = list(_subs)
    for q in subs:
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            pass


def publish(event_type: str, data: dict[str, Any]) -> None:
    """Thread-safe publish. Works from sync watcher threads or async code."""
    item = {"event": event_type, "data": json.dumps(data)}
    if _loop is not None and _loop.is_running():
        _loop.call_soon_threadsafe(_distribute, item)
    else:
        _distribute(item)
