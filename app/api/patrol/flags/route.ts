import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const routeId = url.searchParams.get('route_id');
  const limitParam = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { conditions.push('pf.status = ?'); params.push(status); }
  if (routeId) { conditions.push('pf.route_id = ?'); params.push(routeId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const db = getDb();
  const flags = db.prepare(`
    SELECT pf.*, r.route_name, u.name AS patroller_name
    FROM patrol_flags pf
    LEFT JOIN routes r ON pf.route_id = r.route_id
    LEFT JOIN users u ON pf.patroller_email = u.email
    ${where}
    ORDER BY pf.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitParam, offset);

  return NextResponse.json({ flags });
}
