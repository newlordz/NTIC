# NTIC Platform

Web platform for Ghana's **National Technology & Innovation Championship** — a
national inter-school competition across Coding, Robotics, AI and Cybersecurity.

It covers the full competition lifecycle: the public site, registration and
approvals, competition and team management, a Learning Management System,
judging and leaderboards, talent discovery, sponsor engagement, reporting, and
email/WhatsApp notifications.

---

## Repository layout

| Path | What it is | Stack |
|---|---|---|
| `NticPlatform.Backend/` | REST API + WebSocket server | Python 3.12, FastAPI, PostgreSQL (raw `psycopg2`) |
| `NticPlatform.Frontend/` | Single-page application (PWA) | Angular 17, TypeScript, SCSS |
| `whatsapp-gateway/` | Optional OTP/notification relay | Node.js, Express, `whatsapp-web.js` |
| `stitch_national_ntic_competition_platform/` | Static design mockups | HTML + Tailwind (reference only, not deployed) |

---

## Quick start

### Prerequisites

- **Python 3.12+**
- **Node.js 20+**
- **PostgreSQL 13+** (14+ recommended)

### 1. Configure the environment

```bash
cp .env.example .env
```

Then edit `.env`. The minimum needed to boot is the database connection.
See `.env.example` for what each variable does.

### 2. Backend

```bash
cd NticPlatform.Backend
python -m venv ../.venv
# Windows:  ..\.venv\Scripts\activate
# macOS/Linux: source ../.venv/bin/activate
pip install -r requirements.txt
python run.py
```

API on **http://localhost:5000**. Interactive docs at `/docs` — enabled only when
`NTIC_DEV_RELOAD=true` (which `run_backend.bat` sets) or when you set
`NTIC_ENABLE_DOCS=true`. They are off in production by default because they
publish the full schema of every endpoint.

The schema is created and migrated automatically on startup. On the very first
run a super-admin account is created:

- Email: `admin@ntic.org.gh`
- Password: `NTIC_ADMIN_PASSWORD` from `.env`, or a **random password printed
  once in the startup log** if that variable is unset.

