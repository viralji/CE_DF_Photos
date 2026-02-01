/**
 * Run create_entity_checkpoints.sql to seed entities and checkpoints.
 * Run after schema (and db:migrate:execution-stage if DB existed before).
 * Usage: node scripts/run-create-entity-checkpoints.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const dbPath = process.env.DATABASE_URL || process.env.DATABASE_PATH || join(root, 'data', 'ce_df_photos.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const sqlPath = join(root, 'scripts', 'create_entity_checkpoints.sql');
if (!existsSync(sqlPath)) {
  console.error('create_entity_checkpoints.sql not found. Run: npm run db:generate-entity-checkpoints-sql');
  process.exit(1);
}

const Database = require('better-sqlite3');
const db = new Database(dbPath);
const sql = readFileSync(sqlPath, 'utf-8');
const statements = sql
  .split(';')
  .map((s) => s
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim())
  .filter((s) => s.length > 0);

for (const stmt of statements) {
  try {
    db.exec(stmt + ';');
  } catch (err) {
    console.error('SQL error:', err.message);
    db.close();
    process.exit(1);
  }
}
db.close();
console.log('Seeded entities and checkpoints from create_entity_checkpoints.sql');
