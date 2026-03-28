import { readFileSync } from 'fs';
// Load .env before dynamic imports so S3/Gemini clients pick up credentials
try {
  readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, ''); if (k && !process.env[k]) process.env[k] = v; }
  });
} catch { /* no .env */ }

// Dynamic imports AFTER env is loaded (static imports are hoisted and would miss the env vars above)
const { scorePhoto } = await import('../lib/ai-scoring');
const { getDb } = await import('../lib/db');

const db = getDb();

// Find all photo submissions that have no score yet (or previously errored)
const unscored = db.prepare(`
  SELECT ps.id
  FROM photo_submissions ps
  LEFT JOIN photo_ai_scores s ON s.photo_submission_id = ps.id
  WHERE s.photo_submission_id IS NULL
     OR s.status = 'error'
  ORDER BY ps.id
`).all() as { id: number }[];

if (unscored.length === 0) {
  console.log('All photos already scored.');
  process.exit(0);
}

console.log(`Found ${unscored.length} unscored/errored photos. Starting...`);

let done = 0;
for (const { id } of unscored) {
  db.prepare('INSERT OR REPLACE INTO photo_ai_scores (photo_submission_id, status) VALUES (?, ?)').run(id, 'pending');
  try {
    await scorePhoto(id);
    const row = db.prepare('SELECT score, status FROM photo_ai_scores WHERE photo_submission_id = ?').get(id) as { score: number; status: string } | undefined;
    done++;
    console.log(`[${done}/${unscored.length}] Photo ${id}: ${row?.status} — score=${row?.score}`);
  } catch (err) {
    console.error(`[${done}/${unscored.length}] Photo ${id}: FAILED —`, err);
  }
}
console.log(`Done. ${done}/${unscored.length} processed.`);
