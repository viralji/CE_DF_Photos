import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query, getDb, buildAllowedKeysFilter } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();
    const routeId = request.nextUrl.searchParams.get('route_id');

    if (session.role === 'Admin') {
      let rows: unknown[];
      if (routeId) {
        rows = db.prepare('SELECT * FROM subsections WHERE route_id = ? ORDER BY route_id, subsection_id').all(routeId);
      } else {
        rows = db.prepare('SELECT * FROM subsections ORDER BY route_id, subsection_id').all();
      }
      return NextResponse.json({ subsections: rows });
    }

    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (allowedKeys.size === 0) {
      return NextResponse.json({ subsections: [] });
    }
    const keys = [...allowedKeys];
    const { whereClause, params } = buildAllowedKeysFilter(keys, '');
    const fullParams: unknown[] = [...params];
    let sql = `SELECT * FROM subsections WHERE ${whereClause}`;
    if (routeId) {
      sql += ' AND route_id = ?';
      fullParams.push(routeId);
    }
    sql += ' ORDER BY route_id, subsection_id';
    const result = query(sql, fullParams);
    return NextResponse.json({ subsections: result.rows });
  } catch (error: unknown) {
    logError('Subsections GET', error);
    return NextResponse.json({ subsections: [], error: (error as Error).message }, { status: 200 });
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
    const { route_id, subsection_id, subsection_name, length } = body;
    const rid = route_id == null ? '' : String(route_id).trim();
    const sid = subsection_id == null ? '' : String(subsection_id).trim();
    if (!rid || !sid || !subsection_name?.trim()) {
      return NextResponse.json(
        { error: 'route_id, subsection_id, and subsection_name are required' },
        { status: 400 }
      );
    }
    const db = getDb();
    const existing = db
      .prepare('SELECT route_id, subsection_id FROM subsections WHERE route_id = ? AND subsection_id = ?')
      .get(rid, sid);
    if (existing) {
      db.prepare(
        'UPDATE subsections SET subsection_name = ?, length = COALESCE(?, length), updated_at = CURRENT_TIMESTAMP WHERE route_id = ? AND subsection_id = ?'
      ).run(subsection_name.trim(), length != null ? Number(length) : null, rid, sid);
    } else {
      db.prepare(
        'INSERT INTO subsections (route_id, subsection_id, subsection_name, length) VALUES (?, ?, ?, ?)'
      ).run(rid, sid, subsection_name.trim(), length != null ? Number(length) : null);
    }
    const row = db
      .prepare('SELECT * FROM subsections WHERE route_id = ? AND subsection_id = ?')
      .get(rid, sid);
    return NextResponse.json({ subsection: row });
  } catch (error: unknown) {
    logError('Subsection POST', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
