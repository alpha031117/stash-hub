"""Filesystem watcher — watchdog + per-project debounce + git-commit trigger.

One watchdog Observer watches all registered project paths. When files change,
a per-project debounce timer fires and submits the UPDATE graph to a thread pool.
A separate handler on .git/logs/ fires immediately on git commits.

Phase 4: _CandidateRootHandler watches candidate_roots shallowly and emits
unregistered_edit SSE when edits happen in subdirs not already registered.
"""

import concurrent.futures
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from . import events as _events

logger = logging.getLogger("mavis_rag.watcher")

# ── Module state ──────────────────────────────────────────────────────────────

_observer: Observer | None = None
_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="updater"
)
_project_locks: dict[str, threading.Lock] = {}
_last_sync: dict[str, str] = {}      # project_name → UTC ISO timestamp
_watching: set[str] = set()

# Phase 4 — candidate-root tracking
_registered_paths: set[str] = set()            # normalized lowercase paths already in brain
_candidate_cooldowns: dict[str, datetime] = {} # path → last unregistered_edit emit time
_CANDIDATE_COOLDOWN_S = 300                    # 5 min per path


def get_watching() -> set[str]:
    return set(_watching)


def get_last_sync() -> dict[str, str]:
    return dict(_last_sync)


def add_registered_path(path: str) -> None:
    """Exclude a path from future unregistered_edit emissions (called after /register)."""
    _registered_paths.add(path.lower().replace("\\", "/"))


def start_project_watch(project_name: str, project_path: Path, debounce_s: float = 90.0) -> None:
    """Dynamically add a newly-registered project to the running observer."""
    global _observer
    if _observer is None or not _observer.is_alive():
        return
    add_registered_path(str(project_path))
    _watching.add(project_name)
    handler = _ProjectHandler(project_name, project_path, debounce_s)
    _observer.schedule(handler, str(project_path), recursive=True)
    git_logs = project_path / ".git" / "logs"
    if git_logs.exists():
        git_handler = _GitCommitHandler(project_name, project_path)
        _observer.schedule(git_handler, str(git_logs), recursive=False)
    logger.info("dynamically added watch for %s → %s", project_name, project_path)


# ── Noise filter (fast path in event handlers) ────────────────────────────────

_NOISE_PARTS = frozenset({
    "node_modules", ".git", "dist", ".next", "__pycache__",
    ".venv", "venv", ".cache", "build", ".expo", ".turbo",
    ".vercel", ".svelte-kit",
})
_NOISE_SUFFIXES = (".pyc", ".pyo", ".map", ".log", ".tmp", ".DS_Store", ".db-shm", ".db-wal")


def _is_noise(src: str) -> bool:
    norm = src.replace("\\", "/")
    parts = norm.split("/")
    if any(p in _NOISE_PARTS for p in parts):
        return True
    name = parts[-1]
    return any(name.endswith(s) for s in _NOISE_SUFFIXES)


# ── Update submission ─────────────────────────────────────────────────────────

def _submit(project_name: str, project_path: Path, changed_files: list[str]) -> None:
    """Submit an UPDATE graph run for project_name. Drop if already running."""
    lock = _project_locks.setdefault(project_name, threading.Lock())
    if not lock.acquire(blocking=False):
        logger.info("%s: update already running — trigger dropped (APScheduler will catch up)", project_name)
        return

    def task():
        try:
            _events.publish("sync_started", {"project": project_name})
            logger.info("UPDATE start: %s  files=%s", project_name, changed_files[:6])

            # Import here to avoid circular import at module load
            from . import updater as _updater
            result = _updater.run_update(project_name, project_path, changed_files)

            _last_sync[project_name] = datetime.now(timezone.utc).isoformat()
            logger.info("UPDATE done: %s → %s", project_name, result)
            _events.publish("sync_done", {"project": project_name, "result": result})
        except Exception as exc:
            logger.error("UPDATE error for %s: %s", project_name, exc, exc_info=True)
            _events.publish("error", {"project": project_name, "error": str(exc)})
        finally:
            lock.release()

    _executor.submit(task)


# ── Watchdog handlers ─────────────────────────────────────────────────────────

class _ProjectHandler(FileSystemEventHandler):
    """Debounced handler for a registered project's code directory."""

    def __init__(self, project_name: str, project_path: Path, debounce_s: float):
        self.project_name = project_name
        self.project_path = project_path
        self.debounce_s = debounce_s
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()
        self._changed: set[str] = set()

    def on_any_event(self, event):
        if event.is_directory:
            return
        if _is_noise(str(event.src_path)):
            return
        try:
            rel = Path(event.src_path).relative_to(self.project_path)
        except ValueError:
            return
        with self._lock:
            self._changed.add(str(rel).replace("\\", "/"))
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(self.debounce_s, self._fire)
            self._timer.daemon = True
            self._timer.start()

    def _fire(self):
        with self._lock:
            changed = list(self._changed)
            self._changed.clear()
            self._timer = None
        _submit(self.project_name, self.project_path, changed)


