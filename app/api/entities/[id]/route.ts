import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { to3CharCode } from '@/lib/photo-filename';

function normalizeCode(code: string | undefined, name: string): string {
  const raw = (code ?? to3CharCode(name)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
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
    const entityId = parseInt(id, 10);
    if (Number.isNaN(entityId)) {
      return NextResponse.json({ error: 'Invalid entity id' }, { status: 400 });
    }
    const body = await request.json();
    const db = getDb();
    const existing = db.prepare('SELECT id, name, code, display_order FROM entities WHERE id = ?').get(entityId) as
      | { id: number; name: string; code: string; display_order: number }
      | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : existing.name;
    const code =
      body.code !== undefined
        ? normalizeCode(typeof body.code === 'string' ? body.code : String(body.code), name)
        : existing.code;
    const display_order = typeof body.display_order === 'number' ? body.display_order : undefined;

    const nameConflict = db.prepare('SELECT id FROM entities WHERE (name = ? OR code = ?) AND id != ?').get(name, code, entityId) as
      | { id: number }
      | undefined;
    if (nameConflict) {
      return NextResponse.json({ error: 'Another entity already has this name or code' }, { status: 400 });
    }

    if (display_order !== undefined) {
      db.prepare('UPDATE entities SET name = ?, code = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        name,
        code,
        display_order,
        entityId
      );
    } else {
      db.prepare('UPDATE entities SET name = ?, code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, code, entityId);
    }
    const row = db.prepare('SELECT id, name, code, display_order FROM entities WHERE id = ?').get(entityId);
    return NextResponse.json({ entity: row });
  } catch (error: unknown) {
    logError('Entity PATCH', error);
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
    const entityId = parseInt(id, 10);
    if (Number.isNaN(entityId)) {
      return NextResponse.json({ error: 'Invalid entity id' }, { status: 400 });
    }
    const db = getDb();
    const checkpointRef = db.prepare('SELECT 1 FROM checkpoints WHERE entity_id = ? LIMIT 1').get(entityId) as { '1': number } | undefined;
    if (checkpointRef) {
      return NextResponse.json({ error: 'Cannot delete entity that has checkpoints. Remove or reassign checkpoints first.' }, { status: 400 });
    }
    db.prepare('DELETE FROM entities WHERE id = ?').run(entityId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError('Entity DELETE', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
