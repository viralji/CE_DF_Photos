import { readFileSync } from 'fs';
// Load .env before anything else
try {
  readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
  });
} catch { /* no .env */ }
import { scorePhoto } from '../lib/ai-scoring';
import { getDb } from '../lib/db';

const ids = process.argv.slice(2).map(Number).filter(Boolean);
if (ids.length === 0) {
  console.error('Usage: tsx scripts/rescore-photos.ts <photoId> [photoId2] ...');
  process.exit(1);
}

const db = getDb();

async function run() {
  for (const id of ids) {
    db.prepare('INSERT OR REPLACE INTO photo_ai_scores (photo_submission_id, status) VALUES (?, ?)').run(id, 'pending');
    console.log(`Scoring photo ${id}...`);
    await scorePhoto(id);
    const row = db.prepare('SELECT score, confidence, status, summary FROM photo_ai_scores WHERE photo_submission_id = ?').get(id) as { score: number; confidence: string; status: string; summary: string } | undefined;
    console.log(`Photo ${id}: ${row?.status} — score=${row?.score} — ${row?.summary}`);
  }
}

run().catch(console.error);