class _CandidateRootHandler(FileSystemEventHandler):
    """Shallow watcher on a candidate root dir.

    Emits `unregistered_edit` SSE when files change inside an immediate subdir
    that is NOT already a registered project path. Cooldown: one event per path
    per _CANDIDATE_COOLDOWN_S seconds.
    """

    def __init__(self, candidate_root: Path):
        self.candidate_root = candidate_root

    def on_any_event(self, event):
        if event.is_directory:
            return
        if _is_noise(str(event.src_path)):
            return
        try:
            rel = Path(str(event.src_path)).relative_to(self.candidate_root)
        except ValueError:
            return
        if len(rel.parts) < 2:
            return  # file directly in candidate_root — not a project subdir
        subdir = self.candidate_root / rel.parts[0]
        subdir_norm = str(subdir).lower().replace("\\", "/")
        if subdir_norm in _registered_paths:
            return
        now = datetime.now(timezone.utc)
        last = _candidate_cooldowns.get(subdir_norm)
        if last and (now - last).total_seconds() < _CANDIDATE_COOLDOWN_S:
            return
        _candidate_cooldowns[subdir_norm] = now
        logger.info("unregistered edit in %s — emitting SSE", subdir)
        _events.publish("unregistered_edit", {"path": str(subdir).replace("\\", "/")})


class _GitCommitHandler(FileSystemEventHandler):
    """Watches .git/logs/ — fires immediately when HEAD changes (new commit)."""

    def __init__(self, project_name: str, project_path: Path):
        self.project_name = project_name
        self.project_path = project_path

    def on_modified(self, event):
        if event.is_directory:
            return
        if Path(event.src_path).name == "HEAD":
            logger.info("git commit detected in %s — triggering immediate update", self.project_name)
            _submit(self.project_name, self.project_path, ["<git-commit>"])


# ── Watcher lifecycle ─────────────────────────────────────────────────────────

def start(brain_root: Path, watcher_cfg: dict) -> None:
    global _observer

    from . import brain as _brain
    debounce_s = float(watcher_cfg.get("debounce_seconds", 90))
    projects = _brain.list_projects(brain_root)
    candidate_roots_cfg: list[str] = watcher_cfg.get("candidate_roots", [])

    if not projects and not candidate_roots_cfg:
        logger.info("no registered projects or candidate roots — watcher idle")
        return

    _observer = Observer()

    for p in projects:
        proj_name = p["name"]
        proj_path_str = p.get("path")
        if not proj_path_str:
            logger.debug("project %s has no path: field — skipping watch", proj_name)
            continue

        proj_path = Path(proj_path_str)
        if not proj_path.exists():
            logger.warning("project path not found, skipping watch: %s → %s", proj_name, proj_path)
            continue

        # Track in registered_paths so candidate-root handler can exclude it
        _registered_paths.add(str(proj_path).lower().replace("\\", "/"))
        _watching.add(proj_name)

        handler = _ProjectHandler(proj_name, proj_path, debounce_s)
        _observer.schedule(handler, str(proj_path), recursive=True)
        logger.info("watching %s → %s  (debounce %.0fs)", proj_name, proj_path, debounce_s)

        git_logs = proj_path / ".git" / "logs"
        if git_logs.exists():
            git_handler = _GitCommitHandler(proj_name, proj_path)
            _observer.schedule(git_handler, str(git_logs), recursive=False)
            logger.debug("git commit trigger enabled for %s", proj_name)

    # Phase 4 — candidate roots (watch for unregistered project activity)
    for cr_str in candidate_roots_cfg:
        cr = Path(cr_str)
        if not cr.exists():
            logger.warning("candidate_root not found, skipping: %s", cr)
            continue
        cr_handler = _CandidateRootHandler(cr)
        _observer.schedule(cr_handler, str(cr), recursive=True)
        logger.info("candidate root: %s", cr)

    _observer.start()
    logger.info(
        "watcher started — %d registered projects, %d candidate roots",
        len(_watching), len(candidate_roots_cfg),
    )


def stop() -> None:
    global _observer
    if _observer:
        _observer.stop()
        _observer.join()
        _observer = None
    _watching.clear()
    _executor.shutdown(wait=False)
    logger.info("watcher stopped")
