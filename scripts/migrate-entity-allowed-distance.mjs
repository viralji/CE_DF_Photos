#!/usr/bin/env node
/**
 * Safe migration: add entities.allowed_distance column if missing.
 * Run on server before or after deploy. Idempotent — safe to run multiple times.
 * Does not delete or modify existing data.
 *
 * Usage: node scripts/migrate-entity-allowed-distance.mjs
 * Or:    DATABASE_PATH=/path/to/ce_df_photos.db node scripts/migrate-entity-allowed-distance.mjs
 *
 * Alternatively, "npm run db:setup" already applies this migration (lib/db.ts).
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function getDbPath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return join(root, 'data', 'ce_df_photos.db');
}

const dbPath = getDbPath();
if (!existsSync(dbPath)) {
  console.error('Database not found at', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
try {
  const cols = db.prepare("PRAGMA table_info(entities)").all();
  const hasAllowedDistance = cols.some((c) => c.name === 'allowed_distance');
  if (hasAllowedDistance) {
    console.log('entities.allowed_distance already exists. Nothing to do.');
  } else {
    db.exec('ALTER TABLE entities ADD COLUMN allowed_distance INTEGER');
    console.log('Added entities.allowed_distance. Existing rows have NULL (use app default).');
  }
} finally {
  db.close();
}
