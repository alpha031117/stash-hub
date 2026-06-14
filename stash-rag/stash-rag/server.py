"""FastAPI surface for mavis-rag.

Phase 1: /healthz /status /projects /reindex /sync
Phase 2: /chat  (SSE streaming ReAct agent)
Phase 3: /update  (LLM-driven UPDATE graph per project)
         /events  (SSE event stream — sync_started, sync_done, error)
         /status + /projects enriched with watcher state
"""

import asyncio
import datetime
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import brain, config, db, events as _events, indexer, runtime

logger = logging.getLogger("mavis_rag.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register the running event loop so sync watcher threads can publish to SSE.
    _events.set_loop(asyncio.get_event_loop())
    runtime.bootstrap()
    yield


app = FastAPI(title="mavis-rag", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/status")
def status():
    from . import watcher as _watcher
    root = runtime.brain_root()
    s = db.stats()
    return {
        "brain_found": root is not None,
        "brain_root": str(root) if root else None,
        "embedding_model": config.CONFIG["embedding"]["model"],
        "watching": sorted(_watcher.get_watching()),
        "last_sync_per_project": _watcher.get_last_sync(),
        **s,
    }


@app.get("/projects")
def projects():
    from . import watcher as _watcher
    root = runtime.brain_root()
    if not root:
        return {"projects": []}
    projs = brain.list_projects(root)
    counts = db.stats()["checkpoints_per_project"]
    watching = _watcher.get_watching()
    last_sync = _watcher.get_last_sync()
    for p in projs:
        p["checkpoints"] = counts.get(p["name"], 0)
        p["watching"] = p["name"] in watching
        p["last_sync"] = last_sync.get(p["name"])
    return {"projects": projs}


@app.post("/reindex")
def reindex():
    """Drop-and-rebuild the derived index from the brain markdown (full reconcile)."""
    return indexer.reconcile(full=True)


@app.post("/sync")
def sync():
    """Incremental reconcile — only re-embeds files whose content hash changed.

    This is the cheap, embedding-only sync (no LLM calls). The watcher and
    /update endpoint handle the LLM-driven paired-write updates.
    """
    return indexer.reconcile(full=False)


# ---------------------------------------------------------------------------
# Phase 3: LLM-driven UPDATE graph (per project)
# ---------------------------------------------------------------------------

class UpdateRequest(BaseModel):
    project: str | None = None   # None = update all registered projects
    changed_files: list[str] = []


@app.post("/update")
async def update_endpoint(body: UpdateRequest):
    """Trigger the LLM UPDATE graph — one project or all.

    project=None  → submit ALL registered projects to the update queue and return
                    immediately; watch /events SSE for per-project progress.
    project=name  → run that project's update synchronously and return the result.
    """
    from . import watcher as _watcher
    root = runtime.brain_root()
    if not root:
        return {"error": "brain not found — is the service bootstrapped?"}

    projs = brain.list_projects(root)

    if body.project is None:
        # Fire-and-forget into the watcher's executor (per-project locks prevent races).
        from pathlib import Path
        submitted = []
        for p in projs:
            if p.get("path"):
                _watcher._submit(p["name"], Path(p["path"]), body.changed_files)
                submitted.append(p["name"])
        return {"submitted": submitted}

    # Single-project — wait for result
    from . import updater as _updater
    proj = next((p for p in projs if p["name"] == body.project), None)
    if not proj:
        return {"error": f"project '{body.project}' not registered in the brain"}

    proj_path = proj.get("path") or ""
    result = await asyncio.to_thread(
        _updater.run_update, body.project, proj_path, body.changed_files
    )
    return result


# ---------------------------------------------------------------------------
# Phase 3: SSE event stream
# ---------------------------------------------------------------------------

@app.get("/events")
async def event_stream():
    """Server-Sent Events stream.

    Events emitted (Phase 3):
      event: sync_started  data: {"project": "..."}
      event: sync_done     data: {"project": "...", "result": {...}}
      event: error         data: {"project": "...", "error": "..."}
      : keepalive          (comment line every 25s to keep connection alive)
    """
    q = _events.subscribe()

    async def generator():
        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"event: {item['event']}\ndata: {item['data']}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            _events.unsubscribe(q)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Phase 4: Register an unregistered project into the brain
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    path: str               # absolute filesystem path of the project
    name: str               # brain slug (e.g. "my-project")
    type: str = "software"  # project type tag
    description: str = ""   # one-line description (optional)


@app.post("/register")
async def register_project(body: RegisterRequest):
    """Seed a new Mavis brain project from an unregistered directory.

    Creates: projects/<name>/{index.md, progress.md, notes.md, references/}
    Appends: projects/_index.md table row
    Starts:  watcher for the new project (if observer is running)
    Returns: {"ok": True, "brain_project": "<path>"}
    """
    from pathlib import Path as _Path
    from . import watcher as _watcher

    root = runtime.brain_root()
    if not root:
        return {"error": "brain not found — is the service bootstrapped?"}

    slug = body.name.strip().lower().replace(" ", "-")
    proj_dir = root / "projects" / slug
    if proj_dir.exists():
        return {"error": f"project '{slug}' already exists in brain"}

    today = datetime.date.today().isoformat()

    # Create skeleton
    proj_dir.mkdir(parents=True)
    (proj_dir / "references").mkdir()

    (proj_dir / "index.md").write_text(
        f"---\n"
        f"name: {slug}\n"
        f"type: {body.type}\n"
        f"path: {body.path}\n"
        f"description: {body.description or slug}\n"
        f"status: active\n"
        f"last_accessed: {today}\n"
        f"---\n\n"
        f"# {slug}\n\n"
        f"{body.description or f'Project at `{body.path}`.'}\n\n"
        f"## Goals\n\n- [ ] TODO\n\n"
        f"## Tech Stack\n\n- TODO\n\n"
        f"## Key Files\n\n- TODO\n",
        encoding="utf-8",
    )
    (proj_dir / "progress.md").write_text(
        f"# {slug} — Progress\n\n"
        f"## {today} → initial registration\n"
        f"- Added {slug} to Mavis brain via StashHub.\n",
        encoding="utf-8",
    )
    (proj_dir / "notes.md").write_text(f"# {slug} — Notes\n\n", encoding="utf-8")

    # Append to _index.md table
    idx_path = root / "projects" / "_index.md"
    row = f"| [{slug}]({slug}/index.md) | {body.type} | active | {today} |"
    if idx_path.exists():
        idx_path.write_text(
            idx_path.read_text(encoding="utf-8").rstrip() + "\n" + row + "\n",
            encoding="utf-8",
        )
    else:
        idx_path.write_text(
            "# Projects Index\n\n"
            "| name | type | status | last_accessed |\n"
            "|------|------|--------|---------------|\n"
            + row + "\n",
            encoding="utf-8",
        )

    # Tell watcher to stop emitting unregistered_edit + start tracking for LLM updates
    _watcher.add_registered_path(body.path)
    _watcher.start_project_watch(slug, _Path(body.path))

    # Re-embed the new files
    await asyncio.to_thread(indexer.reconcile, False)

    return {"ok": True, "brain_project": str(proj_dir)}


# ---------------------------------------------------------------------------
# Phase 2: RAG chat (SSE streaming)
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    project: str | None = None


@app.post("/chat")
async def chat_endpoint(body: ChatRequest):
    """Stream a ReAct agent response as SSE.

    Events emitted:
      event: token  data: {"content": "..."}
      event: done   data: {}
      event: error  data: {"error": "..."}
    """
    from .chat import stream_response

    history_dicts = [{"role": m.role, "content": m.content} for m in body.history]

    return StreamingResponse(
        stream_response(body.message, history_dicts, body.project),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
