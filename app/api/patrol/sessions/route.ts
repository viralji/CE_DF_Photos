import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const url = new URL(request.url);
  const routeId = url.searchParams.get('route_id');
  const status = url.searchParams.get('status');
  const limitParam = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (session.role === 'Patroller') {
    conditions.push('ps.patroller_email = ?');
    params.push(session.user.email);
  }
  if (routeId) { conditions.push('ps.route_id = ?'); params.push(routeId); }
  if (status) { conditions.push('ps.status = ?'); params.push(status); }

  const date = url.searchParams.get('date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    conditions.push("date(ps.started_at) = ?");
    params.push(date);
  }
  const filterEmail = url.searchParams.get('patroller_email');
  if (filterEmail && session.role === 'Admin') {
    conditions.push('ps.patroller_email = ?');
    params.push(filterEmail);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sessions = db.prepare(`
    SELECT ps.*, ps.id AS session_id, r.route_name, pa.photo_interval_meters, u.name AS patroller_name
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    LEFT JOIN patrol_assignments pa ON ps.assignment_id = pa.id
    LEFT JOIN users u ON ps.patroller_email = u.email
    ${where}
    ORDER BY ps.started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitParam, offset);

  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Patroller' && session.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { assignment_id } = body;
  if (!assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 });

  const db = getDb();
  const assignment = db.prepare('SELECT * FROM patrol_assignments WHERE id = ? AND is_active = 1').get(assignment_id) as {
    id: number; route_id: string; patroller_email: string;
  } | undefined;

  if (!assignment) return NextResponse.json({ error: 'Assignment not found or inactive' }, { status: 404 });
  if (session.role === 'Patroller' && assignment.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Abandon any currently active session for this patroller on this route
  db.prepare(`
    UPDATE patrol_sessions SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP
    WHERE patroller_email = ? AND route_id = ? AND status = 'active'
  `).run(assignment.patroller_email, assignment.route_id);

  const result = db.prepare(`
    INSERT INTO patrol_sessions (assignment_id, patroller_email, route_id)
    VALUES (?, ?, ?)
  `).run(assignment_id, assignment.patroller_email, assignment.route_id);

  const patrolSession = db.prepare(`
    SELECT ps.*, r.route_name, pa.photo_interval_meters
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    LEFT JOIN patrol_assignments pa ON ps.assignment_id = pa.id
    WHERE ps.id = ?
  `).get(result.lastInsertRowid);

  return NextResponse.json({ session: patrolSession }, { status: 201 });
}
