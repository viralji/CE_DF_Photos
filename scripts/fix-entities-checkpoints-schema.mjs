/**
 * One-off: if checkpoints has no entity_id, drop checkpoints + entities, recreate from schema, then seed.
 * Run: node scripts/fix-entities-checkpoints-schema.mjs
 * Uses DATABASE_PATH or data/ce_df_photos.db.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const dbPath = process.env.DATABASE_PATH || process.env.DATABASE_URL || join(root, 'data', 'ce_df_photos.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(dbPath);

const cols = db.prepare('PRAGMA table_info(checkpoints)').all();
const hasEntityId = cols.some((c) => c.name === 'entity_id');
if (hasEntityId) {
  console.log('checkpoints already has entity_id. Run db:seed-entities-checkpoints to seed data.');
  db.close();
  process.exit(0);
}

console.log('checkpoints missing entity_id. Recreating entities and checkpoints tables...');
db.pragma('foreign_keys = OFF');

try {
  db.exec('DROP TABLE IF EXISTS checkpoints');
  db.exec('DROP TABLE IF EXISTS entities');
} catch (err) {
  console.error('Drop failed:', err.message);
  db.close();
  process.exit(1);
}

const schemaPath = join(root, 'scripts', 'create-schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');
const statements = schema
  .split(';')
  .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
  .filter((s) => s.length > 0);

const createEntities = statements.find((s) => s.includes('CREATE TABLE') && s.includes('entities'));
const createCheckpoints = statements.find((s) => s.includes('CREATE TABLE') && s.includes('checkpoints'));
if (createEntities) db.exec(createEntities + ';');
if (createCheckpoints) db.exec(createCheckpoints + ';');

db.exec('CREATE INDEX IF NOT EXISTS idx_checkpoints_entity_id ON checkpoints(entity_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_entities_display_order ON entities(display_order)');
db.pragma('foreign_keys = ON');
db.close();

console.log('Tables recreated. Running seed...');
const { execSync } = await import('node:child_process');
execSync('node scripts/run-create-entity-checkpoints.mjs', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_PATH: dbPath }
});
console.log('Done. Entities and checkpoints are loaded.');
