"""UPDATE StateGraph — auto-write brain checkpoints when project files change.

Graph:
  collect_changes
    → [skipped? → END]
    → load_context
    → draft_checkpoint
      → [trivial? → END]
      → paired_write
      → embed
      → END

run_update() is the public entry point. Called from the watcher (sync thread)
and from the /update HTTP endpoint (via asyncio.to_thread).
"""

import json
import logging
import os
import re
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
from typing import TypedDict

from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, END

from . import config, indexer

logger = logging.getLogger("mavis_rag.updater")


# ── Noise filter ──────────────────────────────────────────────────────────────

_NOISE_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "pnpm-lock.json",
    "Cargo.lock", "poetry.lock", "Gemfile.lock", "composer.lock",
    ".gitignore", ".gitattributes", ".editorconfig",
}
_NOISE_PREFIXES = (
    "node_modules/", ".git/", "dist/", ".next/", "__pycache__/",
    ".venv/", "venv/", ".cache/", "target/debug/", "target/release/",
    ".expo/", "build/", ".vercel/", ".turbo/", ".svelte-kit/",
)
_NOISE_SUFFIXES = (".pyc", ".pyo", ".map", ".log", ".tmp", ".DS_Store", ".db-shm", ".db-wal")
_MIN_DIFF_CHARS = 80


def _is_noise(rel_path: str) -> bool:
    norm = rel_path.replace("\\", "/")
    name = norm.split("/")[-1]
    if name in _NOISE_NAMES:
        return True
    if any(norm.startswith(p) for p in _NOISE_PREFIXES):
        return True
    return any(name.endswith(s) for s in _NOISE_SUFFIXES)


# ── State ─────────────────────────────────────────────────────────────────────

class UpdateState(TypedDict):
    project_name: str
    project_path: str
    brain_root: str
    changed_files: list[str]      # accumulated by watcher; may be empty for manual trigger
    diff: str
    skipped: bool
    skip_reason: str
    today: str
    # loaded by load_context
    ctx_index: str
    ctx_progress_tail: str        # last ~60 lines of progress.md
    ctx_daily: str                # today's daily memory (empty if none yet)
    # drafted by draft_checkpoint
    headline: str
    checkpoint_bullets: str
    daily_section_body: str
    # recorded by paired_write
    wrote_paths: list[str]


# ── Node: collect_changes ─────────────────────────────────────────────────────

def collect_changes(state: UpdateState) -> dict:
    path = Path(state["project_path"])
    today = date.today().isoformat()
    all_changed: set[str] = set(state.get("changed_files") or [])
    diff = ""

    is_git = (path / ".git").exists()
    if is_git:
        try:
            # Uncommitted working-tree changes
            r = subprocess.run(
                ["git", "status", "--short"],
                cwd=path, capture_output=True, text=True, timeout=10,
            )
            for line in r.stdout.splitlines():
                parts = line.strip().split(None, 1)
                if len(parts) == 2:
                    all_changed.add(parts[1].strip().strip('"'))

            # Diff for context (working tree vs HEAD, uncommitted first)
            r2 = subprocess.run(
                ["git", "diff", "HEAD", "--stat", "-p", "--unified=3"],
                cwd=path, capture_output=True, text=True, timeout=15,
            )
            diff = r2.stdout[:3000]

            if not diff.strip():
                # Nothing uncommitted — use last commit
                r3 = subprocess.run(
                    ["git", "diff", "HEAD~1", "HEAD", "--stat", "-p", "--unified=3"],
                    cwd=path, capture_output=True, text=True, timeout=15,
                )
                diff = r3.stdout[:3000]
                r4 = subprocess.run(
                    ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
                    cwd=path, capture_output=True, text=True, timeout=10,
                )
                for line in r4.stdout.splitlines():
                    if line.strip():
                        all_changed.add(line.strip())
        except FileNotFoundError:
            logger.debug("git not available in PATH for %s", path)
        except Exception as exc:
            logger.warning("git commands failed for %s: %s", path, exc)

    # Filter noise
    signal = [f for f in all_changed if not _is_noise(f)]

    if not signal and len(diff.strip()) < _MIN_DIFF_CHARS:
        logger.info("collect_changes: nothing meaningful for %s — skipping", state["project_name"])
        return {"skipped": True, "skip_reason": "nothing meaningful changed",
                "changed_files": [], "diff": "", "today": today}

    logger.info("collect_changes: %d signal files for %s", len(signal), state["project_name"])
    return {"skipped": False, "skip_reason": "", "changed_files": signal, "diff": diff, "today": today}


