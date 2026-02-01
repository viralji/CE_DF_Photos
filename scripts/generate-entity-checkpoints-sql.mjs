/**
 * Generate create_entity_checkpoints.sql from checkpoints_data.json.
 * Run: node scripts/generate-entity-checkpoints-sql.mjs
 * Then run: sqlite3 data/ce_df_photos.db < scripts/create_entity_checkpoints.sql
 * (Or use the seed API / init-db-full.mjs for the same data.)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function to3CharCode(name) {
  const cleaned = (name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  return cleaned.length < 3 ? (cleaned + 'XXX').slice(0, 3) : cleaned;
}

function escapeSql(s) {
  return String(s).replace(/'/g, "''");
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
let entityIdx = 0;

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
    entityOrder.set(entityName, entityIdx++);
    entities.push({ name: entityName, code: to3CharCode(entityName) });
  }

  const before = row['Unnamed: 4'] === true || row['execution_before'] === 1 ? 1 : 0;
  const ongoing = row['Unnamed: 5'] === true || row['execution_ongoing'] === 1 ? 1 : 0;
  const after = row['Unnamed: 6'] === true || row['execution_after'] === 1 ? 1 : 0;
  const execution_stage = before ? 'Before' : ongoing ? 'Ongoing' : after ? 'After' : 'Ongoing';
  const photoType = typeof row['31'] === 'number' ? row['31'] : null;
  checkpoints.push({
    entityName,
    checkpoint_name: finalCheckpoint,
    code: to3CharCode(finalCheckpoint),
    evidence_type: evidenceType,
    execution_stage,
    execution_before: before,
    execution_ongoing: ongoing,
    execution_after: after,
    photo_type: photoType,
  });
}

const lines = [
  '-- Seed entities and checkpoints from checkpoints_data.json',
  '-- Run after create-schema (and migrate-execution-stage if DB existed before).',
  '-- sqlite3 data/ce_df_photos.db < scripts/create_entity_checkpoints.sql',
  '',
];

for (const e of entities) {
  lines.push(`INSERT OR IGNORE INTO entities (name, code, display_order) VALUES ('${escapeSql(e.name)}', '${escapeSql(e.code)}', 0);`);
}
lines.push('');

for (const c of checkpoints) {
  const photo = c.photo_type != null ? c.photo_type : 'NULL';
  lines.push(
    `INSERT OR IGNORE INTO checkpoints (entity_id, checkpoint_name, code, display_order, evidence_type, execution_stage, execution_before, execution_ongoing, execution_after, photo_type) ` +
    `SELECT e.id, '${escapeSql(c.checkpoint_name)}', '${escapeSql(c.code)}', 0, '${escapeSql(c.evidence_type)}', '${escapeSql(c.execution_stage)}', ${c.execution_before}, ${c.execution_ongoing}, ${c.execution_after}, ${photo} FROM entities e WHERE e.name = '${escapeSql(c.entityName)}' LIMIT 1;`
  );
}

const outPath = join(root, 'scripts', 'create_entity_checkpoints.sql');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
console.log('Wrote', outPath, '-', entities.length, 'entities,', checkpoints.length, 'checkpoints.');
