import os
import sys
from pathlib import Path

# Add project root and NticPlatform.Backend to sys.path so app modules are resolvable
_api_dir = Path(__file__).resolve().parent
_root_dir = _api_dir.parent
_backend_dir = _root_dir / "NticPlatform.Backend"

if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

# Ensure Vercel serverless environment flag is recognized
os.environ.setdefault("VERCEL", "1")

# Import the FastAPI ASGI app from NticPlatform.Backend
from app.main import app
