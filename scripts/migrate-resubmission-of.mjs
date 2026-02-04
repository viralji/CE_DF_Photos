/**
 * Migration: add resubmission_of_id to photo_submissions for resubmission history.
 * Run: node scripts/migrate-resubmission-of.mjs
 * Safe to run multiple times (skips if column/index already exist).
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const dbPath = process.env.DATABASE_URL || process.env.DATABASE_PATH || join(root, 'data', 'ce_df_photos.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

try {
  const columns = db.prepare("PRAGMA table_info(photo_submissions)").all();
  const hasResubmissionOf = columns.some((c) => c.name === 'resubmission_of_id');
  if (hasResubmissionOf) {
    console.log('Column resubmission_of_id already exists. Skipping.');
    db.close();
    process.exit(0);
  }

  console.log('Adding resubmission_of_id column to photo_submissions...');
  db.exec(`ALTER TABLE photo_submissions ADD COLUMN resubmission_of_id INTEGER REFERENCES photo_submissions(id)`);

  console.log('Creating index on resubmission_of_id...');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_submissions_resubmission_of ON photo_submissions(resubmission_of_id)`);

  console.log('Migration completed successfully.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
db.close();
