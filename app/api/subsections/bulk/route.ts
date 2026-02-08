import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';

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
    const insertStmt = db.prepare(
      'INSERT INTO subsections (route_id, subsection_id, subsection_name, length) VALUES (?, ?, ?, ?)'
    );
    const updateStmt = db.prepare(
      'UPDATE subsections SET subsection_name = ?, length = COALESCE(?, length), updated_at = CURRENT_TIMESTAMP WHERE route_id = ? AND subsection_id = ?'
    );
    const existsStmt = db.prepare(
      'SELECT 1 FROM subsections WHERE route_id = ? AND subsection_id = ?'
    );
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const row of subsections) {
      const route_id = row.route_id == null ? '' : String(row.route_id).trim();
      const subsection_id = row.subsection_id == null ? '' : String(row.subsection_id).trim();
      const subsection_name = row.subsection_name?.trim();
      const length = row.length != null && Number.isFinite(Number(row.length)) ? Number(row.length) : null;
      if (!route_id || !subsection_id || !subsection_name) {
        errors.push(`Invalid row: route_id, subsection_id, subsection_name required (got ${JSON.stringify(row)})`);
        continue;
      }
      const existing = existsStmt.get(route_id, subsection_id);
      if (existing) {
        updateStmt.run(subsection_name, length, route_id, subsection_id);
        updated++;
      } else {
        insertStmt.run(route_id, subsection_id, subsection_name, length);
        inserted++;
      }
    }
    return NextResponse.json({
      inserted,
      updated,
      total: subsections.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: unknown) {
    logError('Subsections bulk', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
