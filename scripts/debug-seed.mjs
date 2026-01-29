import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const jsonPath = join(root, 'checkpoints_data.json');
const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));

console.log('Total rows in JSON:', data.length);
console.log('\n=== First 12 rows (should be Trench block) ===');
data.slice(0, 12).forEach((row, idx) => {
  const entity = row['Unnamed: 0'];
  const checkpoint = row['Unnamed: 1'];
  console.log(`Row ${idx}: entity=[${entity}] checkpoint=[${checkpoint}]`);
});

console.log('\n=== Simulating seed logic ===');
let lastEntity = '';
const seen = new Set();
let willInsert = [];
for (let idx = 0; idx < data.length; idx++) {
  const row = data[idx];
  const entityCell = row['Unnamed: 0'];
  if (entityCell != null && String(entityCell).trim() !== '') {
    lastEntity = String(entityCell).trim();
  }
  const entity = lastEntity;
  let checkpoint = String(row['Unnamed: 1'] ?? '').trim();
  if (!entity || !checkpoint) {
    console.log(`Row ${idx}: SKIP (empty entity or checkpoint)`);
    continue;
  }
  if (entity === 'Entity' && checkpoint === 'Checkpoint') {
    console.log(`Row ${idx}: SKIP (header row)`);
    continue;
  }
  let key = `${entity}\t${checkpoint}`;
  let suffix = 0;
  while (seen.has(key)) {
    suffix++;
    key = `${entity}\t${checkpoint} (${suffix})`;
  }
  seen.add(key);
  const finalCheckpoint = suffix === 0 ? checkpoint : `${checkpoint} (${suffix})`;
  console.log(`Row ${idx}: INSERT entity=[${entity}] checkpoint=[${finalCheckpoint}]`);
  willInsert.push({ entity, checkpoint: finalCheckpoint });
}
console.log(`\n=== Total rows to insert: ${willInsert.length} ===`);
const trenchRows = willInsert.filter(r => r.entity === 'Trench');
console.log(`Trench checkpoints: ${trenchRows.length}`);
trenchRows.forEach(r => console.log(`  - ${r.checkpoint}`));
