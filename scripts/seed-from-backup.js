// One-off migration: copies a habit-widget backup JSON into the app's userData folder.
// Usage: node scripts/seed-from-backup.js "<path-to-backup.json>"
const fs = require('fs');
const path = require('path');
const os = require('os');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('Backup file not found. Usage: node scripts/seed-from-backup.js "<path>"');
  process.exit(1);
}

const userDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'habit-widget');
fs.mkdirSync(userDataDir, { recursive: true });

const dest = path.join(userDataDir, 'data.json');
fs.copyFileSync(src, dest);
console.log(`Seeded ${dest} from ${src}`);
