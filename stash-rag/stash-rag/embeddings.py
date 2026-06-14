"""Local embeddings via fastembed (ONNX, no torch, offline). The model is lazily
loaded on first use (downloads once to the fastembed cache)."""

_model = None
_model_name = "BAAI/bge-small-en-v1.5"


def configure(model_name: str) -> None:
    global _model_name
    _model_name = model_name


def _get():
    global _model
    if _model is None:
        from fastembed import TextEmbedding  # imported lazily — heavy
        _model = TextEmbedding(model_name=_model_name)
    return _model


def embed_documents(texts: list[str]) -> list:
    """Returns a list of float32 vectors aligned with `texts`."""
    if not texts:
        return []
    return list(_get().embed(texts))


def embed_query(text: str):
    return next(iter(_get().query_embed([text])))
