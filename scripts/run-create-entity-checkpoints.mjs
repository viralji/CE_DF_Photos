/**
 * Seed entities and checkpoints from checkpoints_data.json.
 * Run after db:setup. Usage: node scripts/run-create-entity-checkpoints.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function to3CharCode(name) {
  const cleaned = (name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  return cleaned.length < 3 ? (cleaned + 'XXX').slice(0, 3) : cleaned;
}

const ENTITY_CODES = ['TRO', 'TRH', 'MAN', 'CAB', 'CBL', 'CBS'];

function uniqueCheckpointCode(name, usedCodes) {
  let base = to3CharCode(name);
  let code = base;
  let n = 0;
  while (usedCodes.has(code)) {
    n += 1;
    code = (base.slice(0, 2) + String(n)).slice(0, 3);
  }
  usedCodes.add(code);
  return code;
}

const jsonPath = join(root, 'checkpoints_data.json');
if (!existsSync(jsonPath)) {
  console.error('checkpoints_data.json not found');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const entityOrder = new Map();
const entities = [];
const checkpoints = [];
let lastEntity = '';
const seenKey = (e, c) => `${e}\t${c}`;
const seen = new Set();
const checkpointUsedCodes = new Set();
ENTITY_CODES.forEach((c) => checkpointUsedCodes.add(c));

for (const row of rows) {
  const entityCell = row['Unnamed: 0'] ?? row['Entity'];
  if (entityCell != null && String(entityCell).trim() !== '') {
    lastEntity = String(entityCell).trim();
  }
  const entityName = lastEntity;
  let checkpoint = String(row['Unnamed: 1'] ?? row['Checkpoint'] ?? '').trim();
  const evidenceType = String(row['Unnamed: 2'] ?? row['Attached Evidence Type'] ?? 'Photo');
  if (!entityName || !checkpoint) continue;
  if (entityName === 'Entity' && checkpoint === 'Checkpoint') continue;
  let key = seenKey(entityName, checkpoint);
  let suffix = 0;
  while (seen.has(key)) {
    suffix++;
    key = seenKey(entityName, `${checkpoint} (${suffix})`);
  }
  seen.add(key);
  const finalCheckpoint = suffix === 0 ? checkpoint : `${checkpoint} (${suffix})`;

  if (!entityOrder.has(entityName)) {
    const entityIdx = entities.length;
    entityOrder.set(entityName, entityIdx);
    const code = ENTITY_CODES[entityIdx] ?? to3CharCode(entityName);
    entities.push({ name: entityName, code, display_order: entityIdx });
  }

  const before = row['Unnamed: 4'] === true || row['execution_before'] === 1 ? 1 : 0;
  const ongoing = row['Unnamed: 5'] === true || row['execution_ongoing'] === 1 ? 1 : 0;
  const after = row['Unnamed: 6'] === true || row['execution_after'] === 1 ? 1 : 0;
  const execution_stage = before ? 'Before' : ongoing ? 'Ongoing' : after ? 'After' : 'Ongoing';
  const photoType = typeof row['31'] === 'number' ? row['31'] : null;
  const cpCode = uniqueCheckpointCode(finalCheckpoint, checkpointUsedCodes);
  checkpoints.push({
    entityName,
    checkpoint_name: finalCheckpoint,
    code: cpCode,
    display_order: checkpoints.length,
    evidence_type: evidenceType,
    execution_stage,
    execution_before: before,
    execution_ongoing: ongoing,
    execution_after: after,
    photo_type: photoType,
  });
}

const dbPath = process.env.DATABASE_URL || process.env.DATABASE_PATH || join(root, 'data', 'ce_df_photos.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(dbPath);

const insertEntity = db.prepare('INSERT OR IGNORE INTO entities (name, code, display_order) VALUES (?, ?, ?)');
const getEntityId = db.prepare('SELECT id FROM entities WHERE name = ?');
const insertCheckpoint = db.prepare(
  `INSERT OR IGNORE INTO checkpoints (entity_id, checkpoint_name, code, display_order, evidence_type, execution_stage, execution_before, execution_ongoing, execution_after, photo_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

for (const e of entities) {
  insertEntity.run(e.name, e.code, e.display_order);
}

for (const c of checkpoints) {
  const row = getEntityId.get(c.entityName);
  if (!row) continue;
  const photo = c.photo_type != null ? c.photo_type : null;
  insertCheckpoint.run(row.id, c.checkpoint_name, c.code, c.display_order, c.evidence_type, c.execution_stage, c.execution_before, c.execution_ongoing, c.execution_after, photo);
}

db.close();
console.log('Seeded', entities.length, 'entities and', checkpoints.length, 'checkpoints from checkpoints_data.json');
