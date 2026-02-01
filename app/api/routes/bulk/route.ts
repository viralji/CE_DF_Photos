import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

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
    const routes = Array.isArray(body.routes) ? body.routes : [];
    if (routes.length === 0) {
      return NextResponse.json({ error: 'routes array is required and must not be empty' }, { status: 400 });
    }
    const db = getDb();
    const stmt = db.prepare('INSERT OR IGNORE INTO routes (route_id, route_name) VALUES (?, ?)');
    let inserted = 0;
    const errors: string[] = [];
    for (const row of routes) {
      const route_id = row.route_id == null ? '' : String(row.route_id).trim();
      const route_name = row.route_name?.trim();
      if (!route_id || !route_name) {
        errors.push(`Invalid row: route_id and route_name required (got ${JSON.stringify(row)})`);
        continue;
      }
      const result = stmt.run(route_id, route_name);
      if (result.changes > 0) inserted++;
    }
    return NextResponse.json({
      inserted,
      total: routes.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error('Error bulk creating routes:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
