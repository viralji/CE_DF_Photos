import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const { role, user } = session;

  if (role === 'Admin') {
    const assignments = db.prepare(`
      SELECT pa.*, r.route_name
      FROM patrol_assignments pa
      LEFT JOIN routes r ON pa.route_id = r.route_id
      ORDER BY pa.assigned_at DESC
    `).all();
    return NextResponse.json({ assignments });
  }

  if (role === 'Patroller') {
    const assignments = db.prepare(`
      SELECT pa.*, r.route_name
      FROM patrol_assignments pa
      LEFT JOIN routes r ON pa.route_id = r.route_id
      WHERE pa.patroller_email = ? AND pa.is_active = 1
      ORDER BY pa.assigned_at DESC
    `).all(user.email);
    return NextResponse.json({ assignments });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { route_id, patroller_email, photo_interval_meters } = body;

  if (!route_id || !patroller_email) {
    return NextResponse.json({ error: 'route_id and patroller_email required' }, { status: 400 });
  }

  const interval = Math.max(50, parseInt(String(photo_interval_meters ?? 500), 10) || 500);
  const db = getDb();

  const route = db.prepare('SELECT route_name FROM routes WHERE route_id = ?').get(route_id);
  if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

  const user = db.prepare('SELECT email FROM users WHERE email = ?').get(patroller_email.toLowerCase().trim());
  if (!user) return NextResponse.json({ error: 'User not found — make sure patroller has logged in at least once' }, { status: 404 });

  try {
    const result = db.prepare(`
      INSERT INTO patrol_assignments (route_id, patroller_email, photo_interval_meters, assigned_by_email)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(route_id, patroller_email) DO UPDATE SET
        photo_interval_meters = excluded.photo_interval_meters,
        is_active = 1,
        assigned_by_email = excluded.assigned_by_email,
        assigned_at = CURRENT_TIMESTAMP
    `).run(route_id, patroller_email.toLowerCase().trim(), interval, session.user.email);

    const assignment = db.prepare('SELECT pa.*, r.route_name FROM patrol_assignments pa LEFT JOIN routes r ON pa.route_id = r.route_id WHERE pa.id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
