"""Local Postgres + pgvector access. Two derived tables (semantic `mavis_chunks`,
structured `mavis_checkpoints`) plus a file-hash table for incremental reconciles."""

import psycopg
from pgvector.psycopg import register_vector

_DSN: str | None = None
_DIM: int = 384


def configure(dsn: str, dim: int) -> None:
    global _DSN, _DIM
    _DSN, _DIM = dsn, dim


def connect():
    if _DSN is None:
        raise RuntimeError("db not configured — call db.configure() first")
    conn = psycopg.connect(_DSN)
    register_vector(conn)
    return conn


def init_schema() -> None:
    with psycopg.connect(_DSN) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.commit()
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS mavis_chunks (
              id           BIGSERIAL PRIMARY KEY,
              project_name TEXT,
              source_path  TEXT NOT NULL,
              source_kind  TEXT NOT NULL,
              source_date  DATE,
              heading      TEXT,
              chunk_index  INT  NOT NULL,
              content      TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              embedding    VECTOR({_DIM}),
              updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
              UNIQUE (source_path, chunk_index)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS mavis_checkpoints (
              id              BIGSERIAL PRIMARY KEY,
              project_name    TEXT NOT NULL,
              checkpoint_date DATE NOT NULL,
              seq             INT  NOT NULL,
              heading         TEXT,
              body            TEXT NOT NULL,
              daily_link      TEXT,
              source_path     TEXT NOT NULL,
              content_hash    TEXT NOT NULL,
              UNIQUE (source_path, seq)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS mavis_files (
              source_path  TEXT PRIMARY KEY,
              content_hash TEXT NOT NULL,
              indexed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_hnsw ON mavis_chunks USING hnsw (embedding vector_cosine_ops)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_project ON mavis_chunks (project_name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_date ON mavis_chunks (source_date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cp_project_date ON mavis_checkpoints (project_name, checkpoint_date)")
        conn.commit()


def get_file_hashes() -> dict:
    with connect() as conn:
        rows = conn.execute("SELECT source_path, content_hash FROM mavis_files").fetchall()
    return {r[0]: r[1] for r in rows}


def replace_chunks(path: str, file_hash: str, rows: list[dict]) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM mavis_chunks WHERE source_path = %s", (path,))
        for r in rows:
            conn.execute(
                """
                INSERT INTO mavis_chunks
                  (project_name, source_path, source_kind, source_date,
                   heading, chunk_index, content, content_hash, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    r["project_name"], path, r["source_kind"], r["source_date"],
                    r["heading"], r["chunk_index"], r["content"], r["content_hash"], r["embedding"],
                ),
            )
        conn.execute(
            """
            INSERT INTO mavis_files (source_path, content_hash) VALUES (%s, %s)
            ON CONFLICT (source_path) DO UPDATE
              SET content_hash = EXCLUDED.content_hash, indexed_at = now()
            """,
            (path, file_hash),
        )
        conn.commit()


def replace_checkpoints(path: str, rows: list[dict]) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM mavis_checkpoints WHERE source_path = %s", (path,))
        for r in rows:
            conn.execute(
                """
                INSERT INTO mavis_checkpoints
                  (project_name, checkpoint_date, seq, heading, body, daily_link, source_path, content_hash)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source_path, seq) DO UPDATE
                  SET project_name = EXCLUDED.project_name, checkpoint_date = EXCLUDED.checkpoint_date,
                      heading = EXCLUDED.heading, body = EXCLUDED.body,
                      daily_link = EXCLUDED.daily_link, content_hash = EXCLUDED.content_hash
                """,
                (r["project_name"], r["checkpoint_date"], r["seq"], r["heading"],
                 r["body"], r["daily_link"], path, r["content_hash"]),
            )
        conn.commit()


def delete_missing(present_paths: set) -> int:
    with connect() as conn:
        rows = conn.execute("SELECT source_path FROM mavis_files").fetchall()
        orphans = {r[0] for r in rows} - set(present_paths)
        for p in orphans:
            conn.execute("DELETE FROM mavis_chunks WHERE source_path = %s", (p,))
            conn.execute("DELETE FROM mavis_checkpoints WHERE source_path = %s", (p,))
            conn.execute("DELETE FROM mavis_files WHERE source_path = %s", (p,))
        conn.commit()
        return len(orphans)


def search_chunks(embedding, k: int = 8, project: str | None = None,
                  date_from: str | None = None, date_to: str | None = None) -> list[dict]:
    where, where_params = [], []
    if project:
        where.append("project_name = %s")
        where_params.append(project)
    if date_from:
        where.append("source_date >= %s")
        where_params.append(date_from)
    if date_to:
        where.append("source_date <= %s")
        where_params.append(date_to)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    # Param order must match %s order in the SQL: score-embedding, WHERE..., order-embedding, limit
    params = [embedding, *where_params, embedding, k]
    with connect() as conn:
        conn.row_factory = psycopg.rows.dict_row
        rows = conn.execute(
            f"""
            SELECT project_name, source_path, source_kind, source_date, heading, content,
                   1 - (embedding <=> %s) AS score
            FROM mavis_chunks {clause}
            ORDER BY embedding <=> %s LIMIT %s
            """,
            params,
        ).fetchall()
    return rows


def query_checkpoints(project: str | None = None, date_from: str | None = None,
                      date_to: str | None = None, limit: int = 200) -> list[dict]:
    where, params = [], []
    if project:
        where.append("project_name ILIKE %s")
        params.append(f"%{project}%")
    if date_from:
        where.append("checkpoint_date >= %s")
        params.append(date_from)
    if date_to:
        where.append("checkpoint_date <= %s")
        params.append(date_to)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    params.append(limit)
    with connect() as conn:
        conn.row_factory = psycopg.rows.dict_row
        rows = conn.execute(
            f"SELECT project_name, checkpoint_date, heading, body, daily_link, source_path "
            f"FROM mavis_checkpoints {clause} ORDER BY checkpoint_date DESC, seq LIMIT %s",
            params,
        ).fetchall()
    return rows


def stats() -> dict:
    with connect() as conn:
        chunks = conn.execute("SELECT count(*) FROM mavis_chunks").fetchone()[0]
        checkpoints = conn.execute("SELECT count(*) FROM mavis_checkpoints").fetchone()[0]
        files = conn.execute("SELECT count(*) FROM mavis_files").fetchone()[0]
        last = conn.execute("SELECT max(indexed_at) FROM mavis_files").fetchone()[0]
        per_project = conn.execute(
            "SELECT project_name, count(*) FROM mavis_checkpoints GROUP BY project_name"
        ).fetchall()
    return {
        "chunks": chunks,
        "checkpoints": checkpoints,
        "files": files,
        "last_indexed_at": last.isoformat() if last else None,
        "checkpoints_per_project": {r[0]: r[1] for r in per_project},
    }