# ── Node: load_context ────────────────────────────────────────────────────────

def load_context(state: UpdateState) -> dict:
    brain = Path(state["brain_root"])
    proj_dir = brain / "projects" / state["project_name"]

    def _read(p: Path, max_lines: int | None = None) -> str:
        if not p.exists():
            return ""
        text = p.read_text(encoding="utf-8", errors="ignore")
        if max_lines is not None:
            lines = text.splitlines()
            return "\n".join(lines[-max_lines:])
        return text

    return {
        "ctx_index": _read(proj_dir / "index.md"),
        "ctx_progress_tail": _read(proj_dir / "progress.md", max_lines=60),
        "ctx_daily": _read(brain / "daily-memories" / f"{state['today']}.md"),
    }


# ── Node: draft_checkpoint ────────────────────────────────────────────────────

def _make_updater_llm():
    cfg = config.CONFIG.get("updater", {})
    if not cfg:
        raise ValueError("No 'updater' LLM block in config.yaml — add it under updater:")
    api_key = cfg.get("api_key") or os.environ.get(cfg.get("api_key_env", ""), "")
    kwargs: dict = dict(
        model=cfg["model"],
        model_provider=cfg.get("provider", "openai"),
        api_key=api_key,
        temperature=0,
    )
    if base_url := cfg.get("base_url"):
        kwargs["base_url"] = base_url
    if dh := cfg.get("default_headers"):
        kwargs["default_headers"] = dh
    if mt := cfg.get("max_tokens"):
        kwargs["max_tokens"] = mt
    return init_chat_model(**kwargs)


def _parse_json_response(text: str) -> dict:
    """Best-effort JSON extraction from LLM output (handles markdown fences)."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from a markdown code block
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try extracting the first {...} span
    m2 = re.search(r"\{[\s\S]*\}", text)
    if m2:
        try:
            return json.loads(m2.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from LLM response: {text[:400]}")


def draft_checkpoint(state: UpdateState) -> dict:
    files_str = "\n".join(f"  - {f}" for f in state["changed_files"][:30]) or "  (see diff)"
    diff_block = f"```diff\n{state['diff'][:2500]}\n```" if state["diff"].strip() else "(no diff available)"

    # Explicit JSON example anchors Qwen away from YAML output
    example = json.dumps({
        "trivial": False,
        "headline": "Implemented OAuth PKCE flow and token refresh",
        "checkpoint_bullets": "- ✅ Added PKCE flow in google.rs with local HTTP listener\n- ✅ Token refresh on 401 in useGoogleMeetings\n- Files: src-tauri/src/google.rs, src/hooks/useGoogleCalendar.ts",
        "daily_section_body": "Implemented the full Google OAuth PKCE flow inside the Tauri Rust backend. Token exchange now stores credentials per company ID in the app data dir. On the frontend, useGoogleMeetings catches 401s and triggers a refresh before retrying.",
    }, indent=2)

    prompt = f"""\
You are Mavis, an AI collaborator maintaining a development journal for a developer named Beta.
Your task: write a concise brain checkpoint for project "{state["project_name"]}" based on recent file changes.

Today: {state["today"]}

## Changed files
{files_str}

## Diff
{diff_block}

## Project context (index.md excerpt)
{state["ctx_index"][:1500]}

## Most recent progress entries
{state["ctx_progress_tail"][-1200:] or "(no prior checkpoints)"}

## Today's work so far (daily memory)
{state["ctx_daily"][-800:] or "(nothing written yet today)"}

