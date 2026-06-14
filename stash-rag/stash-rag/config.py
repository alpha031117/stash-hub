"""Config + .env loading. Mirrors the activity-tracker convention:
config.yaml for structure, a custom .env loader, and `api_key_env` storing the
env-var NAME (never the secret) for LLM blocks."""

import os
from pathlib import Path

import yaml

_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _ROOT / "config.yaml"
_ENV_PATH = _ROOT / ".env"


def _load_dotenv(env_file: Path) -> None:
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


def load_config() -> dict:
    _load_dotenv(_ENV_PATH)
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


CONFIG = load_config()
