import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { to3CharCode } from '@/lib/photo-filename';

function normalizeCheckpointCode(code: string | undefined, checkpointName: string): string {
  const raw = (code ?? to3CharCode(checkpointName)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return raw.length >= 3 ? raw : (raw + 'XXX').slice(0, 3);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const checkpointId = parseInt(id, 10);
    if (Number.isNaN(checkpointId)) {
      return NextResponse.json({ error: 'Invalid checkpoint id' }, { status: 400 });
    }
    const body = await request.json();
    const db = getDb();
    const existing = db.prepare('SELECT id, entity_id, checkpoint_name, code, display_order, execution_stage FROM checkpoints WHERE id = ?').get(checkpointId) as
      | { id: number; entity_id: number; checkpoint_name: string; code: string | null; display_order: number; execution_stage: string | null }
      | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
    }

    const entity_id = body.entity_id != null ? parseInt(String(body.entity_id), 10) : existing.entity_id;
    const checkpoint_name = typeof body.checkpoint_name === 'string' ? body.checkpoint_name.trim() : existing.checkpoint_name;
    const code = body.code !== undefined ? normalizeCheckpointCode(typeof body.code === 'string' ? body.code : String(body.code), checkpoint_name) : (existing.code ?? to3CharCode(existing.checkpoint_name));
    const display_order = typeof body.display_order === 'number' ? body.display_order : undefined;
    const rawStage = typeof body.execution_stage === 'string' ? body.execution_stage.trim() : '';
    const execution_stage = rawStage === 'Before' || rawStage === 'Ongoing' || rawStage === 'After' ? rawStage : (existing.execution_stage === 'Before' || existing.execution_stage === 'Ongoing' || existing.execution_stage === 'After' ? existing.execution_stage : 'Ongoing');

    if (entity_id !== existing.entity_id || checkpoint_name !== existing.checkpoint_name) {
      const entityExists = db.prepare('SELECT id FROM entities WHERE id = ?').get(entity_id);
      if (!entityExists) {
        return NextResponse.json({ error: 'Entity not found' }, { status: 400 });
      }
      const conflict = db.prepare('SELECT id FROM checkpoints WHERE entity_id = ? AND checkpoint_name = ? AND id != ?').get(
        entity_id,
        checkpoint_name,
        checkpointId
      );
      if (conflict) {
        return NextResponse.json({ error: 'Another checkpoint with this name already exists for this entity' }, { status: 400 });
      }
    }
    const duplicateCode = db.prepare('SELECT id FROM checkpoints WHERE entity_id = ? AND UPPER(TRIM(code)) = ? AND id != ?').get(
      entity_id,
      code.toUpperCase(),
      checkpointId
    ) as { id: number } | undefined;
    if (duplicateCode) {
      return NextResponse.json({ error: 'Code already in use for this entity' }, { status: 400 });
    }

    const runUpdate = (sql: string, ...args: (string | number)[]) => db.prepare(sql).run(...args);
    try {
      if (display_order !== undefined) {
        runUpdate(
          'UPDATE checkpoints SET entity_id = ?, checkpoint_name = ?, code = ?, display_order = ?, execution_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          entity_id,
          checkpoint_name,
          code,
          display_order,
          execution_stage,
          checkpointId
        );
      } else {
        runUpdate(
          'UPDATE checkpoints SET entity_id = ?, checkpoint_name = ?, code = ?, execution_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          entity_id,
          checkpoint_name,
          code,
          execution_stage,
          checkpointId
        );
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('no such column: execution_stage')) {
        runUpdate(
          'UPDATE checkpoints SET entity_id = ?, checkpoint_name = ?, code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          entity_id,
          checkpoint_name,
          code,
          checkpointId
        );
        if (display_order !== undefined) {
          runUpdate('UPDATE checkpoints SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', display_order, checkpointId);
        }
      } else throw e;
    }
    const row = db.prepare('SELECT c.*, e.name AS entity, e.name AS entity_name, e.code AS entity_code FROM checkpoints c LEFT JOIN entities e ON c.entity_id = e.id WHERE c.id = ?').get(checkpointId);
    return NextResponse.json({ checkpoint: row });
  } catch (error: unknown) {
    logError('Checkpoint PATCH', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const checkpointId = parseInt(id, 10);
    if (Number.isNaN(checkpointId)) {
      return NextResponse.json({ error: 'Invalid checkpoint id' }, { status: 400 });
    }
    const db = getDb();
    const photoRef = db.prepare('SELECT 1 FROM photo_submissions WHERE checkpoint_id = ? LIMIT 1').get(checkpointId) as { '1': number } | undefined;
    if (photoRef) {
      return NextResponse.json(
        { error: 'Cannot delete checkpoint that has photo submissions. Remove or reassign photos first.' },
        { status: 400 }
      );
    }
    db.prepare('DELETE FROM checkpoints WHERE id = ?').run(checkpointId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError('Checkpoint DELETE', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
