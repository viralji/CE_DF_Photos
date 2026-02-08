import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { to3CharCode } from '@/lib/photo-filename';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();
    const jsonPath = path.join(process.cwd(), 'checkpoints_data.json');
    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ error: 'checkpoints_data.json not found' }, { status: 404 });
    }

    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const rows = JSON.parse(raw) as Record<string, unknown>[];
    const seenKey = (e: string, c: string) => `${e}\t${c}`;
    const seen = new Set<string>();
    let lastEntity = '';
    let count = 0;

    const insertEntity = db.prepare('INSERT OR IGNORE INTO entities (name, code, display_order) VALUES (?, ?, 0)');
    const getEntityId = db.prepare('SELECT id FROM entities WHERE name = ?');
    const maxEntityOrder = db.prepare('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM entities');
    const insertCheckpoint = db.prepare(
      `INSERT OR IGNORE INTO checkpoints (entity_id, checkpoint_name, code, display_order, evidence_type, execution_stage, execution_before, execution_ongoing, execution_after, photo_type)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    );

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

      const entityCode = to3CharCode(entityName);
      insertEntity.run(entityName, entityCode);
      const entityRow = getEntityId.get(entityName) as { id: number } | undefined;
      if (!entityRow) continue;
      const entity_id = entityRow.id;

      const before = row['Unnamed: 4'] === true || row['execution_before'] === 1 ? 1 : 0;
      const ongoing = row['Unnamed: 5'] === true || row['execution_ongoing'] === 1 ? 1 : 0;
      const after = row['Unnamed: 6'] === true || row['execution_after'] === 1 ? 1 : 0;
      const execution_stage = before ? 'Before' : ongoing ? 'Ongoing' : after ? 'After' : 'Ongoing';
      const photoType = typeof row['31'] === 'number' ? row['31'] : null;
      const code = to3CharCode(finalCheckpoint);

      const result = insertCheckpoint.run(entity_id, finalCheckpoint, code, evidenceType, execution_stage, before, ongoing, after, photoType);
      if (result.changes > 0) count++;
    }

    const total = db.prepare('SELECT COUNT(*) as c FROM checkpoints').get() as { c: number };
    return NextResponse.json({ inserted: count, total: total.c });
  } catch (error: unknown) {
    logError('Checkpoints seed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
