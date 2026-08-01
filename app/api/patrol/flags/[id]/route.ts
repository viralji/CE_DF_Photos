import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { sendFlagResolvedEmail } from '@/lib/email';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const flag = db.prepare(`
    SELECT pf.*, r.route_name, u.name AS patroller_name
    FROM patrol_flags pf
    LEFT JOIN routes r ON pf.route_id = r.route_id
    LEFT JOIN users u ON pf.patroller_email = u.email
    WHERE pf.id = ?
  `).get(id);
  if (!flag) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ flag });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  const existing = db.prepare('SELECT id FROM patrol_flags WHERE id = ?').get(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = ['open', 'investigating', 'resolved'].includes(body.status) ? body.status : undefined;
  if (!status) return NextResponse.json({ error: 'status must be open|investigating|resolved' }, { status: 400 });

  const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
  const resolvedBy = status === 'resolved' ? session.user.email : null;
  const notes = typeof body.resolution_notes === 'string' ? body.resolution_notes.trim() : null;

  db.prepare(`
    UPDATE patrol_flags
    SET status = ?, resolved_by_email = ?, resolved_at = ?, resolution_notes = COALESCE(?, resolution_notes)
    WHERE id = ?
  `).run(status, resolvedBy, resolvedAt, notes, id);

  const flag = db.prepare(`
    SELECT pf.*, r.route_name FROM patrol_flags pf
    LEFT JOIN routes r ON pf.route_id = r.route_id
    WHERE pf.id = ?
  `).get(id) as { patroller_email: string; severity: string; description: string; route_name: string | null; latitude: number; longitude: number } & Record<string, unknown> | undefined;

  // On resolve: create patroller notification + send email (fire-and-forget)
  if (status === 'resolved' && flag) {
    try {
      db.prepare(`
        INSERT INTO patroller_notifications (flag_id, patroller_email, resolved_by_email, resolution_notes)
        VALUES (?, ?, ?, ?)
      `).run(id, flag.patroller_email, session.user.email, notes);
    } catch { /* ignore if table not ready */ }

    setImmediate(() => {
      sendFlagResolvedEmail({
        flagId: Number(id),
        severity: flag.severity,
        description: flag.description,
        routeName: flag.route_name ?? String(flag.route_id ?? ''),
        resolvedByEmail: session.user.email,
        resolutionNotes: notes,
        resolvedAt: resolvedAt ?? new Date().toISOString(),
        latitude: flag.latitude,
        longitude: flag.longitude,
      }, flag.patroller_email).catch(() => {});
    });
  }

  return NextResponse.json({ flag });
}
