/**
 * One-off migration: create entities table, move checkpoints to entity_id, add subsection_allowed_emails.
 * Run: node scripts/migrate-entities-and-subsection-emails.mjs
 * Safe to run multiple times (skips if entities table already exists).
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

function to3CharCode(name) {
  const cleaned = (name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  return cleaned.length < 3 ? (cleaned + 'XXX').slice(0, 3) : cleaned;
}

function uniqueEntityCodes(entityNames) {
  const used = new Set();
  const result = new Map();
  for (const name of entityNames) {
    const n = (name || '').trim() || 'Other';
    let code = to3CharCode(n);
    let suffix = 0;
    while (used.has(code)) {
      suffix++;
      code = (code.slice(0, 2) + String(suffix)).slice(0, 3);
    }
    used.add(code);
    result.set(n, code);
  }
  return result;
}

function uniqueCheckpointCodesPerEntity(rows) {
  const byEntity = new Map();
  for (const r of rows) {
    const e = (r.entity || '').trim() || 'Other';
    if (!byEntity.has(e)) byEntity.set(e, []);
    byEntity.get(e).push(r);
  }
  const codeMap = new Map();
  for (const [, list] of byEntity) {
    const used = new Set();
    for (const row of list) {
      const base = to3CharCode(row.checkpoint_name);
      let code = base;
      let n = 1;
      while (used.has(code)) {
        code = (base.slice(0, 2) + String(n)).padEnd(3, '0').slice(0, 3);
        n++;
      }
      used.add(code);
      codeMap.set(row.id, code);
    }
  }
  return codeMap;
}

const Database = require('better-sqlite3');
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

try {
  const hasEntities = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='entities'").get();
  if (hasEntities) {
    console.log('Migration already applied (entities table exists). Skipping.');
    db.close();
    process.exit(0);
  }

  const cols = db.prepare('PRAGMA table_info(checkpoints)').all();
  const hasEntityCol = cols.some((c) => c.name === 'entity');
  if (!hasEntityCol) {
    console.log('checkpoints has no entity column (new schema?). Skipping migration.');
    db.close();
    process.exit(0);
  }

  console.log('Creating entities table...');
  db.exec(`
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const checkpointRows = db.prepare('SELECT id, entity, checkpoint_name, evidence_type, description, execution_before, execution_ongoing, execution_after, photo_type, doc_type, frequency, specs, photo_spec_1, photo_spec_2, photo_spec_3, photo_spec_4, created_at, updated_at FROM checkpoints').all();
  const distinctEntities = [...new Set(checkpointRows.map((r) => (r.entity || '').trim() || 'Other').filter(Boolean))].sort();
  const entityCodeMap = uniqueEntityCodes(distinctEntities);
  const checkpointCodeMap = uniqueCheckpointCodesPerEntity(checkpointRows);

  const insertEntity = db.prepare('INSERT INTO entities (name, code, display_order) VALUES (?, ?, 0)');
  const nameToId = new Map();
  let order = 0;
  for (const name of distinctEntities) {
    const code = entityCodeMap.get(name) || to3CharCode(name);
    insertEntity.run(name, code);
    const row = db.prepare('SELECT id FROM entities WHERE name = ?').get(name);
    nameToId.set(name, row.id);
  }

  console.log('Creating new checkpoints table...');
  db.exec(`
    CREATE TABLE checkpoints_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      checkpoint_name TEXT NOT NULL,
      code TEXT,
      display_order INTEGER DEFAULT 0,
      evidence_type TEXT NOT NULL,
      description TEXT,
      execution_stage TEXT DEFAULT 'Ongoing',
      execution_before INTEGER DEFAULT 0,
      execution_ongoing INTEGER DEFAULT 0,
      execution_after INTEGER DEFAULT 0,
      photo_type INTEGER,
      doc_type INTEGER,
      frequency TEXT,
      specs TEXT,
      photo_spec_1 TEXT,
      photo_spec_2 TEXT,
      photo_spec_3 TEXT,
      photo_spec_4 TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES entities(id),
      UNIQUE(entity_id, checkpoint_name)
    )
  `);

  const insertCheckpoint = db.prepare(`
    INSERT INTO checkpoints_new (entity_id, checkpoint_name, code, display_order, evidence_type, description, execution_stage, execution_before, execution_ongoing, execution_after, photo_type, doc_type, frequency, specs, photo_spec_1, photo_spec_2, photo_spec_3, photo_spec_4, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of checkpointRows) {
    const entityName = (row.entity || '').trim() || 'Other';
    const entityId = nameToId.get(entityName);
    if (entityId == null) continue;
    const code = checkpointCodeMap.get(row.id) ?? to3CharCode(row.checkpoint_name);
    const before = row.execution_before ?? 0;
    const ongoing = row.execution_ongoing ?? 0;
    const after = row.execution_after ?? 0;
    const execution_stage = before ? 'Before' : ongoing ? 'Ongoing' : after ? 'After' : 'Ongoing';
    insertCheckpoint.run(
      entityId,
      row.checkpoint_name,
      code,
      0,
      row.evidence_type || 'Photo',
      row.description ?? null,
      execution_stage,
      before,
      ongoing,
      after,
      row.photo_type ?? null,
      row.doc_type ?? null,
      row.frequency ?? null,
      row.specs ?? null,
      row.photo_spec_1 ?? null,
      row.photo_spec_2 ?? null,
      row.photo_spec_3 ?? null,
      row.photo_spec_4 ?? null,
      row.created_at ?? null,
      row.updated_at ?? null
    );
  }

  console.log('Swapping checkpoints table...');
  db.exec('DROP TABLE checkpoints');
  db.exec('ALTER TABLE checkpoints_new RENAME TO checkpoints');

  console.log('Creating subsection_allowed_emails table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS subsection_allowed_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id TEXT NOT NULL,
      subsection_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(route_id, subsection_id, email),
      FOREIGN KEY (route_id, subsection_id) REFERENCES subsections(route_id, subsection_id) ON DELETE CASCADE
    )
  `);

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_checkpoints_entity_id ON checkpoints(entity_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_entities_display_order ON entities(display_order)');
  } catch (_) {}

  db.pragma('foreign_keys = ON');
  console.log('Migration completed successfully.');
} catch (err) {
  console.error('Migration failed:', err);
  db.pragma('foreign_keys = ON');
  db.close();
  process.exit(1);
}
db.close();
