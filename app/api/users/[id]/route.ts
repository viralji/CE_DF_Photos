import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole, type AllowedRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';

const ALLOWED_ROLES: AllowedRole[] = ['Engineer', 'Reviewer', 'Admin'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId) || userId < 1) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    const body = await request.json();
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
      return NextResponse.json({ error: 'role must be Engineer, Reviewer, or Admin' }, { status: 400 });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: number } | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, userId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logError('User PATCH', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId) || userId < 1) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as { id: number; email: string } | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (existing.email === session.user.email) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }
    db.prepare('UPDATE photo_submissions SET user_id = NULL WHERE user_id = ?').run(userId);
    db.prepare('UPDATE photo_submissions SET reviewer_id = NULL WHERE reviewer_id = ?').run(userId);
    try {
      db.prepare('UPDATE document_submissions SET user_id = NULL WHERE user_id = ?').run(userId);
      db.prepare('UPDATE document_submissions SET reviewer_id = NULL WHERE reviewer_id = ?').run(userId);
    } catch {
      // document_submissions may not exist
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logError('User DELETE', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
