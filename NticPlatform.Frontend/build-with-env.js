#!/usr/bin/env node
/**
 * Build wrapper that GUARANTEES secrets are scrubbed afterwards.
 *
 * Why this exists
 * ---------------
 * The build script was:
 *
 *   node inject-env.js && ng build && node inject-env.js restore
 *
 * `&&` means the restore step only runs when `ng build` exits zero. Any failed or
 * interrupted build therefore left the injected values -- real Brevo, SMSMode and
 * Gemini API keys -- sitting in `src/environments/environment.ts`, which is a
 * git-TRACKED file. It showed up as a normal modification, so a routine
 * `git add`/`git commit` would have published live credentials.
 *
 * That happened twice during development and was caught by inspecting the diff
 * before committing. Relying on catching it by eye is not a control.
 *
 * try/finally makes the restore unconditional: it runs on success, on a build
 * failure, and on SIGINT/SIGTERM.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const injectScript = path.join(__dirname, 'inject-env.js');
let restored = false;

function run(args, label) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  return result.status === null ? 1 : result.status;
}

function runNg(args) {
  // Resolve the local Angular CLI rather than relying on PATH.
  const ngBin = path.join(__dirname, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  const nodeOptions = process.env.NODE_OPTIONS || '--max-old-space-size=4096';
  const result = spawnSync(process.execPath, [ngBin, ...args], { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: nodeOptions } });
  if (result.error) {
    throw new Error(`ng could not start: ${result.error.message}`);
  }
  return result.status === null ? 1 : result.status;
}

function restore() {
  if (restored) return;
  restored = true;
  const status = run([injectScript, 'restore'], 'inject-env restore');
  if (status !== 0) {
    // Loud, because the working tree may still hold real credentials.
    console.error(
      '\n*** inject-env restore FAILED. src/environments/environment.ts may still\n' +
      '*** contain real API keys. Run `node inject-env.js restore` before committing.\n'
    );
  }
}

// Cover interruption as well as normal exit.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

let exitCode = 0;
try {
  exitCode = run([injectScript], 'inject-env');
  if (exitCode !== 0) {
    // Injection refused (most likely a stale backup). Nothing was changed, so
    // there is nothing to restore -- returning early avoids overwriting the
    // working file with a stale copy.
    restored = true;
    process.exit(exitCode);
  }
  exitCode = runNg(process.argv.slice(2).length ? process.argv.slice(2) : ['build']);
} finally {
  restore();
}

process.exit(exitCode);
