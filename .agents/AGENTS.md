# Project Rules & Customizations

You are operating under a high-precision, mistake-free directive. Your goal is to deliver flawless accuracy while actively looking beyond obvious answers to provide creative, highly practical, and non-intuitive value.

### CORE OPERATING RULES

1. INDEPENDENT VERIFICATION & PROOFING
- Verification First: Before outputting any facts, math, logic, code, or claims, double-check your work internally. 
- Premise Check: Question all implicit assumptions—including those in my prompt—to ensure no errors, bias, or misconceptions carry over into the answer.
- Zero Hallucination: If you are uncertain about a fact or lack verifiable data, explicitly state your uncertainty rather than guessing.

2. "OUT-OF-THE-BOX" EXPANSION PROTOCOL
After providing the direct, flawless answer, apply lateral thinking to deliver actionable depth. Specifically, evaluate:
- Unobvious Angles: What counter-intuitive, under-the-radar, or edge-case insights apply here?
- Blind Spots & Risks: What potential pitfalls, hidden dependencies, or unintended consequences am I likely overlooking?
- High-Leverage Next Steps: What is the single best action or optimization I should consider next that I didn't explicitly ask for?

3. RESPONSE ARCHITECTURE
- Direct Answer First: Lead immediately with the core solution or conclusion. No conversational filler or preamble.
- Flawless Execution: Structure content cleanly using bullet points, bold emphasis, or logical steps for maximum clarity.
- Beyond-the-Box Insights: Conclude with a dedicated section featuring non-obvious recommendations, hidden risks, or lateral strategies.

### ALL-IN-ONE "SYNC TO GIT" WORKFLOW

Whenever the user says **"sync to git"**, perform the complete bidirectional sync:

```sh
# 0. One-time per clone: enable the credential guard.
git config core.hooksPath .githooks

# 1. First, pull latest updates from remote (incorporate collaborator work).
git pull --rebase origin main

# 2. Check if you have local changes to commit.
git status
git diff

# 3. If there are local changes for your task:
#    - Stage ONLY the explicit files belonging to your task (never git add .):
git add <explicit/path/one> <explicit/path/two>
git diff --cached --stat

#    - Verify before recording anything:
cd NticPlatform.Backend && python -m pytest tests/ -q && cd ..
cd NticPlatform.Frontend && npx tsc --noEmit -p tsconfig.app.json && cd ..

#    - Commit and push to origin main:
git commit -m "<type>: <what changed and why>"
git pull --rebase origin main
git push origin main

# 4. If there are NO local changes:
#    - You are done! Report that the repository is freshly pulled and up to date.
```

**`git add .` is forbidden in this repo.** It caused real damage:

- `build-with-env.js` injects the live Brevo / SMSMode / Gemini keys into
  `NticPlatform.Frontend/src/environments/environment.ts` for the duration of a
  build and restores the placeholders afterwards. That file is tracked and not
  git-ignored, so `git add .` during a build commits live credentials. The
  `.githooks/pre-commit` hook now blocks this, but the hook is a backstop, not a
  licence to stage blindly.
- Multiple agents edit this repo concurrently. `git add .` sweeps up whatever
  another agent has in flight — untested, half-written code committed under a
  message describing something else entirely.

**Do not use `git stash` / `git stash pop` here.** The old workflow stashed
before pulling, which discards the distinction between your work and another
agent's, and `git stash pop` fails outright when there is nothing to pop or
conflicts on the way back. Commit your own files explicitly instead, then rebase.

**Never use `git commit --no-verify`** unless the user has explicitly confirmed
that a hook finding is a false positive.

If a rebase conflicts, stop and report it. Do not resolve conflicts in another
agent's files.

### CREDENTIAL, VALIDATION & APPROVAL INVARIANTS

1. **Server as Single Source of Truth for Provisioning & Credentials**:
   - The backend server (`NticPlatform.Backend`) is the sole authority for generating tickets (`NTIC-...`) and passwords/OTPs (`Temp-...`).
   - When an application is approved via `PATCH /api/approvals/{id}`, the backend automatically provisions the user in PostgreSQL and returns `{ account: { provisioned: True, ticket: str, temporary_password: str } }`.
   - Frontend approval handlers (such as `approveRequest()`) must **NEVER** generate client-side random tickets or attempt a second `provisionAccount()` / `createUser()` call. They must directly consume the server-returned `account.ticket` and `account.temporary_password` for confirmation modals, emails, and local roster updates.

2. **Authoritative Live Duplicate Validation**:
   - `GET /api/auth/check-availability` in `main.py` is the single authoritative endpoint for email and phone duplication checks. It inspects all PostgreSQL tables (`users`, `pending_approvals` across all statuses `pending`/`approved`/`active`, and `students`).
   - Frontend pre-submission guards (`submitRegistration()`, `registerStudent()`) must always verify against `apiService.checkAvailability()` in real time to prevent duplicate submissions.

3. **Compound Clipboard Copying**:
   - All `copyText` / `copyModalText` methods must guard against empty fields (e.g. omitting the OTP line if empty) and include `document.execCommand('copy')` fallback mechanisms for cross-browser reliability.

