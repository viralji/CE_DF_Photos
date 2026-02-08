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
      'SELECT id, name, code, display_order FROM entities ORDER BY display_order ASC, name ASC',
      []
    );
    return NextResponse.json({ entities: result.rows });
  } catch (error: unknown) {
    logError('Entities GET', error);
    return NextResponse.json({ entities: [], error: (error as Error).message }, { status: 500 });
  }
}

function normalizeCode(code: string | undefined, name: string): string {
  const raw = (code ?? to3CharCode(name)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
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
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const code = normalizeCode(body.code, name);
    const db = getDb();
    const existing = db.prepare('SELECT id FROM entities WHERE name = ? OR code = ?').get(name, code) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: 'Entity with this name or code already exists' }, { status: 400 });
    }
    const maxOrder = db.prepare('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM entities').get() as { next_order: number };
    db.prepare('INSERT INTO entities (name, code, display_order) VALUES (?, ?, ?)').run(name, code, maxOrder.next_order);
    const row = db.prepare('SELECT id, name, code, display_order FROM entities WHERE name = ?').get(name) as {
      id: number;
      name: string;
      code: string;
      display_order: number;
    };
    return NextResponse.json({ entity: row });
  } catch (error: unknown) {
    logError('Entity POST', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
