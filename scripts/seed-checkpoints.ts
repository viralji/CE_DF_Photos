import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../lib/db';

const db = getDb();
const jsonPath = path.join(process.cwd(), 'checkpoints_data.json');
if (!fs.existsSync(jsonPath)) {
  console.log('checkpoints_data.json not found. Skipping seed.');
  process.exit(0);
}
// Remove header row if it was ever inserted (entity='Entity', checkpoint_name='Checkpoint')
db.prepare("DELETE FROM checkpoints WHERE entity = 'Entity' AND checkpoint_name = 'Checkpoint'").run();
const raw = fs.readFileSync(jsonPath, 'utf-8');
const rows = JSON.parse(raw) as Record<string, unknown>[];
const stmt = db.prepare(
  'INSERT OR IGNORE INTO checkpoints (entity, checkpoint_name, evidence_type, execution_before, execution_ongoing, execution_after, photo_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
let count = 0;
let lastEntity = '';
const seenKey = (e: string, c: string) => `${e}\t${c}`;
const seen = new Set<string>();
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
  // Ensure unique (entity, checkpoint_name): Excel often repeats names (e.g. two "Trench Depth")
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
console.log(`Seeded ${count} checkpoints.`);
