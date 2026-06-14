"""Brain discovery + source enumeration.

Discovers the brain root the same way StashHub's Rust does (parse
~/.claude/commands/mavis.md for the backticked ...\\CLAUDE.md path → its parent),
then enumerates the markdown files to index and parses project metadata.
"""

import re
from datetime import date
from pathlib import Path

_BACKTICK_CLAUDE = re.compile(r"`([^`]*CLAUDE\.md)`", re.IGNORECASE)
_DAILY_NAME = re.compile(r"(\d{4}-\d{2}-\d{2})\.md$")
_FM_KEY = re.compile(r"^([a-zA-Z_]+):\s*(.*)$")


def _parse_date(s: str) -> date | None:
    try:
        y, m, d = (int(x) for x in s.split("-"))
        return date(y, m, d)
    except Exception:
        return None


def discover_brain_root(override: str | None = None) -> Path | None:
    """Locate the brain root. Override wins; else parse the /mavis slash command."""
    if override:
        p = Path(override)
        return p if p.exists() else None
    mavis_md = Path.home() / ".claude" / "commands" / "mavis.md"
    if not mavis_md.exists():
        return None
    text = mavis_md.read_text(encoding="utf-8", errors="ignore")
    for m in _BACKTICK_CLAUDE.finditer(text):
        root = Path(m.group(1)).parent
        if (root / "projects").exists() or (root / "CLAUDE.md").exists():
            return root
    return None


def parse_frontmatter(path: Path) -> dict:
    """YAML-lite frontmatter parse (line-based), matching the Rust parser's scope."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    fm: dict = {}
    for line in text[3:end].splitlines():
        m = _FM_KEY.match(line.strip())
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return fm


def project_dirs(root: Path) -> list[Path]:
    proj = root / "projects"
    if not proj.exists():
        return []
    return sorted(d for d in proj.iterdir() if d.is_dir() and (d / "index.md").exists())


def list_projects(root: Path) -> list[dict]:
    """Registered projects: name + declared code path + last_accessed."""
    out = []
    for d in project_dirs(root):
        fm = parse_frontmatter(d / "index.md")
        out.append(
            {
                "name": fm.get("name") or d.name,
                "dir": d.name,
                "path": fm.get("path"),
                "last_accessed": fm.get("last_accessed"),
                "status": fm.get("status"),
            }
        )
    return out


def collect_sources(root: Path, include_identity: bool = False) -> list[dict]:
    """Every markdown file to index, with its kind, owning project, and file date."""
    out: list[dict] = []
    for d in project_dirs(root):
        for fname, kind in (("index.md", "index"), ("progress.md", "progress"), ("notes.md", "notes")):
            f = d / fname
            if f.exists():
                out.append({"path": f, "source_kind": kind, "project_name": d.name, "file_date": None})

    daily = root / "daily-memories"
    if daily.exists():
        for f in sorted(daily.glob("*.md")):
            m = _DAILY_NAME.search(f.name)
            out.append(
                {
                    "path": f,
                    "source_kind": "daily",
                    "project_name": None,  # attributed per-section during chunking
                    "file_date": _parse_date(m.group(1)) if m else None,
                }
            )

    ti = root / "topic_index.md"
    if ti.exists():
        out.append({"path": ti, "source_kind": "topic", "project_name": None, "file_date": None})

    if include_identity:
        idd = root / "identity"
        if idd.exists():
            for f in sorted(idd.glob("*.md")):
                out.append({"path": f, "source_kind": "identity", "project_name": None, "file_date": None})

    return out
