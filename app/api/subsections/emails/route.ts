import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && s.length <= 254 && EMAIL_REGEX.test(s.trim());
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const route_id = searchParams.get('route_id') ?? '';
    const subsection_id = searchParams.get('subsection_id') ?? '';

    if (route_id && subsection_id) {
      const result = query(
        'SELECT id, route_id, subsection_id, email FROM subsection_allowed_emails WHERE route_id = ? AND subsection_id = ? ORDER BY email',
        [route_id, subsection_id]
      );
      return NextResponse.json({ emails: result.rows });
    }
    const result = query(
      'SELECT id, route_id, subsection_id, email FROM subsection_allowed_emails ORDER BY route_id, subsection_id, email',
      []
    );
    return NextResponse.json({ emails: result.rows });
  } catch (error: unknown) {
    logError('Subsection emails GET', error);
    return NextResponse.json({ emails: [], error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const route_id = body.route_id != null ? String(body.route_id).trim() : '';
    const subsection_id = body.subsection_id != null ? String(body.subsection_id).trim() : '';
    if (!route_id || !subsection_id) {
      return NextResponse.json({ error: 'route_id and subsection_id are required' }, { status: 400 });
    }
    const raw = body.emails;
    const emails = Array.isArray(raw)
      ? raw.map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => e.length > 0)
      : [];
    const unique = [...new Set(emails)];
    const invalid = unique.filter((e) => !isValidEmail(e));
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Invalid email(s): ' + invalid.join(', ') }, { status: 400 });
    }
    const db = getDb();
    const subsectionExists = db.prepare('SELECT 1 FROM subsections WHERE route_id = ? AND subsection_id = ?').get(route_id, subsection_id);
    if (!subsectionExists) {
      return NextResponse.json({ error: 'Subsection not found' }, { status: 400 });
    }
    db.prepare('DELETE FROM subsection_allowed_emails WHERE route_id = ? AND subsection_id = ?').run(route_id, subsection_id);
    const insertStmt = db.prepare('INSERT INTO subsection_allowed_emails (route_id, subsection_id, email) VALUES (?, ?, ?)');
    for (const email of unique) {
      insertStmt.run(route_id, subsection_id, email);
    }
    const result = query(
      'SELECT id, route_id, subsection_id, email FROM subsection_allowed_emails WHERE route_id = ? AND subsection_id = ? ORDER BY email',
      [route_id, subsection_id]
    );
    return NextResponse.json({ emails: result.rows });
  } catch (error: unknown) {
    logError('Subsection emails PUT', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
