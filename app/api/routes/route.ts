import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass, getSessionWithRole } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();
    if (session.role === 'Admin') {
      const rows = db.prepare('SELECT * FROM routes ORDER BY route_name').all();
      return NextResponse.json({ routes: rows });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (allowedKeys.size === 0) {
      return NextResponse.json({ routes: [] });
    }
    const routeIds = [...new Set([...allowedKeys].map((k) => k.split('::')[0]))];
    const placeholders = routeIds.map(() => '?').join(',');
    const result = query(
      `SELECT * FROM routes WHERE route_id IN (${placeholders}) ORDER BY route_name`,
      routeIds
    );
    return NextResponse.json({ routes: result.rows });
  } catch (error: unknown) {
    logError('Routes GET', error);
    return NextResponse.json({ routes: [], error: (error as Error).message }, { status: 200 });
  }
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
    const { route_id, route_name, length } = body;
    const rid = route_id == null ? '' : String(route_id).trim();
    if (!rid || !route_name?.trim()) {
      return NextResponse.json({ error: 'Route ID and route name are required' }, { status: 400 });
    }
    const db = getDb();
    const existing = db.prepare('SELECT route_id FROM routes WHERE route_id = ?').get(rid);
    if (existing) {
      db.prepare(
        'UPDATE routes SET route_name = ?, length = COALESCE(?, length), updated_at = CURRENT_TIMESTAMP WHERE route_id = ?'
      ).run(route_name.trim(), length != null ? Number(length) : null, rid);
    } else {
      db.prepare('INSERT INTO routes (route_id, route_name, length) VALUES (?, ?, ?)').run(
        rid,
        route_name.trim(),
        length != null ? Number(length) : null
      );
    }
    const row = db.prepare('SELECT * FROM routes WHERE route_id = ?').get(rid);
    return NextResponse.json({ route: row });
  } catch (error: unknown) {
    logError('Route POST', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
