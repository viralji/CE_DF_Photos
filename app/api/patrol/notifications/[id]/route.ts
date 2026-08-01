import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = getDb();

  // Support id='all' to mark all as read
  if (id === 'all') {
    db.prepare('UPDATE manager_notifications SET is_read = 1 WHERE manager_email = ?').run(session.user.email);
    return NextResponse.json({ success: true });
  }

  const existing = db.prepare('SELECT id, manager_email FROM manager_notifications WHERE id = ?').get(id) as {
    id: number; manager_email: string;
  } | undefined;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.manager_email !== session.user.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  db.prepare('UPDATE manager_notifications SET is_read = 1 WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
