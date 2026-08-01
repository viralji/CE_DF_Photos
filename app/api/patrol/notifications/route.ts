import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  const db = getDb();
  const conditions = ['mn.manager_email = ?'];
  const params: unknown[] = [session.user.email];
  if (unreadOnly) { conditions.push('mn.is_read = 0'); }

  const notifications = db.prepare(`
    SELECT
      mn.id, mn.flag_id, mn.is_read, mn.created_at,
      pf.severity, pf.description, pf.status AS flag_status,
      pf.latitude, pf.longitude, pf.s3_url AS flag_photo_url,
      pf.patroller_email,
      u.name AS patroller_name,
      r.route_name,
      ps.id AS session_id
    FROM manager_notifications mn
    JOIN patrol_flags pf ON mn.flag_id = pf.id
    LEFT JOIN patrol_sessions ps ON pf.session_id = ps.id
    LEFT JOIN routes r ON pf.route_id = r.route_id
    LEFT JOIN users u ON pf.patroller_email = u.email
    WHERE ${conditions.join(' AND ')}
    ORDER BY mn.created_at DESC
    LIMIT ?
  `).all(...params, limit);

  const unreadCount = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM manager_notifications WHERE manager_email = ? AND is_read = 0"
  ).get(session.user.email) as { cnt: number }).cnt;

  return NextResponse.json({ notifications, unread_count: unreadCount });
}
