import os
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

class Config:
    # Supports both local .env vars and Railway automatic PostgreSQL env vars
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST") or os.getenv("PGHOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT") or os.getenv("PGPORT", 5432))
    POSTGRES_USER: str = os.getenv("POSTGRES_USER") or os.getenv("PGUSER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD", "botsio212nyc")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE", "NticPlatformDb")
    
    PORT: int = int(os.getenv("PORT", 5000))
    
    @classmethod
    def get_database_url(cls) -> str:
        url = os.getenv("DATABASE_URL")
        if url:
            return url
        return f"postgresql://{cls.POSTGRES_USER}:{cls.POSTGRES_PASSWORD}@{cls.POSTGRES_HOST}:{cls.POSTGRES_PORT}/{cls.POSTGRES_DB}"

settings = Config()
