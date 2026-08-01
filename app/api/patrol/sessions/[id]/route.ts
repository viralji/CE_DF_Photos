import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const patrolSession = db.prepare(`
    SELECT ps.*, r.route_name, pa.photo_interval_meters
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    LEFT JOIN patrol_assignments pa ON ps.assignment_id = pa.id
    WHERE ps.id = ?
  `).get(id) as { patroller_email: string } | undefined;

  if (!patrolSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.role === 'Patroller' && (patrolSession as { patroller_email: string }).patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ session: patrolSession });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  const existing = db.prepare('SELECT * FROM patrol_sessions WHERE id = ?').get(id) as {
    patroller_email: string; status: string;
  } | undefined;

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.role === 'Patroller' && existing.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (existing.status !== 'active') {
    return NextResponse.json({ error: 'Session already ended' }, { status: 400 });
  }

  const newStatus = body.status === 'completed' ? 'completed' : 'abandoned';
  db.prepare(`
    UPDATE patrol_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(newStatus, id);

  const updated = db.prepare(`
    SELECT ps.*, r.route_name, pa.photo_interval_meters
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    LEFT JOIN patrol_assignments pa ON ps.assignment_id = pa.id
    WHERE ps.id = ?
  `).get(id);
  return NextResponse.json({ session: updated });
}