## Rules
- "trivial": set true if ALL changes are whitespace / comments / lockfiles / config that don't represent shipped logic. Set false otherwise.
- "headline": 5–8 words. Specific (what was built/fixed/decided), not generic.
- "checkpoint_bullets": 1–5 bullet points starting with "- ✅ " for completed features, decisions, or changes. Last bullet is "- Files: <comma-separated touched files>". Be specific. Do NOT repeat items already in the progress entries above.
- "daily_section_body": 2–4 sentences. WHAT changed, WHY if known, any important decisions. Do NOT include the "## heading" or "**Project:**" line — those are added automatically.

Respond ONLY with valid JSON, no markdown wrapping, no YAML. Example:
{example}
"""

    llm = _make_updater_llm()
    response = llm.invoke([{"role": "user", "content": prompt}])
    text = response.content if hasattr(response, "content") else str(response)

    data = _parse_json_response(text)

    if data.get("trivial"):
        logger.info("draft_checkpoint: LLM judged changes trivial for %s", state["project_name"])
        return {"skipped": True, "skip_reason": "LLM judged changes trivial"}

    return {
        "headline": data.get("headline", "Updated project files"),
        "checkpoint_bullets": data.get("checkpoint_bullets", f"- ✅ Updated files\n- Files: {', '.join(state['changed_files'][:5])}"),
        "daily_section_body": data.get("daily_section_body", "Made changes to the project."),
    }


# ── Node: paired_write ────────────────────────────────────────────────────────

def _safe_append(path: Path, text: str) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(text)


def _add_project_to_daily_frontmatter(path: Path, proj_name: str) -> None:
    """Add proj_name to the inline projects: [...] array in the daily memory frontmatter."""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^(projects:\s*\[)([^\]]*?)(\])", text, re.MULTILINE)
    if not m:
        return
    existing = [x.strip() for x in m.group(2).split(",") if x.strip()]
    if proj_name in existing:
        return
    existing.append(proj_name)
    new_val = m.group(1) + ", ".join(existing) + m.group(3)
    text = text[: m.start()] + new_val + text[m.end() :]
    path.write_text(text, encoding="utf-8")


def _update_frontmatter_field(path: Path, field: str, value: str) -> None:
    """Replace a frontmatter field value in-place (scoped to the --- block)."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return
    end = text.find("\n---", 3)
    if end == -1:
        return
    fm = text[3:end]
    pattern = re.compile(r"^(" + re.escape(field) + r":\s*)(.*)$", re.MULTILINE)
    new_fm, n = pattern.subn(rf"\g<1>{value}", fm, count=1)
    if n:
        path.write_text(text[:3] + new_fm + text[end:], encoding="utf-8")


def _update_index_table(path: Path, proj_name: str, today: str) -> None:
    """Update the last_accessed cell in _index.md's Markdown table for this project."""
    text = path.read_text(encoding="utf-8")
    # Matches: | [proj_name](anything) | col | col | <old-date> |
    pattern = re.compile(
        r"(\|\s*\[" + re.escape(proj_name) + r"\]\([^)]*\)\s*\|[^|]*\|[^|]*\|)\s*[^|\n]*?(\s*\|)",
        re.MULTILINE,
    )
    new_text, n = pattern.subn(rf"\g<1> {today} \g<2>", text, count=1)
    if n:
        path.write_text(new_text, encoding="utf-8")


