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

- **[2026-09-02 - v1.0.7]**:
  - **The Native Feel UI/UX, Rich Block Studio & Media Upload Subsystem:**
    - **Dedicated Full-Page Workspaces:** Replaced cramped modals for course authoring and module creation with full-page dedicated consoles (`course_console`, `module_studio`, `course_wizard`).
    - **In-Place Rich Lesson Guide Editor & Live Preview:** Added formatting toolbar (Bold, Italic, H2/H3 headings, bullet/numbered lists, code blocks, blockquotes, and operational tip callouts) for lesson content with an in-place rendered Live Preview and top-right **Pencil Edit** action.
    - **Real Media & File Uploads (`/api/files/upload`):** Added drag-and-drop dropzones and direct file uploaders for PDF/documents, schematic & diagram images (with live preview thumbnail), and local `.mp4`/`.webm` video files alongside external stream URLs.
    - **Recursive Payload Unwrapping:** Implemented `parseMaterialToBlock()` and sanitized `persistBlocksForModule()` to eliminate nested double-encoded JSON payloads when editing and re-saving files and guides.
    - **Smooth Quiz Option Input Focus:** Added `trackBy: trackByIndex` and `$event.stopPropagation()` to quiz options builder, preventing DOM node thrashing and focus loss during typing.
    - **Dedicated Up/Down Block Reorder Controls:** Added prominent position-shifting arrows (`keyboard_arrow_up`, `keyboard_arrow_down`) on each block header with instant animated sequence reordering.
    - **Sticky Left Palette & Scrollable Canvas Stream:** The `.studio-palette-sidebar` stays pinned on the left while `.studio-canvas-stream` scrolls independently for unlimited blocks.
    - **Clickable Touchpoints Across LMS:** Every course card, module row, learning asset, and submission is fully interactive with hover elevation and illumination borders.
    - **1-at-a-Time Progressive Course Wizard:** 4-step sliding questionnaire (Title &rarr; Category Track &rarr; Difficulty Level &rarr; Outcomes Summary) designed for non-technical educators with zero cognitive overload.
    - **Course Insights & Analytics Drawer:** Real-time progress distribution breakdown (Mastery, On Track, In Progress, Getting Started) and student performance indicators.
  - All 508 backend unit tests (`pytest`) and frontend TypeScript typechecks (`tsc` / `ngc`) passing cleanly with 0 errors.
- **[2026-09-02 - v1.0.6]**:
  - **IBM SkillsBuild-Style Rich Multi-Widget Module Content System:**
    - **Multi-Widget Architecture:** Modules now support 5 specialized widget types (Video Player, Interactive Reading Guide, Micro-Quiz / Knowledge Check, Code Challenge Sandbox, and Resource Attachment).
    - **Instructor Multi-Widget Studio (`/lms-manager`):** Progressive 2-step creator allowing instructors to configure Video embed parameters (URL, duration, takeaways), Reading Guide Markdown, Micro-Quizzes (prompt, 4 options, correct answer, explanation), and Code Sandboxes (target language, requirements, starter code).
    - **Interactive Classroom Player (`/lms`):** Full 2-column responsive learning stage with left module syllabus navigation, mastery gauge, video embeds, styled reading units, interactive quiz choice cards with instant animated visual feedback, code sandbox with 1-click clipboard copy, and seamless progress tracking.
    - **Role Check Resilience:** Enhanced `isStaffReviewer` in LMS Manager to gracefully read from the active session token before user profile load, ensuring admins always access the Content Approvals Queue instantly.
  - All 508 backend unit tests (`pytest`) and frontend TypeScript typechecks (`tsc`) passing cleanly.
- **[2026-09-02 - v1.0.5]**:
  - **Instructor Portal & LMS Audit Fixes:**
    - **Multi-Course Q&A Aggregation:** Upgraded `GET /api/lms/qa` so `course_id` is optional. When omitted, instructors retrieve all discussion threads across their authored courses, and admins retrieve platform-wide threads.
    - **Cross-Course Announcement Scoping:** Upgraded `GET /api/lms/announcements` so instructors retrieve announcements for all their authored courses or enrollments when no single course filter is applied.
    - **Reactive Toolbar Course Switcher:** Linked toolbar `selectedCourseId` to dynamically refresh both Q&A threads and announcements via `onCourseFilterChange()`.
    - **Grading Desk Consolidation & Dynamic Score Validation:** Replaced duplicate revision buttons in the grading modal with a single "Request Revision (Return to Student)" action. Dynamically bound score input validation to `activeSubmission.max_score` with informative score point indicators.
    - **Gradebook & Submissions CSV Exports:** Added 1-click CSV report generators in the Students Roster tab (`exportGradebookCsv()`) and Grading Desk (`exportGradingQueueCsv()`) with progress percentages, submission dates, and assessment scores.
    - **Smart Module Order Cascading:** In `PATCH /api/lms/modules/{module_id}`, changing a module's order index now automatically shifts adjacent modules' order indices to keep syllabus sequences compact and collision-free.
    - **UI/UX Directives Applied:** Enforced strict palette discipline (monochrome foundation with primary indigo accent and functional semantic indicators) and 8px baseline spatial rhythm.
  - All 508 backend unit tests (`pytest`) and frontend TypeScript typechecks (`tsc`) passing cleanly.
- **[2026-09-01 - v1.0.4]**:
  - **Registration & Team Auto-Staging:** Implemented `autoStageCurrentTeam()` to auto-add in-progress team drafts in Step 3 upon clicking Next, Preview, or Submit. Added real-time Live Preview roster card reflection for draft teams and formatted member summaries.
  - **Application Editing & Duplicate Availability:** Added `exclude_code` parameter to `GET /api/auth/check-availability` so editing a pending application ignores the applicant's own existing record. Bypassed OTP re-verification for loaded/resumed approvals.
  - **Public File Uploads & Upload State Feedback:** Whitelisted `/api/files/upload` in public API middleware for anonymous registration uploads. Added reactive `isUploadingFile` state with animated spinning loaders across team member photo uploads, school logos, and accreditation/instructor document cards.
  - **Instructor Form Document Retention:** Enhanced `loadApprovalIntoForm` to reliably preserve and display attached instructor CVs/certificates/IDs and email verification states across edits.
  - **Instructor LMS Management & Course Visibility:**
    - **Admin Course View Across Authors:** Updated `GET /api/lms/my-courses` so administrators and staff reviewers can see all approved and active courses across all authors on the platform in Courses Hub and detail tabs, while authors see their own authored courses.
    - **Module, Material, & Assignment Editing (PATCH Endpoints):** Added backend routes `PATCH /api/lms/modules/{module_id}`, `PATCH /api/lms/materials/{material_id}`, and `PATCH /api/lms/assignments/{assignment_id}`. Fixed `saveModule()`, `saveMaterial()`, and `saveAssignment()` to update existing entities when in edit mode instead of re-creating duplicates.
    - **Smart Order Index Suggestion:** When creating new curriculum modules, automatically calculates the highest existing module order index for the selected course and suggests the next sequential order number (`max(order) + 1`).
    - **Course Dropdown Options in Modals:** Bound module, material, and assignment modals to live server-loaded `coursesList`.
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
