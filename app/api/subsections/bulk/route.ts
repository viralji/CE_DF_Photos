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
    const subsections = Array.isArray(body.subsections) ? body.subsections : [];
    if (subsections.length === 0) {
      return NextResponse.json({ error: 'subsections array is required and must not be empty' }, { status: 400 });
    }
    const db = getDb();
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO subsections (route_id, subsection_id, subsection_name) VALUES (?, ?, ?)'
    );
    let inserted = 0;
    const errors: string[] = [];
    for (const row of subsections) {
      const route_id = row.route_id == null ? '' : String(row.route_id).trim();
      const subsection_id = row.subsection_id == null ? '' : String(row.subsection_id).trim();
      const subsection_name = row.subsection_name?.trim();
      if (!route_id || !subsection_id || !subsection_name) {
        errors.push(`Invalid row: route_id, subsection_id, subsection_name required (got ${JSON.stringify(row)})`);
        continue;
      }
      const result = stmt.run(route_id, subsection_id, subsection_name);
      if (result.changes > 0) inserted++;
    }
    return NextResponse.json({
      inserted,
      total: subsections.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error('Error bulk creating subsections:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
