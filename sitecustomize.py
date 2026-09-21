import sys
import os
from pathlib import Path

# 1. Add /opt/venv site-packages to sys.path
for sp in [
    Path("/opt/venv/lib/python3.13/site-packages"),
    Path("/opt/venv/lib/python3.12/site-packages"),
    Path("/opt/venv/lib/python3.11/site-packages"),
]:
    if sp.exists() and str(sp) not in sys.path:
        sys.path.insert(0, str(sp))

root_dir = Path(__file__).resolve().parent
backend_path = root_dir / "NticPlatform.Backend"
if backend_path.exists() and str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))
if root_dir.exists() and str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

# 2. Add WASIX native extension suffixes and re-register FileFinder in sys.path_hooks
try:
    import importlib.machinery
    import importlib.util

    extra_suffixes = [".cpython-313-wasm32-wasi.so", ".wasm32-wasi.so", ".so"]
    for extra in extra_suffixes:
        if extra not in importlib.machinery.EXTENSION_SUFFIXES:
            importlib.machinery.EXTENSION_SUFFIXES.insert(0, extra)

    # In Python, FileFinder.path_hook closes over the initial EXTENSION_SUFFIXES tuple.
    # Re-registering the hook is required so Python's native import statements find .cpython-313-wasm32-wasi.so.
    loaders = [
        (importlib.machinery.ExtensionFileLoader, importlib.machinery.EXTENSION_SUFFIXES),
        (importlib.machinery.SourceFileLoader, importlib.machinery.SOURCE_SUFFIXES),
        (importlib.machinery.SourcelessFileLoader, importlib.machinery.BYTECODE_SUFFIXES),
    ]
    sys.path_hooks = [h for h in sys.path_hooks if "FileFinder" not in getattr(h, "__qualname__", "")]
    sys.path_hooks.append(importlib.machinery.FileFinder.path_hook(*loaders))
    sys.path_importer_cache.clear()
    print(f"[sitecustomize] Registered WASIX suffixes: {importlib.machinery.EXTENSION_SUFFIXES}", flush=True)
except Exception as hook_err:
    print(f"[sitecustomize] Warning registering path hooks: {hook_err}", flush=True)

# 3. Clean up any broken symlinks that may have been created previously
for venv_site in [
    Path("/opt/venv/lib/python3.13/site-packages"),
    Path("/opt/venv/lib/python3.12/site-packages"),
]:
    if not venv_site.exists():
        continue
    for fake_ext in ["_pydantic_core.abi3.so", "_pydantic_core.so", "_psycopg.abi3.so", "_psycopg.so"]:
        target = venv_site.rglob(fake_ext)
        for t in target:
            if t.is_symlink():
                try:
                    t.unlink()
                    print(f"[sitecustomize] Removed symlink: {t}", flush=True)
                except Exception:
                    pass

# 4. Explicitly pre-load WASIX C-extensions using ExtensionFileLoader
def _try_preload_extension(fullname: str, rel_path: str):
    if fullname in sys.modules:
        return True
    try:
        import importlib.machinery
        import importlib.util

        for venv_site in [
            Path("/opt/venv/lib/python3.13/site-packages"),
            Path("/opt/venv/lib/python3.12/site-packages"),
        ]:
            so_file = venv_site / rel_path
            if so_file.exists():
                loader = importlib.machinery.ExtensionFileLoader(fullname, str(so_file))
                spec = importlib.util.spec_from_loader(fullname, loader)
                if spec:
                    mod = importlib.util.module_from_spec(spec)
                    loader.exec_module(mod)
                    sys.modules[fullname] = mod
                    short_name = fullname.split(".")[-1]
                    sys.modules[short_name] = mod
                    print(f"[sitecustomize] Successfully preloaded {fullname} from {so_file.name}", flush=True)
                    return True
    except Exception as preload_err:
        print(f"[sitecustomize] Note: Direct preload of {fullname} ({rel_path}) gave: {preload_err}", flush=True)
    return False

_try_preload_extension("pydantic_core._pydantic_core", "pydantic_core/_pydantic_core.cpython-313-wasm32-wasi.so")
_try_preload_extension("psycopg2._psycopg", "psycopg2/_psycopg.cpython-313-wasm32-wasi.so")

try:
    import pydantic_core
    print("[sitecustomize] pydantic_core verified available!", flush=True)
except Exception as p_err:
    print(f"[sitecustomize] Note: import pydantic_core gave: {p_err}", flush=True)
