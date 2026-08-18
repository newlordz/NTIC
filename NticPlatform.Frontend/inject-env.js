const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (e) {}

const ENV_FILES = [
  'src/environments/environment.ts',
  'src/environments/environment.prod.ts'
];
const BACKUP_DIR = '.env-backup';

if (process.argv[2] === 'restore') {
  for (const file of ENV_FILES) {
    const backup = path.join(BACKUP_DIR, path.basename(file));
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, file);
      fs.unlinkSync(backup);
    }
  }
  try { fs.rmdirSync(BACKUP_DIR); } catch (e) {}
  process.exit(0);
}

// Inject mode
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

for (const file of ENV_FILES) {
  const backup = path.join(BACKUP_DIR, path.basename(file));

  // A leftover backup means a previous build was interrupted between inject and
  // restore. Continuing would be destructive: the old code did
  // `if (!exists(backup)) copy(file, backup)`, so it KEPT the stale backup and
  // the restore step later copied it over the working file -- silently reverting
  // any edit made to environment.ts since the interrupted build. That is exactly
  // how `apiUrl` disappeared from environment.ts and produced a wave of
  // unrelated TS2339 errors.
  //
  // Refuse to guess. The stale backup is the last known-clean copy, so tell the
  // developer how to recover rather than destroying either version.
  if (fs.existsSync(backup)) {
    console.error(
      '\ninject-env: a previous build did not finish cleanly.\n' +
      `  Stale backup found: ${backup}\n` +
      `  Working file:       ${file}\n\n` +
      '  The working file may still contain injected secrets, and the backup may\n' +
      '  be older than your latest edits. Nothing has been changed.\n\n' +
      '  To recover, either:\n' +
      `    - keep your current file:  rm -r ${BACKUP_DIR}\n` +
      `    - or restore the backup:   node inject-env.js restore\n`
    );
    process.exit(1);
  }

  fs.copyFileSync(file, backup);

  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('REPLACE_BREVO_API_KEY', process.env.BREVO_API_KEY || '');
  content = content.replace('REPLACE_SMSMODE_API_KEY', process.env.SMSMODE_API_KEY || '');
  content = content.replace('REPLACE_GEMINI_API_KEY', process.env.GEMINI_API_KEY || '');
  fs.writeFileSync(file, content);
}
