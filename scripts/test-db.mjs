/**
 * DB-only smoke test. Run: node scripts/test-db.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dbPath = process.env.DATABASE_PATH || join(root, 'data', 'ce_df_photos.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
const one = db.prepare('SELECT 1 as x').get();
if (one?.x !== 1) {
  console.error('DB query failed');
  process.exit(1);
}
console.log('✓ DB connection OK');
let routes = [];
let checkpoints = [];
try {
  routes = db.prepare('SELECT * FROM routes ORDER BY route_name').all();
  checkpoints = db.prepare('SELECT * FROM checkpoints').all();
  console.log('✓ Routes:', routes.length);
  console.log('✓ Checkpoints:', checkpoints.length);
} catch (e) {
  console.warn('⚠ Tables missing? Run: npm run db:setup && npm run seed:checkpoints');
}
db.close();
console.log('✓ DB smoke test passed');
