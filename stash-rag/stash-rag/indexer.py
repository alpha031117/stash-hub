"""Full-brain reconcile = the backfill. Walks the entire brain (all projects'
history + all daily memories), chunk+embeds into mavis_chunks and parses every
progress.md into mavis_checkpoints. Incremental via per-file content hashes;
`full=True` re-embeds everything regardless."""

import hashlib
import logging

from . import brain, chunking, db, embeddings

logger = logging.getLogger("mavis_rag.indexer")

_root = None
_include_identity = False


def configure(root, include_identity: bool = False) -> None:
    global _root, _include_identity
    _root, _include_identity = root, include_identity


def brain_root():
    return _root


def _file_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def reconcile(full: bool = False) -> dict:
    if _root is None:
        raise RuntimeError("indexer not configured — call configure(root) first")

    sources = brain.collect_sources(_root, _include_identity)
    existing = db.get_file_hashes()
    present: set[str] = set()
    stats = {"scanned": 0, "reindexed": 0, "skipped": 0, "chunks": 0, "checkpoints": 0, "deleted": 0}

    for s in sources:
        rel = str(s["path"].relative_to(_root)).replace("\\", "/")
        present.add(rel)
        stats["scanned"] += 1
        text = s["path"].read_text(encoding="utf-8", errors="ignore")
        fhash = _file_hash(text)

        if not full and existing.get(rel) == fhash:
            stats["skipped"] += 1
            continue

        chunks = chunking.chunk_file(text, s["source_kind"], s["file_date"])
        vectors = embeddings.embed_documents([c["content"] for c in chunks])
        rows = []
        for c, vec in zip(chunks, vectors):
            project_name = s["project_name"]
            if s["source_kind"] == "daily":
                project_name = c.get("project_hint")  # per-section attribution
            rows.append(
                {
                    "project_name": project_name,
                    "source_kind": s["source_kind"],
                    "source_date": c["source_date"],
                    "heading": c["heading"],
                    "chunk_index": c["chunk_index"],
                    "content": c["content"],
                    "content_hash": c["content_hash"],
                    "embedding": vec,
                }
            )
        db.replace_chunks(rel, fhash, rows)
        stats["reindexed"] += 1
        stats["chunks"] += len(rows)

        if s["source_kind"] == "progress":
            cps = chunking.parse_checkpoints(text, s["project_name"], rel)
            db.replace_checkpoints(rel, cps)
            stats["checkpoints"] += len(cps)

        logger.info("indexed %s (%d chunks)", rel, len(rows))

    stats["deleted"] = db.delete_missing(present)
    logger.info("reconcile done: %s", stats)
    return stats
