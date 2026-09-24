import sys
from pathlib import Path

# Ensure root and backend directories are in sys.path
_root_dir = Path(__file__).resolve().parent
_backend_path = _root_dir / "NticPlatform.Backend"

if _backend_path.exists() and str(_backend_path) not in sys.path:
    sys.path.insert(0, str(_backend_path))
if _root_dir.exists() and str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))
