import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (allowedKeys.size === 0) {
      return NextResponse.json({ subsections: [] });
    }
    const routeId = request.nextUrl.searchParams.get('route_id');
    const keys = [...allowedKeys];
    const conditions = keys.map(() => '(route_id = ? AND subsection_id = ?)').join(' OR ');
    const params: unknown[] = keys.flatMap((k) => {
      const [r, s] = k.split('::');
      return [r, s];
    });
    let sql = `SELECT * FROM subsections WHERE (${conditions})`;
    if (routeId) {
      sql += ' AND route_id = ?';
      params.push(routeId);
    }
    sql += ' ORDER BY route_id, subsection_id';
    const result = query(sql, params);
    return NextResponse.json({ subsections: result.rows });
  } catch (error: unknown) {
    console.error('Error fetching subsections:', error);
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
    const { route_id, subsection_id, subsection_name } = body;
    const rid = route_id == null ? '' : String(route_id).trim();
    const sid = subsection_id == null ? '' : String(subsection_id).trim();
    if (!rid || !sid || !subsection_name?.trim()) {
      return NextResponse.json(
        { error: 'route_id, subsection_id, and subsection_name are required' },
        { status: 400 }
      );
    }
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO subsections (route_id, subsection_id, subsection_name) VALUES (?, ?, ?)'
    );
    stmt.run(rid, sid, subsection_name.trim());
    const insertedRow = db
      .prepare('SELECT * FROM subsections WHERE route_id = ? AND subsection_id = ?')
      .get(rid, sid);
    return NextResponse.json({ subsection: insertedRow });
  } catch (error: unknown) {
    console.error('Error creating subsection:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