def paired_write(state: UpdateState) -> dict:
    brain = Path(state["brain_root"])
    proj_name = state["project_name"]
    today = state["today"]
    wrote: list[str] = []

    # ── 1. Append checkpoint to progress.md ──────────────────────────────────
    progress_path = brain / "projects" / proj_name / "progress.md"
    daily_rel = f"../../daily-memories/{today}.md"
    cp_entry = (
        f"\n## {today} → [daily memory]({daily_rel})\n"
        f"{state['checkpoint_bullets']}\n"
    )
    _safe_append(progress_path, cp_entry)
    wrote.append(str(progress_path))
    logger.info("paired_write: appended to %s", progress_path)

    # ── 2. Create/append daily memory ─────────────────────────────────────────
    daily_path = brain / "daily-memories" / f"{today}.md"
    if not daily_path.exists():
        daily_path.write_text(
            f"---\ndate: {today}\nprojects: []\n---\n\n# {today}\n",
            encoding="utf-8",
        )
    _add_project_to_daily_frontmatter(daily_path, proj_name)

    proj_link = f"../projects/{proj_name}/index.md"
    section = (
        f"\n## {proj_name} — {state['headline']}\n"
        f"**Project:** [{proj_name}]({proj_link})\n\n"
        f"{state['daily_section_body']}\n"
    )
    _safe_append(daily_path, section)
    wrote.append(str(daily_path))
    logger.info("paired_write: appended to %s", daily_path)

    # ── 3. Update last_accessed in index.md ──────────────────────────────────
    index_path = brain / "projects" / proj_name / "index.md"
    if index_path.exists():
        _update_frontmatter_field(index_path, "last_accessed", today)

    # ── 4. Update last_accessed in _index.md ─────────────────────────────────
    global_index = brain / "projects" / "_index.md"
    if global_index.exists():
        _update_index_table(global_index, proj_name, today)

    return {"wrote_paths": wrote}


# ── Node: embed ───────────────────────────────────────────────────────────────

def embed(state: UpdateState) -> dict:
    """Re-index only the files that changed (reconcile is hash-gated — fast)."""
    try:
        stats = indexer.reconcile(full=False)
        logger.info("embed after update: %s", stats)
    except Exception as exc:
        logger.error("embed failed: %s", exc, exc_info=True)
    return {}


# ── Graph ─────────────────────────────────────────────────────────────────────

def _route_collect(state: UpdateState) -> str:
    return "skip" if state.get("skipped") else "load_context"


def _route_draft(state: UpdateState) -> str:
    return "skip" if state.get("skipped") else "paired_write"


_graph = StateGraph(UpdateState)
_graph.add_node("collect_changes", collect_changes)
_graph.add_node("load_context", load_context)
_graph.add_node("draft_checkpoint", draft_checkpoint)
_graph.add_node("paired_write", paired_write)
_graph.add_node("embed", embed)

_graph.set_entry_point("collect_changes")
_graph.add_conditional_edges("collect_changes", _route_collect,
    {"skip": END, "load_context": "load_context"})
_graph.add_edge("load_context", "draft_checkpoint")
_graph.add_conditional_edges("draft_checkpoint", _route_draft,
    {"skip": END, "paired_write": "paired_write"})
_graph.add_edge("paired_write", "embed")
_graph.add_edge("embed", END)

_app = _graph.compile()


# ── Public API ────────────────────────────────────────────────────────────────

def run_update(
    project_name: str,
    project_path: str | Path,
    changed_files: list[str] | None = None,
) -> dict:
    """Run the UPDATE graph synchronously. Safe to call from any thread.

    Returns a dict with keys: skipped, skip_reason, wrote_paths, changed_files.
    """
    from . import runtime
    root = runtime.brain_root()
    if not root:
        logger.warning("run_update called but brain not found")
        return {"skipped": True, "skip_reason": "brain not found", "wrote_paths": [], "changed_files": []}

    initial: UpdateState = {
        "project_name": project_name,
        "project_path": str(project_path),
        "brain_root": str(root),
        "changed_files": list(changed_files or []),
        "diff": "",
        "skipped": False,
        "skip_reason": "",
        "today": date.today().isoformat(),
        "ctx_index": "",
        "ctx_progress_tail": "",
        "ctx_daily": "",
        "headline": "",
        "checkpoint_bullets": "",
        "daily_section_body": "",
        "wrote_paths": [],
    }

    result = _app.invoke(initial)
    return {
        "skipped": result.get("skipped", False),
        "skip_reason": result.get("skip_reason", ""),
        "wrote_paths": result.get("wrote_paths", []),
        "changed_files": result.get("changed_files", []),
    }
