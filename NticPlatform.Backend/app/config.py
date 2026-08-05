import os
import logging
from pathlib import Path

# Try to load .env from workspace root or current directory
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).resolve().parent.parent.parent / ".env"
    if root_env.exists():
        load_dotenv(root_env)
    else:
        load_dotenv()
except ImportError:
    pass

logger = logging.getLogger("ntic.config")

def _get_nonempty_env(key: str, default: str = "") -> str:
    """Get env var only if it's set and non-empty."""
    val = os.getenv(key)
    return val if val and val.strip() else default

class Config:
    # Supports both local .env vars and Railway automatic PostgreSQL env vars
    POSTGRES_HOST: str = _get_nonempty_env("POSTGRES_HOST") or _get_nonempty_env("PGHOST", "localhost")
    POSTGRES_PORT: int = int(
        _get_nonempty_env("POSTGRES_PORT")
        or _get_nonempty_env("PGPORT")
        or "5432"
    )
    POSTGRES_USER: str = _get_nonempty_env("POSTGRES_USER") or _get_nonempty_env("PGUSER", "postgres")
    POSTGRES_PASSWORD: str = _get_nonempty_env("POSTGRES_PASSWORD") or _get_nonempty_env("PGPASSWORD", "")
    POSTGRES_DB: str = _get_nonempty_env("POSTGRES_DB") or _get_nonempty_env("PGDATABASE", "NticPlatformDb")

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    PORT: int = int(os.getenv("PORT", 5000))

    @classmethod
    def validate(cls) -> None:
        """No-op: always let the app start. DB errors surface via health endpoint."""
        return

    @classmethod
    def get_database_url(cls) -> str:
        url = os.getenv("DATABASE_URL")
        if url:
            return url
        return f"postgresql://{cls.POSTGRES_USER}:{cls.POSTGRES_PASSWORD}@{cls.POSTGRES_HOST}:{cls.POSTGRES_PORT}/{cls.POSTGRES_DB}"

    @classmethod
    def log_db_config(cls) -> None:
        """Log DB config (without password) for debugging."""
        logger.info(f"DB Config: host={cls.POSTGRES_HOST}, port={cls.POSTGRES_PORT}, user={cls.POSTGRES_USER}, db={cls.POSTGRES_DB}, DATABASE_URL={'set' if os.getenv('DATABASE_URL') else 'not set'}")

settings = Config()
settings.validate()
settings.log_db_config()
