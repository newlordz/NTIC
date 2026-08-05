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
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup);
  }

  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('REPLACE_BREVO_API_KEY', process.env.BREVO_API_KEY || '');
  content = content.replace('REPLACE_SMSMODE_API_KEY', process.env.SMSMODE_API_KEY || '');
  content = content.replace('REPLACE_GEMINI_API_KEY', process.env.GEMINI_API_KEY || '');
  fs.writeFileSync(file, content);
}
