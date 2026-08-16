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
    BREVO_API_KEY: str = os.getenv("BREVO_API_KEY", "")

    # Outbound email identity is controlled by the server ONLY. Clients may
    # never choose the From address, otherwise /api/send-email becomes an
    # open, spoofable relay on our paid Brevo account.
    MAIL_FROM_EMAIL: str = _get_nonempty_env("MAIL_FROM_EMAIL", "no-reply@ntic.org.gh")
    MAIL_FROM_NAME: str = _get_nonempty_env("MAIL_FROM_NAME", "NTIC Ghana Championship")
    # Where security alerts are delivered. Falls back to the sender.
    SECURITY_ALERT_EMAIL: str = _get_nonempty_env("SECURITY_ALERT_EMAIL", "")

    PORT: int = int(os.getenv("PORT", 5000))

    ALLOWED_ORIGINS: list = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:4200,http://localhost:8080,https://ntic.up.railway.app",
    ).split(",")

    @classmethod
    def validate(cls) -> None:
        """No-op: always let the app start. DB errors surface via health endpoint."""
        return

    @classmethod
    def get_database_url(cls) -> str:
        for key in ("DATABASE_PRIVATE_URL", "DATABASE_URL"):
            url = os.getenv(key)
            if url:
                return url
        return f"postgresql://{cls.POSTGRES_USER}:{cls.POSTGRES_PASSWORD}@{cls.POSTGRES_HOST}:{cls.POSTGRES_PORT}/{cls.POSTGRES_DB}"

    @classmethod
    def log_db_config(cls) -> None:
        logger.info(f"DB Config: host={cls.POSTGRES_HOST}, port={cls.POSTGRES_PORT}, user={cls.POSTGRES_USER}, "
                    f"db={cls.POSTGRES_DB}, "
                    f"DATABASE_PRIVATE_URL={'set' if os.getenv('DATABASE_PRIVATE_URL') else 'not set'}, "
                    f"DATABASE_URL={'set' if os.getenv('DATABASE_URL') else 'not set'}")

    @classmethod
    def log_mail_config(cls) -> None:
        """Outbound mail identity is now server-controlled. If the operator has
        not chosen one, say so loudly: Brevo rejects unverified senders, so an
        unset value means email silently stops working."""
        if not _get_nonempty_env("MAIL_FROM_EMAIL"):
            logger.warning(
                "MAIL_FROM_EMAIL is not set - falling back to '%s'. "
                "Outbound email will FAIL unless this address is a verified "
                "sender in Brevo. Set MAIL_FROM_EMAIL to your verified sender.",
                cls.MAIL_FROM_EMAIL,
            )
        else:
            logger.info(f"Mail sender: {cls.MAIL_FROM_NAME} <{cls.MAIL_FROM_EMAIL}>")
        if not cls.SECURITY_ALERT_EMAIL:
            logger.info(
                "SECURITY_ALERT_EMAIL not set - security alerts will go to "
                f"{cls.MAIL_FROM_EMAIL}"
            )

settings = Config()
settings.validate()
settings.log_db_config()
settings.log_mail_config()
