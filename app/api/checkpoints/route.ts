import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass, getSessionWithRole } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { to3CharCode } from '@/lib/photo-filename';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = query(
      `SELECT c.*, e.name AS entity, e.name AS entity_name, e.code AS entity_code
       FROM checkpoints c
       LEFT JOIN entities e ON c.entity_id = e.id
       ORDER BY e.display_order ASC, e.name ASC, c.display_order ASC, c.checkpoint_name ASC`,
      []
    );
    return NextResponse.json({ checkpoints: result.rows });
  } catch (error: unknown) {
    logError('Checkpoints GET', error);
    return NextResponse.json({ checkpoints: [], error: (error as Error).message }, { status: 500 });
  }
}

function normalizeCheckpointCode(code: string | undefined, checkpointName: string): string {
  const raw = (code ?? to3CharCode(checkpointName)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return raw.length >= 3 ? raw : (raw + 'XXX').slice(0, 3);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const entity_id = body.entity_id != null ? parseInt(String(body.entity_id), 10) : NaN;
    const checkpoint_name = typeof body.checkpoint_name === 'string' ? body.checkpoint_name.trim() : '';
    if (Number.isNaN(entity_id) || !checkpoint_name) {
      return NextResponse.json({ error: 'entity_id and checkpoint_name are required' }, { status: 400 });
    }
    const db = getDb();
    const entityExists = db.prepare('SELECT id FROM entities WHERE id = ?').get(entity_id);
    if (!entityExists) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 400 });
    }
    const existing = db.prepare('SELECT id FROM checkpoints WHERE entity_id = ? AND checkpoint_name = ?').get(entity_id, checkpoint_name) as
      | { id: number }
      | undefined;
    if (existing) {
      return NextResponse.json({ error: 'Checkpoint with this name already exists for this entity' }, { status: 400 });
    }
    const code = normalizeCheckpointCode(body.code, checkpoint_name);
    const duplicateCode = db.prepare('SELECT id FROM checkpoints WHERE entity_id = ? AND UPPER(TRIM(code)) = ?').get(entity_id, code.toUpperCase()) as
      | { id: number }
      | undefined;
    if (duplicateCode) {
      return NextResponse.json({ error: 'Code already in use for this entity' }, { status: 400 });
    }
    const display_order = typeof body.display_order === 'number' ? body.display_order : (db.prepare('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM checkpoints WHERE entity_id = ?').get(entity_id) as { next_order: number })?.next_order ?? 0;
    const evidence_type = typeof body.evidence_type === 'string' ? body.evidence_type : 'Photo';
    const rawStage = typeof body.execution_stage === 'string' ? body.execution_stage.trim() : '';
    const execution_stage = rawStage === 'Before' || rawStage === 'Ongoing' || rawStage === 'After' ? rawStage : 'Ongoing';
    const execution_before = execution_stage === 'Before' ? 1 : 0;
    const execution_ongoing = execution_stage === 'Ongoing' ? 1 : 0;
    const execution_after = execution_stage === 'After' ? 1 : 0;
    const photo_type = body.photo_type != null ? parseInt(String(body.photo_type), 10) : null;

    const insertResult = db
      .prepare(
        `INSERT INTO checkpoints (entity_id, checkpoint_name, code, display_order, evidence_type, execution_stage, execution_before, execution_ongoing, execution_after, photo_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(entity_id, checkpoint_name, code, display_order, evidence_type, execution_stage, execution_before, execution_ongoing, execution_after, photo_type);
    const newId = Number(insertResult.lastInsertRowid);
    const row = db.prepare('SELECT c.*, e.name AS entity, e.name AS entity_name, e.code AS entity_code FROM checkpoints c LEFT JOIN entities e ON c.entity_id = e.id WHERE c.id = ?').get(newId) as Record<string, unknown>;
    return NextResponse.json({ checkpoint: row });
  } catch (error: unknown) {
    logError('Checkpoint POST', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
