"""CLI entry: `python -m mavis_rag <command>`.

  reindex   one-shot full reconcile (the backfill) — prints stats
  sync      one-shot incremental reconcile
  update    manually run the LLM UPDATE graph for a project
            usage: update <project-name>
  serve     run the FastAPI service + periodic reconcile + watcher
  status    print index stats and exit
"""

import logging
import sys
from datetime import datetime

from . import db, indexer, runtime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def cmd_reindex():
    cfg, root = runtime.bootstrap()
    if not root:
        print("ERROR: brain not found (checked ~/.claude/commands/mavis.md and config override)")
        sys.exit(1)
    print(f"Reindexing brain at {root} ...")
    print(indexer.reconcile(full=True))


def cmd_sync():
    runtime.bootstrap()
    print(indexer.reconcile(full=False))


def cmd_status():
    runtime.bootstrap()
    print({"brain_root": str(runtime.brain_root()), **db.stats()})


def cmd_update():
    """Manually trigger the LLM UPDATE graph for one or all registered projects.

    Usage:
      python -m mavis_rag update              # update all projects
      python -m mavis_rag update <name>       # update one project
    """
    from . import brain as _brain, updater as _updater

    cfg, root = runtime.bootstrap()
    if not root:
        print("ERROR: brain not found")
        sys.exit(1)

    projs = _brain.list_projects(root)
    target_name = sys.argv[2] if len(sys.argv) >= 3 else None

    if target_name:
        proj = next((p for p in projs if p["name"] == target_name), None)
        if not proj:
            registered = [p["name"] for p in projs]
            print(f"ERROR: project '{target_name}' not in brain. Registered: {registered}")
            sys.exit(1)
        targets = [proj]
    else:
        targets = [p for p in projs if p.get("path")]
        print(f"Updating all {len(targets)} registered projects ...")

    for proj in targets:
        proj_name = proj["name"]
        proj_path = proj.get("path") or ""
        print(f"\n── {proj_name} ({proj_path}) ──")
        result = _updater.run_update(proj_name, proj_path, changed_files=[])
        if result.get("skipped"):
            print(f"  skipped: {result.get('skip_reason', 'nothing meaningful changed')}")
        else:
            print(f"  wrote: {result.get('wrote_paths', [])}")


def cmd_serve():
    import uvicorn
    from apscheduler.schedulers.background import BackgroundScheduler
    from . import watcher as _watcher

    cfg, root = runtime.bootstrap()
    interval = cfg.get("reconcile", {}).get("interval_minutes", 30)
    sched = BackgroundScheduler(daemon=True)
    sched.add_job(
        lambda: indexer.reconcile(full=False), "interval",
        minutes=interval, next_run_time=datetime.now(), id="reconcile",
    )
    sched.start()

    if root:
        _watcher.start(root, cfg.get("watcher", {}))
    else:
        print("WARNING: brain not found — watcher not started")

    from .server import app as _app
    web = cfg.get("web", {})
    try:
        uvicorn.run(
            _app,
            host=web.get("host", "127.0.0.1"),
            port=web.get("port", 8782),
            log_level="info",
        )
    finally:
        _watcher.stop()


_COMMANDS = {
    "reindex": cmd_reindex,
    "sync": cmd_sync,
    "status": cmd_status,
    "update": cmd_update,
    "serve": cmd_serve,
}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "serve"
    fn = _COMMANDS.get(cmd)
    if not fn:
        print(f"Unknown command {cmd!r}. Options: {', '.join(_COMMANDS)}")
        sys.exit(2)
    fn()
