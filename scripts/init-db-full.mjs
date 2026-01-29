/**
 * Initialize DB: schema + seed checkpoints. Run: node scripts/init-db-full.mjs
 * Use when tsx is unavailable (e.g. sandbox). Same effect as db:setup + seed:checkpoints.
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

const jsonPath = join(root, 'checkpoints_data.json');
if (existsSync(jsonPath)) {
  db.prepare("DELETE FROM checkpoints WHERE entity = 'Entity' AND checkpoint_name = 'Checkpoint'").run();
  const rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO checkpoints (entity, checkpoint_name, evidence_type, execution_before, execution_ongoing, execution_after, photo_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
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
    const entity = lastEntity;
    let checkpoint = String(row['Unnamed: 1'] ?? row['Checkpoint'] ?? '').trim();
    const evidenceType = String(row['Unnamed: 2'] ?? row['Attached Evidence Type'] ?? 'Photo');
    if (!entity || !checkpoint) continue;
    if (entity === 'Entity' && checkpoint === 'Checkpoint') continue;
    let key = seenKey(entity, checkpoint);
    let suffix = 0;
    while (seen.has(key)) {
      suffix++;
      key = seenKey(entity, `${checkpoint} (${suffix})`);
    }
    seen.add(key);
    const finalCheckpoint = suffix === 0 ? checkpoint : `${checkpoint} (${suffix})`;
    const before = row['Unnamed: 4'] === true || row['execution_before'] === 1 ? 1 : 0;
    const ongoing = row['Unnamed: 5'] === true || row['execution_ongoing'] === 1 ? 1 : 0;
    const after = row['Unnamed: 6'] === true || row['execution_after'] === 1 ? 1 : 0;
    const photoType = typeof row['31'] === 'number' ? row['31'] : null;
    stmt.run(entity, finalCheckpoint, evidenceType, before, ongoing, after, photoType);
    count++;
  }
  console.log('Seeded', count, 'checkpoints.');
}

const routesCount = db.prepare('SELECT COUNT(*) as c FROM routes').get();
const checkpointsCount = db.prepare('SELECT COUNT(*) as c FROM checkpoints').get();
db.close();
console.log('DB ready. routes:', routesCount.c, 'checkpoints:', checkpointsCount.c);
