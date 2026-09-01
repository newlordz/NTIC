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

- **[2026-09-01 - v1.0.4]**:
  - **Registration & Team Auto-Staging:** Implemented `autoStageCurrentTeam()` to auto-add in-progress team drafts in Step 3 upon clicking Next, Preview, or Submit. Added real-time Live Preview roster card reflection for draft teams and formatted member summaries.
  - **Application Editing & Duplicate Availability:** Added `exclude_code` parameter to `GET /api/auth/check-availability` so editing a pending application ignores the applicant's own existing record. Bypassed OTP re-verification for loaded/resumed approvals.
  - **Public File Uploads & Upload State Feedback:** Whitelisted `/api/files/upload` in public API middleware for anonymous registration uploads. Added reactive `isUploadingFile` state with animated spinning loaders across team member photo uploads, school logos, and accreditation/instructor document cards.
  - **Instructor Form Document Retention:** Enhanced `loadApprovalIntoForm` to reliably preserve and display attached instructor CVs/certificates/IDs and email verification states across edits.
  - **Instructor LMS Management & Course Creation Feedback:**
    - Fixed duplicate course creation by adding `isSaving` guards and double-click protection to course, module, material, assignment, and grading action handlers.
    - Added spinning loaders (`spinner-inline`) and disabled states (`[disabled]="isSaving"`) to modal action buttons in LMS Manager.
    - Resolved `GET /api/lms/moderation-queue` 403 Forbidden error for instructors by scoping the moderation queue endpoint request and the "Content Approvals Queue" tab exclusively to staff reviewers (`admin`, `super_admin`, `content_manager`, `reviewer`) via `CurrentUserService`.
    - Added dedicated "My Submissions in Review" KPI metric card for instructor authors.
  - All 508 backend unit tests (`pytest`) and frontend TypeScript typechecks (`tsc`) passing cleanly.
- **[2026-09-01 - v1.0.3]**:
  - Implemented comprehensive performance optimizations across the full stack:
    - **Frontend:** Applied `ChangeDetectionStrategy.OnPush` across all 16 page components, debounced `saveState()` writes (300ms) with IndexedDB coalescing, removed wasteful `localStorage` dual-write for large collections, enhanced `WsSyncService` with ping/pong timeout handling and visibility auto-reconnect.
    - **Backend:** Added `GZipMiddleware` payload compression (>1KB responses), real-time `Server-Timing` headers, in-memory TTL caching with write invalidation for 6 public marketing/landing GET endpoints, `before_id` cursor pagination for audit logs, `updated_at` column and `?updated_since` delta sync for `/api/users`.
    - **Database & SMTP:** Added composite index `idx_pending_approvals_status_type` on `pending_approvals (status, type)` and `idx_users_updated_at` on `users (updated_at)`. Verified native Google SMTP TLS/1SSL delivery.
    - All 509 backend unit tests (`pytest`) and frontend TypeScript checks (`tsc`) passing cleanly.
- **[2026-08-31 - v1.0.2]**:
  - Extended development rate limits in `app/security.py`: during local development (`NTIC_DEV_RELOAD=true`), `check_rate_limit` automatically applies a `100x` attempt multiplier (`DEV_RATE_LIMIT_MULTIPLIER=100`) or can be bypassed entirely with `DISABLE_RATE_LIMITS=true` in `.env`. Prevents `HTTP 429` throttling during rapid local dev testing.
- **[2026-08-31 - v1.0.1]**:
  - Fixed school draft resume verification modal UI: when resuming a draft saved under `repEmail`, `verificationInput` now correctly displays the representative's email address (`repEmail`) where the 6-digit code was delivered, instead of the school's general email.
- **[2026-08-31 - v1.0.0]**:
  - Migrated email infrastructure from third-party Brevo API SDK to native Python `smtplib` + `email.message.EmailMessage`.
  - Resolved `/api/files/upload` duplicate route shadowing issue in FastAPI.
  - All 509 backend unit tests (`pytest`) and frontend TypeScript checks (`tsc`) passing cleanly.
