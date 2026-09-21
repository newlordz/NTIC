import sys
from pathlib import Path

# Ensure root directory and backend directory are first on sys.path
root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "NticPlatform.Backend"

for sp in [
    Path("/opt/venv/lib/python3.13/site-packages"),
    Path("/opt/venv/lib/python3.12/site-packages"),
    Path("/opt/venv/lib/python3.11/site-packages"),
]:
    if sp.exists() and str(sp) not in sys.path:
        sys.path.insert(0, str(sp))

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

try:
    import sitecustomize
except ImportError:
    pass

if __name__ == "__main__":
    # Execute NticPlatform.Backend/run.py
    backend_run = backend_dir / "run.py"
    with open(backend_run, "rb") as f:
        code = compile(f.read(), str(backend_run), "exec")
        exec(code, {"__name__": "__main__", "__file__": str(backend_run)})
