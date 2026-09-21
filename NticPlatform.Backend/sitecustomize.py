import sys
from pathlib import Path

# Ensure root directory is first on sys.path
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

try:
    import sitecustomize
except ImportError:
    pass
