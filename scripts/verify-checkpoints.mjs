import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dbPath = join(process.cwd(), 'data', 'ce_df_photos.db');
const db = new Database(dbPath);

console.log('=== CURRENT DATABASE CHECKPOINTS ===');
const all = db.prepare('SELECT id, entity, checkpoint_name FROM checkpoints ORDER BY entity, checkpoint_name').all();
console.log('Total checkpoints:', all.length, '\n');

const byEntity = {};
all.forEach(c => {
  if (!byEntity[c.entity]) byEntity[c.entity] = [];
  byEntity[c.entity].push(c.checkpoint_name);
});

Object.keys(byEntity).sort().forEach(entity => {
  console.log(`${entity}: ${byEntity[entity].length} checkpoint(s)`);
  byEntity[entity].forEach((name, idx) => console.log(`  ${idx + 1}. ${name}`));
  console.log('');
});

db.close();
