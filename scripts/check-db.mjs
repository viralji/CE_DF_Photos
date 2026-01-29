import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'ce_df_photos.db');
const db = new Database(dbPath);

const allCheckpoints = db.prepare('SELECT id, entity, checkpoint_name FROM checkpoints ORDER BY entity, checkpoint_name').all();
console.log('=== Total checkpoints in DB:', allCheckpoints.length, '===\n');

const byEntity = {};
allCheckpoints.forEach(c => {
  if (!byEntity[c.entity]) byEntity[c.entity] = [];
  byEntity[c.entity].push(c.checkpoint_name);
});

Object.keys(byEntity).sort().forEach(entity => {
  console.log(`${entity} (${byEntity[entity].length} checkpoints):`);
  byEntity[entity].forEach((name, idx) => {
    console.log(`  ${idx + 1}. ${name}`);
  });
  console.log('');
});

db.close();
