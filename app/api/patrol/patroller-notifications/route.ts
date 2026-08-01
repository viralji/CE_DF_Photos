import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const notifications = db.prepare(`
    SELECT pn.*, pf.severity, pf.description, pf.route_id, pf.latitude, pf.longitude,
           r.route_name
    FROM patroller_notifications pn
    JOIN patrol_flags pf ON pn.flag_id = pf.id
    LEFT JOIN routes r ON pf.route_id = r.route_id
    WHERE pn.patroller_email = ?
    ORDER BY pn.created_at DESC
    LIMIT 50
  `).all(session.user.email);

  const unread_count = (notifications as { is_read: number }[]).filter((n) => !n.is_read).length;
  return NextResponse.json({ notifications, unread_count });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const db = getDb();

  if (body.all) {
    db.prepare('UPDATE patroller_notifications SET is_read = 1 WHERE patroller_email = ?').run(session.user.email);
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    const placeholders = body.ids.map(() => '?').join(',');
    db.prepare(`UPDATE patroller_notifications SET is_read = 1 WHERE id IN (${placeholders}) AND patroller_email = ?`).run(...body.ids, session.user.email);
  }

  return NextResponse.json({ ok: true });
}
