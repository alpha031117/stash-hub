"""Markdown chunking (semantic layer) + progress-checkpoint parsing (structured
layer). Both derive deterministically from the brain markdown."""

import hashlib
import re
from datetime import date

_H2 = re.compile(r"^##\s+(.*)$")
_LEADING_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
_PROJECT_LINK = re.compile(r"\*\*Project:\*\*\s*\[([^\]]+)\]")
# `## YYYY-MM-DD[ — label] [→ [daily memory](path)]`
_CHECKPOINT_HEAD = re.compile(r"^##[ \t]+(\d{4}-\d{2}-\d{2})([^\n]*)$", re.MULTILINE)
_DAILY_LINK_TAIL = re.compile(r"\s*→?\s*\[daily memory\]\(([^)]*)\)\s*$")

MAX_CHARS = 1500


def _hash(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _parse_date(s: str) -> date | None:
    try:
        y, m, d = (int(x) for x in s.split("-"))
        return date(y, m, d)
    except Exception:
        return None


def _split_h2(text: str):
    """Split into (heading | None, body-incl-heading) sections on top-level `## `.
    Text before the first `## ` (frontmatter + title) becomes a (None, body) section."""
    sections, head, buf = [], None, []
    for line in text.splitlines(keepends=True):
        m = _H2.match(line)
        if m:
            if head is not None or "".join(buf).strip():
                sections.append((head, "".join(buf)))
            head, buf = m.group(1).strip(), [line]
        else:
            buf.append(line)
    if head is not None or "".join(buf).strip():
        sections.append((head, "".join(buf)))
    return sections


def _size_split(body: str) -> list[str]:
    if len(body) <= MAX_CHARS:
        return [body]
    pieces, cur = [], ""
    for para in body.split("\n\n"):
        if cur and len(cur) + len(para) + 2 > MAX_CHARS:
            pieces.append(cur)
            cur = para
        else:
            cur = f"{cur}\n\n{para}" if cur else para
    if cur:
        pieces.append(cur)
    return pieces


def chunk_file(text: str, source_kind: str, file_date: date | None) -> list[dict]:
    """Chunk by heading, then size-cap. Each chunk carries its heading, source_date,
    and (for daily memories) a project hint parsed from the `**Project:**` link."""
    chunks: list[dict] = []
    for heading, body in _split_h2(text):
        sec_date = file_date
        if heading:
            dm = _LEADING_DATE.match(heading)
            if dm:
                sec_date = _parse_date(dm.group(1))
        pm = _PROJECT_LINK.search(body)
        project_hint = pm.group(1) if pm else None
        for piece in _size_split(body):
            content = piece.strip()
            if content:
                chunks.append({"heading": heading, "content": content,
                               "source_date": sec_date, "project_hint": project_hint})
    for i, c in enumerate(chunks):
        c["chunk_index"] = i
        c["content_hash"] = _hash(c["content"])
    return chunks


def parse_checkpoints(text: str, project_name: str, source_path: str) -> list[dict]:
    """One row per `## YYYY-MM-DD` progress heading: date, heading label, bullet body,
    daily backlink, and a per-file `seq` so distinct same-day checkpoints both survive."""
    out: list[dict] = []
    matches = list(_CHECKPOINT_HEAD.finditer(text))
    for seq, m in enumerate(matches):
        start = m.end()
        end = matches[seq + 1].start() if seq + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        cdate = _parse_date(m.group(1))
        if cdate is None:
            continue
        dl = _DAILY_LINK_TAIL.search(m.group(2))
        heading = (m.group(1) + _DAILY_LINK_TAIL.sub("", m.group(2))).strip(" \t—→")
        out.append(
            {
                "project_name": project_name,
                "checkpoint_date": cdate,
                "seq": seq,
                "heading": heading,
                "body": body,
                "daily_link": dl.group(1) if dl else None,
                "source_path": source_path,
                "content_hash": _hash(f"{cdate}{heading}{body}"),
            }
        )
    return out
