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

### GIT SYNC WORKFLOW

Run this **only** when the user explicitly says "sync to git". Never on your own
initiative, and never as a background or periodic action.

```sh
# 0. One-time per clone: enable the credential guard.
git config core.hooksPath .githooks

# 1. See exactly what is here. More than one agent works in this repo, so the
#    working tree may contain someone else's half-finished edits.
git status
git diff

# 2. Stage ONLY the files belonging to the work you were asked to sync.
git add <explicit/path/one> <explicit/path/two>

# 3. Confirm the staged set is exactly what you intend to commit.
git diff --cached --stat

# 4. Verify before recording anything.
cd NticPlatform.Backend && python -m pytest tests/ -q && cd ..
cd NticPlatform.Frontend && npx tsc --noEmit -p tsconfig.app.json && cd ..

# 5. Commit with a message that describes the change.
git commit -m "<type>: <what changed and why>"

# 6. Rebase onto remote, then push.
git pull --rebase origin main
git push origin main
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

