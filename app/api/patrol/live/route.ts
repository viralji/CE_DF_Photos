import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const routeId = url.searchParams.get('route_id');

  const db = getDb();
  const conditions = ["ps.status = 'active'"];
  const params: unknown[] = [];
  if (routeId) { conditions.push('ps.route_id = ?'); params.push(routeId); }

  // Active sessions with their latest ping
  const activeSessions = db.prepare(`
    SELECT
      ps.id AS session_id,
      ps.patroller_email,
      ps.route_id,
      r.route_name,
      ps.started_at,
      ps.total_distance_meters,
      ps.photo_count,
      ps.flag_count,
      u.name AS patroller_name,
      lp.latitude,
      lp.longitude,
      lp.accuracy,
      lp.recorded_at AS last_ping_at
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    LEFT JOIN users u ON ps.patroller_email = u.email
    LEFT JOIN patrol_location_pings lp ON lp.id = (
      SELECT id FROM patrol_location_pings WHERE session_id = ps.id ORDER BY id DESC LIMIT 1
    )
    WHERE ${conditions.join(' AND ')}
    ORDER BY ps.started_at DESC
  `).all(...params);

  return NextResponse.json({ active_sessions: activeSessions });
}
