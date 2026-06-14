"""CHAT ReAct agent — semantic + structured retrieval over the Mavis brain.

Tools:
  retrieve()          — pgvector similarity search over mavis_chunks
  query_checkpoints() — exact/chronological rows from mavis_checkpoints
  list_projects()     — registered project names + descriptions
"""

import json
import logging
import os
from datetime import date
from typing import AsyncGenerator

from langchain_core.messages import AIMessageChunk, AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain.chat_models import init_chat_model
from langgraph.prebuilt import create_react_agent

from . import brain, config, db
from .embeddings import embed_query

logger = logging.getLogger("mavis_rag.chat")

SYSTEM_PROMPT = """\
You are Mavis, a personal knowledge assistant with access to Beta's development journal.

The brain is a markdown repo of daily memories, project progress, and notes across
projects like stash (StashHub), cora (Cora admin dashboard), devkaki, eastern-deco, and more.
Today's date: {today}

Two retrieval layers are available:
  1. SEMANTIC — retrieve(): similarity search over chunks from daily memories, progress,
     notes, topic index. Use for "what/why/how" questions — concepts, decisions, gotchas.
  2. STRUCTURED — query_checkpoints(): exact rows from a progress table ordered by date.
     Use for "when/timeline/how-many" questions — timelines, shipping history, counts.

Combine both when useful (e.g. timeline from checkpoints, then details from retrieve).
Always include inline source citations like: [path :: heading]
If you find no relevant data, say so plainly.
"""


@tool
def retrieve(
    query: str,
    k: int = 8,
    project: str = "",
    date_from: str = "",
    date_to: str = "",
) -> str:
    """Semantic similarity search over brain chunks (daily memories, progress, notes).

    Use for "what/why/how" questions. Returns ranked text excerpts with source paths.

    Args:
        query: Natural language query describing what you're looking for.
        k: Number of results to return (default 8, max 20).
        project: Filter by project name (partial, case-insensitive). Leave empty for all.
        date_from: Filter to work dated on or after this date (YYYY-MM-DD). Leave empty to skip.
        date_to: Filter to work dated on or before this date (YYYY-MM-DD). Leave empty to skip.
    """
    k = max(1, min(k, 20))
    vec = embed_query(query)
    rows = db.search_chunks(
        vec,
        k=k,
        project=project or None,
        date_from=date_from or None,
        date_to=date_to or None,
    )
    if not rows:
        return "(no matching chunks found)"
    parts = []
    for r in rows:
        score = r.get("score", 0.0)
        path = r.get("source_path", "")
        heading = r.get("heading") or ""
        content = (r.get("content") or "").strip()
        parts.append(f"[{score:.2f}] {path} :: {heading}\n{content}")
    return "\n\n---\n\n".join(parts)


@tool
def query_checkpoints(
    project: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 50,
) -> str:
    """Exact chronological query of project progress checkpoints from progress.md files.

    Use for timeline/when/list questions: "what shipped in May", "devkaki's history",
    "last 3 things done on stash". Returns dated bullet-point summaries with project labels.

    Args:
        project: Project name to filter by (partial, case-insensitive). Leave empty for all.
        date_from: Start date YYYY-MM-DD (inclusive). Leave empty to skip.
        date_to: End date YYYY-MM-DD (inclusive). Leave empty to skip.
        limit: Max rows (default 50, max 200).
    """
    limit = max(1, min(limit, 200))
    rows = db.query_checkpoints(
        project=project or None,
        date_from=date_from or None,
        date_to=date_to or None,
        limit=limit,
    )
    if not rows:
        return "(no checkpoints found)"
    parts = []
    for r in rows:
        proj = r.get("project_name", "")
        heading = r.get("heading") or str(r.get("checkpoint_date", ""))
        body = (r.get("body") or "").strip()
        parts.append(f"## {proj} — {heading}\n{body}")
    return "\n\n".join(parts)


@tool
def list_projects() -> str:
    """List all registered Mavis projects with their one-line descriptions."""
    from . import runtime
    root = runtime.brain_root()
    if not root:
        return "(brain not found — service may not be bootstrapped)"
    projects = brain.list_projects(root)
    if not projects:
        return "(no projects registered in the brain)"
    lines = []
    for p in projects:
        desc = (p.get("description") or "").strip().split("\n")[0]  # first line only
        lines.append(f"- **{p['name']}**: {desc}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# LLM factory (mirrors activity-tracker/categorize.py make_llm)
# ---------------------------------------------------------------------------

def _make_llm():
    llm_cfg = config.CONFIG.get("llm", {}).get("chatbot", {})
    if not llm_cfg:
        raise ValueError("No 'chatbot' LLM block in config.yaml under llm:")

    api_key = llm_cfg.get("api_key") or os.environ.get(llm_cfg.get("api_key_env", ""), "")
    base_url = llm_cfg.get("base_url") or None
    default_headers = llm_cfg.get("default_headers") or {}

    kwargs: dict = dict(
        model=llm_cfg["model"],
        model_provider=llm_cfg.get("provider", "openai"),
        api_key=api_key,
        temperature=0,
    )
    if base_url:
        kwargs["base_url"] = base_url
    if default_headers:
        kwargs["default_headers"] = default_headers
    if llm_cfg.get("max_tokens"):
        kwargs["max_tokens"] = llm_cfg["max_tokens"]

    return init_chat_model(**kwargs)


# ---------------------------------------------------------------------------
# Agent singleton
# ---------------------------------------------------------------------------

_agent = None


def get_agent():
    global _agent
    if _agent is None:
        llm = _make_llm()
        _agent = create_react_agent(llm, [retrieve, query_checkpoints, list_projects])
        logger.info("chat agent created")
    return _agent


# ---------------------------------------------------------------------------
# SSE streaming generator
# ---------------------------------------------------------------------------

async def stream_response(
    message: str,
    history: list[dict],
    project: str | None = None,
) -> AsyncGenerator[str, None]:
    """Async generator — yields SSE-formatted strings for the /chat endpoint.

    Emits:
      event: token  data: {"content": "..."}   — one LLM token
      event: done   data: {}                    — stream finished
      event: error  data: {"error": "..."}      — something went wrong
    """
    agent = get_agent()
    today = date.today().isoformat()
    system_text = SYSTEM_PROMPT.format(today=today)

    # Build message list: system + up to last 8 history turns + new user message
    msgs = [SystemMessage(content=system_text)]
    for h in history[-8:]:
        role = h.get("role", "")
        content = h.get("content", "")
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))

    # If a project filter is specified, inject it into the user message
    user_content = message
    if project:
        user_content = f"[Context: focus on project '{project}']\n\n{message}"
    msgs.append(HumanMessage(content=user_content))

    try:
        async for event in agent.astream_events(
            {"messages": msgs},
            version="v2",
            config={"recursion_limit": 50},
        ):
            if event.get("event") != "on_chat_model_stream":
                continue
            chunk = event.get("data", {}).get("chunk")
            if not isinstance(chunk, AIMessageChunk):
                continue
            content = chunk.content
            if not isinstance(content, str) or not content:
                continue
            # Skip tool-call accumulation chunks (they have tool_call_chunks, no text)
            if getattr(chunk, "tool_call_chunks", None):
                continue
            yield f"event: token\ndata: {json.dumps({'content': content})}\n\n"
    except Exception as exc:
        logger.error("chat stream error: %s", exc, exc_info=True)
        yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

    yield "event: done\ndata: {}\n\n"
