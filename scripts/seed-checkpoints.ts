import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../lib/db';

const db = getDb();
const jsonPath = path.join(process.cwd(), 'checkpoints_data.json');
if (!fs.existsSync(jsonPath)) {
  console.log('checkpoints_data.json not found. Skipping seed.');
  process.exit(0);
}
const raw = fs.readFileSync(jsonPath, 'utf-8');
const rows = JSON.parse(raw) as Record<string, unknown>[];
const stmt = db.prepare(
  'INSERT OR IGNORE INTO checkpoints (entity, checkpoint_name, evidence_type, execution_before, execution_ongoing, execution_after, photo_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
let count = 0;
for (const row of rows) {
  const entity = String(row['Unnamed: 0'] ?? row['Entity'] ?? '');
  const checkpoint = String(row['Unnamed: 1'] ?? row['Checkpoint'] ?? '');
  const evidenceType = String(row['Unnamed: 2'] ?? row['Attached Evidence Type'] ?? 'Photo');
  if (!entity || !checkpoint) continue;
  const before = row['Unnamed: 4'] === true || row['execution_before'] === 1 ? 1 : 0;
  const ongoing = row['Unnamed: 5'] === true || row['execution_ongoing'] === 1 ? 1 : 0;
  const after = row['Unnamed: 6'] === true || row['execution_after'] === 1 ? 1 : 0;
  const photoType = typeof row['31'] === 'number' ? row['31'] : null;
  stmt.run(entity, checkpoint, evidenceType, before, ongoing, after, photoType);
  count++;
}
console.log(`Seeded ${count} checkpoints.`);
