import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = query('SELECT * FROM routes ORDER BY route_name', []);
    return NextResponse.json({ routes: result.rows });
  } catch (error: unknown) {
    console.error('Error fetching routes:', error);
    return NextResponse.json({ routes: [], error: (error as Error).message }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { route_id, route_name } = body;
    const rid = route_id == null ? '' : String(route_id).trim();
    if (!rid || !route_name?.trim()) {
      return NextResponse.json({ error: 'Route ID and route name are required' }, { status: 400 });
    }
    const db = getDb();
    const stmt = db.prepare('INSERT INTO routes (route_id, route_name) VALUES (?, ?)');
    stmt.run(rid, route_name.trim());
    const insertedRow = db.prepare('SELECT * FROM routes WHERE route_id = ?').get(rid);
    return NextResponse.json({ route: insertedRow });
  } catch (error: unknown) {
    console.error('Error creating route:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
