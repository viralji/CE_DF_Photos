import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const patrollerEmail = url.searchParams.get('patroller_email');
  const sessionId = url.searchParams.get('session_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), 1000);

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    conditions.push("date(pp.created_at) = ?");
    params.push(date);
  }
  if (patrollerEmail) {
    conditions.push('pp.patroller_email = ?');
    params.push(patrollerEmail);
  }
  if (sessionId) {
    conditions.push('pp.session_id = ?');
    params.push(sessionId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const photos = db.prepare(`
    SELECT
      pp.id, pp.session_id, pp.patroller_email, pp.s3_url,
      pp.latitude, pp.longitude, pp.accuracy,
      pp.distance_from_last_photo, pp.cumulative_distance, pp.created_at,
      ps.route_id,
      r.route_name,
      u.name AS patroller_name
    FROM patrol_photos pp
    LEFT JOIN patrol_sessions ps ON pp.session_id = ps.id
    LEFT JOIN routes r ON ps.route_id = r.route_id
    LEFT JOIN users u ON pp.patroller_email = u.email
    ${where}
    ORDER BY pp.created_at ASC
    LIMIT ?
  `).all(...params, limit);

  return NextResponse.json({ photos });
}
