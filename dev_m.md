# Developer Memo & Sync Guide (dev_m)
> **Version:** 1.0.0  
> **Last Updated:** 2026-08-31  
> **Status:** Active  

---

## 📌 Quick Instructions After `git pull`

When pulling updates from `main`, follow these steps to ensure your local environment and tests run smoothly:

### 1. Enable Core Git Credentials Guard
```bash
git config core.hooksPath .githooks
```

### 2. Configure Environment Variables (`.env`)
Copy `.env.example` to `.env` if you haven't already:
```bash
cp .env.example .env
```
Ensure your `.env` contains proper local configuration:
- **Database:** Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` or `DATABASE_URL`.
- **Email Delivery (Native Python SMTP):**
  ```env
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=your_email@gmail.com
  SMTP_PASSWORD=your_app_password
  SMTP_USE_TLS=true
  MAIL_FROM_EMAIL=your_email@gmail.com
  MAIL_FROM_NAME=NTIC Ghana Championship
  ```
  *(Leave `SMTP_HOST` blank in local development if you want emails printed directly to the console instead of sending live emails).*

### 3. Backend Setup & Verification
Run Pytest to verify local backend setup:
```bash
cd NticPlatform.Backend
..\.venv\Scripts\pytest tests/ -q
cd ..
```

### 4. Frontend Setup & Verification
Run TypeScript type-check to verify frontend components:
```bash
cd NticPlatform.Frontend
npx tsc --noEmit -p tsconfig.app.json
cd ..
```

---

## ⚠️ Mandatory Git Commit & Sync Protocol

To avoid committing live credentials or overwriting collaborator changes, **ALWAYS** follow these rules:

1. **Forbidden:** `git add .` is strictly forbidden. It risks staging tracked `.env` or temporary key injections in `environment.ts`.
2. **Forbidden:** Do not use `git commit --no-verify` or `git stash / git stash pop`.
3. **Explicit Staging:** Stage **only** the explicit files modified for your task:
   ```bash
   git add NticPlatform.Backend/app/main.py NticPlatform.Backend/tests/test_api.py
   ```
4. **Bidirectional Sync Command:**
   ```bash
   git pull --rebase origin main
   git add <explicit-file-1> <explicit-file-2>
   git commit -m "<type>: <what changed and why>"
   git pull --rebase origin main
   git push origin main
   ```

---

## 💬 Developer Short Communications Log

Use this section to leave short notes, status updates, or handoff messages for collaborators:

- **[2026-08-31 - v1.0.1]**: 
  - Fixed school draft resume verification modal UI: when resuming a draft saved under `repEmail`, `verificationInput` now correctly displays the representative's email address (`repEmail`) where the 6-digit code was delivered, instead of the school's general email.
- **[2026-08-31 - v1.0.0]**: 
  - Migrated email infrastructure from third-party Brevo API SDK to native Python `smtplib` + `email.message.EmailMessage`.
  - Resolved `/api/files/upload` duplicate route shadowing issue in FastAPI.
  - All 509 backend unit tests (`pytest`) and frontend TypeScript checks (`tsc`) passing cleanly.
