import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const assignment = db.prepare('SELECT pa.*, r.route_name FROM patrol_assignments pa LEFT JOIN routes r ON pa.route_id = r.route_id WHERE pa.id = ?').get(id);
  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ assignment });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  const existing = db.prepare('SELECT id FROM patrol_assignments WHERE id = ?').get(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.photo_interval_meters != null) {
    updates.push('photo_interval_meters = ?');
    values.push(Math.max(50, parseInt(String(body.photo_interval_meters), 10) || 500));
  }
  if (body.is_active != null) {
    updates.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
  }
  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  values.push(id);
  db.prepare(`UPDATE patrol_assignments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const assignment = db.prepare('SELECT pa.*, r.route_name FROM patrol_assignments pa LEFT JOIN routes r ON pa.route_id = r.route_id WHERE pa.id = ?').get(id);
  return NextResponse.json({ assignment });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  db.prepare('UPDATE patrol_assignments SET is_active = 0 WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
