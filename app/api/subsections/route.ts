import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const routeId = request.nextUrl.searchParams.get('route_id');
    let sql = 'SELECT * FROM subsections';
    const params: unknown[] = [];
    if (routeId) {
      sql += ' WHERE route_id = ?';
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
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