An existing admin's password is never overwritten by a restart. To rotate it, see
[Rotating the admin password](#rotating-the-admin-password).

### 3. Frontend

```bash
cd NticPlatform.Frontend
npm ci
# `ng serve` uses the gitignored environment.local.ts; create it once:
cp src/environments/environment.prod.ts src/environments/environment.local.ts
npm run dev
```

App on **http://localhost:4200**, proxying `/api` to port 5000 via
`proxy.conf.json`.

### 4. WhatsApp gateway (optional)

Only needed for phone/SMS OTP delivery.

```bash
cd whatsapp-gateway
npm ci
npm start          # scan the printed QR code with WhatsApp
```

Then set `SMS_GATEWAY_URL=http://localhost:3001` in `.env`. Without it, phone
verification reports itself unavailable rather than failing silently.

> ⚠️ `whatsapp-web.js` automates WhatsApp Web through a headless browser. It is
> unofficial and its use is against WhatsApp's Terms of Service; the paired
> number risks being banned. Treat it as a development convenience.

### Windows helper scripts

`run_backend.bat`, `run_frontend.bat`, `run_frontend_dev.bat`, `run_whatsapp.bat`
(and `.ps1` equivalents) wrap the commands above. There are no POSIX equivalents
yet — on macOS/Linux use the commands directly.

---

## Testing

```bash
# Backend  (needs a running PostgreSQL; creates and drops NticPlatformDb_test)
cd NticPlatform.Backend && python -m pytest tests -v

# Frontend
cd NticPlatform.Frontend && npx ng test --no-watch --browsers=ChromeHeadless

# Typecheck without emitting
cd NticPlatform.Frontend && npx tsc --noEmit -p tsconfig.app.json
```

The backend suite is **destructive**: it truncates and drops its own database.
`tests/conftest.py` refuses to run if `DATABASE_URL` points anywhere other than
`NticPlatformDb_test`, so it cannot be aimed at a real database by accident.

CI runs all of the above plus a production build and a secret scan on every push
and pull request — see `.github/workflows/ci.yml`.

---

## Architecture notes

### Authentication and authorisation

- Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations, per-password salt.
- Sessions: 256-bit CSPRNG bearer tokens in `auth_sessions`, 7-day expiry.
- The browser holds the token in `sessionStorage` only. Passwords are never
  persisted client-side.
- **Roles are defined once**, in `app/security.py`. Endpoints reference the role
  *groups* (`ADMIN_ROLES`, `CONTENT_ROLES`, `GRADING_ROLES`, …) rather than
  inlining role-name strings. `require_role(...)` fails at import time on an
  unknown role.
- The frontend guard (`guards/auth.guard.ts`) is a UX gate only, and fails
  **closed**. The backend enforces permissions independently.

### One-time passcodes

Generated, hashed, delivered and verified entirely server-side
(`POST /api/otp/request` → `POST /api/otp/verify`). The browser only ever holds
an opaque challenge id. Codes expire in 10 minutes, allow 5 attempts, and are
single-use.

**Do not add client-side OTP generation or comparison.** An earlier version did
this, which meant anyone could verify a contact they did not own.

### Credentials

Account passwords and access-pass codes are minted by the **server** with a
CSPRNG. `POST /api/users` returns `temporary_password` exactly once and flags the
account `must_change_password`, so a temporary password cannot become permanent.
Users change their own password at `POST /api/users/me/change-password`.

### Real-time updates

An authenticated WebSocket at `/api/ws` broadcasts `data_changed` events to
admin-level roles. State is in-process, so **this does not work across multiple
replicas** without a shared backplane (see Limitations).

### Health and monitoring

`GET /api/health` is public and returns **503** when the database is unusable.
`/api/system/nodes-health` and `/api/system/telemetry` are admin-only and report
measured values only; anything this process cannot observe (host CPU, memory,
request rates) is listed under `unavailable` rather than estimated.

---

## Rotating the admin password

There is no way for the server to email a password reset to the bootstrap admin,
so rotation goes through the environment:

1. Set `NTIC_ADMIN_PASSWORD` to the new value in `.env` (or Railway Variables).
2. Add `NTIC_ADMIN_PASSWORD_RESET=true`.
3. Restart. The log confirms the reset and that existing admin sessions were
   revoked.
4. **Remove `NTIC_ADMIN_PASSWORD_RESET`** and restart again — leaving it enabled
   re-resets the password on every boot.

Everyone else uses **Profile → Change Password** in the app, or an admin can
issue a new temporary password from User Management.

---

## Deployment

The repository contains several deployment paths. **The root `Dockerfile` is the
intended one**: it builds the Angular app, then the Python backend serves both
the API and the static frontend from a single container.

```bash
docker build -t ntic-platform .
docker run -p 5000:5000 --env-file .env ntic-platform
```

Set the same variables from `.env.example` in your platform's dashboard. The
database schema migrates itself on startup.

### Other configs present

`nixpacks.toml`, `Procfile`, `NticPlatform.Frontend/Dockerfile`,
`NticPlatform.Frontend/nginx.conf` and `NticPlatform.Frontend/railway.json` are
alternative or legacy paths. They are **not** kept in sync with the root
Dockerfile — notably `nginx.conf` has no `/api` proxy rule, so serving the
frontend through it alone will make every API call return HTML. Prefer the root
Dockerfile unless you have a specific reason not to.

---

## Backups

There is a backup script; **there is no automatic schedule until you create one.**

```bash
# Requires the PostgreSQL client tools (pg_dump / pg_restore) on PATH
python scripts/db_backup.py backup                 # -> ./backups/
python scripts/db_backup.py backup --upload        # also push to BACKUP_S3_BUCKET
python scripts/db_backup.py list
python scripts/db_backup.py verify backups/<file>.dump
python scripts/db_backup.py restore backups/<file>.dump --yes
```

Every dump gets a `.sha256` manifest and is verified with `pg_restore --list`
immediately after being written, so a silently truncated backup is caught at
creation rather than during an incident. `restore` refuses to run without
`--yes` and re-verifies the checksum first.

Schedule it — nightly at 03:00, keeping 14 days:

```
# Linux/macOS: crontab -e
0 3 * * * cd /srv/ntic && .venv/bin/python scripts/db_backup.py backup --upload --prune 14 >> /var/log/ntic-backup.log 2>&1
```

```
:: Windows: Task Scheduler
schtasks /create /tn "NTIC DB Backup" /sc daily /st 03:00 ^
  /tr "C:\path\to\.venv\Scripts\python.exe C:\path\to\scripts\db_backup.py backup --prune 14"
```

Dumps contain password hashes and session tokens. They are gitignored and
Docker-ignored; keep any bucket you upload them to private.

**Test your restore path before you need it.** A backup you have never restored
is a hypothesis, not a backup.

---

## Audit log retention

`audit_logs` grows without bound, so a retention job archives records older than
180 days and then deletes them. The ordering is strict:

1. select the expiring rows,
2. write a gzip archive and read it back to confirm the contents,
3. compute a SHA-256 manifest,
4. upload both to object storage and confirm the object exists,
5. **only then** delete the rows.

If any step fails, nothing is deleted and the reason is logged.

Because a container filesystem is discarded on redeploy, the job **refuses to
delete anything** unless `S3_AUDIT_BUCKET` is set, or you explicitly set
`AUDIT_ALLOW_EPHEMERAL_ARCHIVE=true` (only correct when `AUDIT_ARCHIVE_DIR`
points at a persistent volume). The `DELETE /api/audit-logs/prune` response
reports `status` and `detail` so a refusal is visible rather than looking like an
already-clean table.

Events of type `security`, `critical` and `revoked` are never pruned.

---

## Running more than one instance

Shared state lives in PostgreSQL, so horizontal scaling works without extra
infrastructure:

- **Rate limiting** is stored in a `rate_limit_hits` table, so the limit is
  global rather than per-process. If the database is unreachable the limiter
  falls back to in-process counting rather than disabling itself.
- **Real-time updates** fan out over PostgreSQL `LISTEN/NOTIFY` on the
  `ntic_data_changed` channel, so a write handled by one instance reaches
  WebSocket clients attached to another. Set `NTIC_DISABLE_WS_FANOUT=true` to
  turn this off.
- **Maintenance jobs** use `pg_try_advisory_lock`, so only one instance prunes at
  a time.

---

## Known limitations

- **Migrations are hand-rolled** (`CREATE TABLE IF NOT EXISTS` /
  `ADD COLUMN IF NOT EXISTS`). There is no version tracking and no down
  migrations; column renames and type changes must be handled manually.
- **`POST /api/students` is unauthenticated** so that anonymous team
  registration can persist the team lead. It is rate limited; the proper fix is
  to route it through the approvals queue.
- **No i18n.** All strings are hardcoded English.
- **No error tracking or metrics exporter.** `/api/system/telemetry` reports what
  the process can actually observe and explicitly lists what it cannot (host CPU,
  memory, request rates). Wire up Sentry/Prometheus if you need those.
- **The service worker prefetches the ~3.5 MB app shell** on first visit. Images
  (~24 MB) are lazy, so they download only when used, but the JS bundles are
  prefetched deliberately so offline mode has a consistent set.
- **Repository history contains ~71 MB of deleted binaries**
  (`ntic_slideshow.mp4`, `ffmpeg.7z`), so every clone transfers ~149 MB.
  Reclaiming it needs a history rewrite (`git filter-repo`) plus a force-push and
  a re-clone by everyone — deliberately not done automatically.

---

## Contributing

- Keep roles in `app/security.py`; do not inline role-name strings at call sites.
- Any new write endpoint needs an explicit role dependency. `TestPublicSurface`
  in `tests/test_api.py` fails if a new endpoint becomes anonymously writable, so
  making it public has to be a deliberate, reviewed decision.
- Never generate passwords, OTPs or access codes in the browser.
- Return pooled database connections with `release_db_connection(conn)`, not
  `conn.close()` — closing a pooled connection leaks its slot.
- Run the backend tests and `tsc --noEmit` before opening a pull request.
