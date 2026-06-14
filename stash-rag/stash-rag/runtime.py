"""Shared bootstrap: wire config → db/embeddings/indexer and ensure the schema.
Idempotent, so both the CLI and the FastAPI lifespan can call it."""

import logging

from . import brain, config, db, embeddings, indexer

logger = logging.getLogger("mavis_rag")
_ready = False
_brain_root = None


def bootstrap():
    global _ready, _brain_root
    cfg = config.CONFIG
    if _ready:
        return cfg, _brain_root

    root = brain.discover_brain_root(cfg.get("brain", {}).get("root"))
    _brain_root = root
    indexer.configure(root, cfg.get("brain", {}).get("include_identity", False))
    db.configure(cfg["database"]["dsn"], cfg["embedding"]["dim"])
    embeddings.configure(cfg["embedding"]["model"])
    db.init_schema()

    _ready = True
    logger.info("bootstrap complete — brain root: %s", root)
    return cfg, root


def brain_root():
    return _brain_root
