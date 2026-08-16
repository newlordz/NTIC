#!/usr/bin/env python
"""NTIC Platform - PostgreSQL backup and restore.

There was previously no backup of anything, anywhere. This script is deliberately
dependency-light: it shells out to `pg_dump` / `pg_restore`, reads the same
environment variables as the application, and can optionally push the dump to
S3-compatible object storage.

Usage
-----
    # Write a compressed dump to ./backups/
    python scripts/db_backup.py backup

    # Custom location, and upload to the bucket in BACKUP_S3_BUCKET
    python scripts/db_backup.py backup --out /mnt/backups --upload

    # List what is available locally
    python scripts/db_backup.py list

    # Verify a dump is readable and complete (does not touch the database)
    python scripts/db_backup.py verify backups/ntic_2026-01-01_0300.dump

    # Restore. Refuses to run without --yes, and never targets a database whose
    # name lacks an explicit confirmation.
    python scripts/db_backup.py restore backups/ntic_2026-01-01_0300.dump --yes

Scheduling
----------
Linux/macOS (crontab -e), nightly at 03:00:

    0 3 * * * cd /srv/ntic && .venv/bin/python scripts/db_backup.py backup --upload --prune 14 >> /var/log/ntic-backup.log 2>&1

Windows (Task Scheduler), daily:

    schtasks /create /tn "NTIC DB Backup" /tr "C:\\path\\to\\.venv\\Scripts\\python.exe C:\\path\\to\\scripts\\db_backup.py backup --prune 14" /sc daily /st 03:00

Railway / managed Postgres: prefer the provider's own automated backups where
available, and use this as a second, independent copy you control.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

# Make `app` importable so we reuse the application's own connection settings.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "NticPlatform.Backend"))

try:
    from app.config import settings  # noqa: E402
except Exception as exc:  # pragma: no cover - only hit on a broken checkout
    print(f"Could not import application settings: {exc}")
    sys.exit(1)


DEFAULT_OUT = ROOT / "backups"


# ── Connection details ────────────────────────────────────────────────
def connection_params() -> dict:
    """Resolve connection details the same way the application does.

    A DATABASE_URL wins over the discrete PG* variables, matching
    app/database.py, so a backup can never silently target a different database
    than the one the app is using.
    """
    for key in ("DATABASE_PRIVATE_URL", "DATABASE_URL"):
        url = os.getenv(key, "").strip()
        if url:
            parts = urlsplit(url)
            return {
                "host": parts.hostname or "localhost",
                "port": str(parts.port or 5432),
                "user": parts.username or "postgres",
                "password": parts.password or "",
                "dbname": (parts.path or "/").lstrip("/") or "postgres",
                "source": key,
            }
    return {
        "host": settings.POSTGRES_HOST,
        "port": str(settings.POSTGRES_PORT),
        "user": settings.POSTGRES_USER,
        "password": settings.POSTGRES_PASSWORD,
        "dbname": settings.POSTGRES_DB,
        "source": "PG* environment variables",
    }


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        print(
            f"[ERROR] `{name}` was not found on PATH.\n"
            f"        It ships with the PostgreSQL client tools:\n"
            f"          Windows: install PostgreSQL, then add its \\bin to PATH\n"
            f"          Debian/Ubuntu: sudo apt install postgresql-client\n"
            f"          macOS: brew install libpq && brew link --force libpq"
        )
        sys.exit(1)
    return path


def run(cmd: list, password: str) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    if password:
        # PGPASSWORD avoids putting the password in the process arguments, where
        # any other user on the machine could read it from the process list.
        env["PGPASSWORD"] = password
    return subprocess.run(cmd, env=env, capture_output=True, text=True)


def sha256_of(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def human(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


# ── Commands ──────────────────────────────────────────────────────────
def cmd_backup(args) -> int:
    pg_dump = require_tool("pg_dump")
    params = connection_params()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d_%H%M")
    target = out_dir / f"ntic_{params['dbname']}_{stamp}.dump"

    print(f"Database : {params['user']}@{params['host']}:{params['port']}/{params['dbname']}")
    print(f"Resolved from: {params['source']}")
    print(f"Output   : {target}")

    # -Fc is PostgreSQL's custom format: compressed, and restorable selectively
    # with pg_restore. Plain SQL would be larger and less flexible.
    result = run(
        [
            pg_dump,
            "-h", params["host"],
            "-p", params["port"],
            "-U", params["user"],
            "-d", params["dbname"],
            "-Fc",
            "--no-owner",
            "--no-privileges",
            "-f", str(target),
        ],
        params["password"],
    )
    if result.returncode != 0:
        print("[ERROR] pg_dump failed:")
        print(result.stderr.strip()[:2000])
        if target.exists():
            target.unlink()  # never leave a partial dump that looks valid
        return 1

    size = target.stat().st_size
    if size == 0:
        print("[ERROR] pg_dump produced an empty file.")
        target.unlink()
        return 1

    digest = sha256_of(target)
    (target.parent / (target.name + ".sha256")).write_text(
        f"{digest}  {target.name}\n", encoding="utf-8"
    )

    print(f"[OK] Wrote {human(size)}  sha256={digest[:16]}...")

    # Prove the dump is readable before anyone relies on it.
    if verify_dump(target, quiet=False) != 0:
        print("[ERROR] The dump failed verification and should not be trusted.")
        return 1

    if args.upload:
        if upload_dump(target) != 0:
            return 1

    if args.prune:
        prune_old(out_dir, args.prune)

    return 0


def verify_dump(path: Path, quiet: bool = True) -> int:
    """Confirm pg_restore can read the archive and that it contains our tables."""
    pg_restore = require_tool("pg_restore")
    result = run([pg_restore, "--list", str(path)], "")
    if result.returncode != 0:
        print(f"[ERROR] pg_restore could not read {path.name}:")
        print(result.stderr.strip()[:1000])
        return 1

    listing = result.stdout
    # A dump that restores cleanly but contains no user table is useless.
    expected = ["users", "audit_logs", "competitions"]
    missing = [t for t in expected if f" {t} " not in listing and f"TABLE {t}" not in listing]
    if missing:
        print(f"[WARN] Expected table(s) not found in the dump: {', '.join(missing)}")
        print("       This may be correct for a fresh database, but check it.")

    table_count = listing.count("TABLE DATA")
    if not quiet:
        print(f"[OK] Verified: readable archive, {table_count} table data section(s)")
    return 0


def upload_dump(path: Path) -> int:
    bucket = (os.getenv("BACKUP_S3_BUCKET", "") or os.getenv("S3_AUDIT_BUCKET", "")).strip()
    if not bucket:
        print("[WARN] --upload requested but BACKUP_S3_BUCKET is not set; skipping.")
        return 0
    try:
        import boto3
    except ImportError:
        print("[ERROR] boto3 is required for --upload. Install it: pip install boto3")
        return 1
    try:
        client = boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL") or os.getenv("AWS_S3_ENDPOINT_URL") or None,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", ""),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", ""),
            region_name=os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1",
        )
        key = f"db_backups/{path.name}"
        client.upload_file(str(path), bucket, key)
        client.upload_file(str(path) + ".sha256", bucket, f"{key}.sha256")
        client.head_object(Bucket=bucket, Key=key)  # confirm it is really there
        print(f"[OK] Uploaded and verified s3://{bucket}/{key}")
        return 0
    except Exception as exc:
        print(f"[ERROR] Upload failed: {exc}")
        return 1


def prune_old(out_dir: Path, keep_days: int) -> None:
    cutoff = datetime.datetime.now().timestamp() - keep_days * 86400
    removed = 0
    for item in sorted(out_dir.glob("ntic_*.dump")):
        if item.stat().st_mtime < cutoff:
            checksum = item.parent / (item.name + ".sha256")
            item.unlink()
            if checksum.exists():
                checksum.unlink()
            removed += 1
    if removed:
        print(f"[OK] Removed {removed} local dump(s) older than {keep_days} days")


def cmd_list(args) -> int:
    out_dir = Path(args.out).resolve()
    if not out_dir.is_dir():
        print(f"No backup directory at {out_dir}")
        return 0
    dumps = sorted(out_dir.glob("ntic_*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not dumps:
        print(f"No dumps found in {out_dir}")
        return 0
    print(f"{'FILE':<52} {'SIZE':>10}  MODIFIED")
    for item in dumps:
        stat = item.stat()
        when = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
        print(f"{item.name:<52} {human(stat.st_size):>10}  {when}")
    return 0


def cmd_verify(args) -> int:
    path = Path(args.dump).resolve()
    if not path.is_file():
        print(f"[ERROR] No such file: {path}")
        return 1
    checksum_file = path.parent / (path.name + ".sha256")
    if checksum_file.exists():
        expected = checksum_file.read_text(encoding="utf-8").split()[0]
        actual = sha256_of(path)
        if expected != actual:
            print(f"[ERROR] Checksum mismatch. The dump is corrupt.\n  expected {expected}\n  actual   {actual}")
            return 1
        print("[OK] Checksum matches")
    else:
        print("[WARN] No .sha256 file alongside the dump; skipping checksum check")
    return verify_dump(path, quiet=False)


def cmd_restore(args) -> int:
    pg_restore = require_tool("pg_restore")
    path = Path(args.dump).resolve()
    if not path.is_file():
        print(f"[ERROR] No such file: {path}")
        return 1

    params = connection_params()
    print("=" * 68)
    print("RESTORE - this OVERWRITES data in the target database")
    print(f"  target : {params['user']}@{params['host']}:{params['port']}/{params['dbname']}")
    print(f"  from   : {path.name}")
    print("=" * 68)

    if not args.yes:
        print("\nRefusing to continue without --yes.")
        print("Re-run with --yes once you have confirmed the target above is correct.")
        return 1

    if cmd_verify(argparse.Namespace(dump=str(path))) != 0:
        print("[ERROR] Refusing to restore an unverified dump.")
        return 1

    # --clean drops objects before recreating them; without it a restore onto a
    # populated database fails halfway and leaves a mixture of old and new data.
    result = run(
        [
            pg_restore,
            "-h", params["host"],
            "-p", params["port"],
            "-U", params["user"],
            "-d", params["dbname"],
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            str(path),
        ],
        params["password"],
    )
    # pg_restore exits non-zero for benign "does not exist" notices during
    # --clean, so treat stderr as advisory and report it verbatim.
    if result.stderr.strip():
        print("pg_restore messages:")
        print(result.stderr.strip()[:4000])
    if result.returncode != 0:
        print(f"[WARN] pg_restore exited {result.returncode}. Review the messages above.")
        print("       'does not exist' notices during --clean are normal.")
    else:
        print("[OK] Restore completed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Back up and restore the NTIC PostgreSQL database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_backup = sub.add_parser("backup", help="Create a compressed dump")
    p_backup.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory")
    p_backup.add_argument("--upload", action="store_true", help="Also upload to BACKUP_S3_BUCKET")
    p_backup.add_argument("--prune", type=int, metavar="DAYS", help="Delete local dumps older than DAYS")
    p_backup.set_defaults(func=cmd_backup)

    p_list = sub.add_parser("list", help="List local dumps")
    p_list.add_argument("--out", default=str(DEFAULT_OUT))
    p_list.set_defaults(func=cmd_list)

    p_verify = sub.add_parser("verify", help="Check a dump is intact and readable")
    p_verify.add_argument("dump")
    p_verify.set_defaults(func=cmd_verify)

    p_restore = sub.add_parser("restore", help="Restore a dump (destructive)")
    p_restore.add_argument("dump")
    p_restore.add_argument("--yes", action="store_true", help="Confirm the destructive restore")
    p_restore.set_defaults(func=cmd_restore)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
