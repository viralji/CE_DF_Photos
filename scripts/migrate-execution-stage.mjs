/**
 * Migration: add execution_stage to checkpoints (single category: Before/Ongoing/After).
 * Run: node scripts/migrate-execution-stage.mjs
 * Safe to run multiple times (skips if execution_stage column already exists).
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

try {
  const columns = db.prepare("PRAGMA table_info(checkpoints)").all();
  const hasExecutionStage = columns.some((c) => c.name === 'execution_stage');
  if (hasExecutionStage) {
    console.log('Column execution_stage already exists. Skipping.');
    db.close();
    process.exit(0);
  }

  console.log('Adding execution_stage column to checkpoints...');
  db.exec(`ALTER TABLE checkpoints ADD COLUMN execution_stage TEXT DEFAULT 'Ongoing'`);

  console.log('Backfilling execution_stage from execution_before/ongoing/after...');
  db.exec(`
    UPDATE checkpoints SET execution_stage = CASE
      WHEN execution_before = 1 THEN 'Before'
      WHEN execution_ongoing = 1 THEN 'Ongoing'
      WHEN execution_after = 1 THEN 'After'
      ELSE 'Ongoing'
    END
  `);

  console.log('Migration completed successfully.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
db.close();
