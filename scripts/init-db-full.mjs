/**
 * Initialize DB: schema + seed checkpoints. Run: node scripts/init-db-full.mjs
 * Use when tsx is unavailable (e.g. sandbox). Same effect as db:setup + db:seed-entities-checkpoints.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const dbPath = process.env.DATABASE_PATH || join(root, 'data', 'ce_df_photos.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const schemaPath = join(root, 'scripts', 'create-schema.sql');
if (!existsSync(schemaPath)) {
  console.error('create-schema.sql not found');
  process.exit(1);
}
const schema = readFileSync(schemaPath, 'utf-8');
const statements = schema
  .split(';')
  .map((s) => s
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim())
  .filter((s) => s.length > 0);
for (const statement of statements) {
  try {
    db.exec(statement + ';');
  } catch (err) {
    if (!err.message?.includes('already exists')) console.error('Schema:', err.message);
  }
}

const idxSql = `CREATE INDEX IF NOT EXISTS idx_photo_submissions_route_sub_status ON photo_submissions(route_id, subsection_id, status)`;
try { db.exec(idxSql); } catch (_) {}

function to3CharCode(name) {
  const cleaned = (name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  return cleaned.length < 3 ? (cleaned + 'XXX').slice(0, 3) : cleaned;
}

const jsonPath = join(root, 'checkpoints_data.json');
if (existsSync(jsonPath)) {
  const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const insertEntity = db.prepare('INSERT OR IGNORE INTO entities (name, code, display_order) VALUES (?, ?, 0)');
  const getEntityId = db.prepare('SELECT id FROM entities WHERE name = ?');
  const insertCheckpoint = db.prepare(
    'INSERT OR IGNORE INTO checkpoints (entity_id, checkpoint_name, code, display_order, evidence_type, execution_stage, execution_before, execution_ongoing, execution_after, photo_type) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
  );
  let count = 0;
  let lastEntity = '';
  const seenKey = (e, c) => `${e}\t${c}`;
  const seen = new Set();
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
    insertEntity.run(entityName, to3CharCode(entityName));
    const entityRow = getEntityId.get(entityName);
    if (!entityRow) continue;
    const entity_id = entityRow.id;
    const before = row['Unnamed: 4'] === true || row['execution_before'] === 1 ? 1 : 0;
    const ongoing = row['Unnamed: 5'] === true || row['execution_ongoing'] === 1 ? 1 : 0;
    const after = row['Unnamed: 6'] === true || row['execution_after'] === 1 ? 1 : 0;
    const execution_stage = before ? 'Before' : ongoing ? 'Ongoing' : after ? 'After' : 'Ongoing';
    const photoType = typeof row['31'] === 'number' ? row['31'] : null;
    const result = insertCheckpoint.run(entity_id, finalCheckpoint, to3CharCode(finalCheckpoint), evidenceType, execution_stage, before, ongoing, after, photoType);
    if (result.changes > 0) count++;
  }
  console.log('Seeded', count, 'checkpoints.');
}

const routesCount = db.prepare('SELECT COUNT(*) as c FROM routes').get();
const checkpointsCount = db.prepare('SELECT COUNT(*) as c FROM checkpoints').get();
db.close();
console.log('DB ready. routes:', routesCount.c, 'checkpoints:', checkpointsCount.c);
