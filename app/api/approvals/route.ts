import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

const ACTIONS = ['approve', 'qc_required', 'nc'] as const;
type Action = (typeof ACTIONS)[number];

function processOne(
  db: ReturnType<typeof getDb>,
  photoId: number,
  action: Action,
  comment: string | undefined,
  userId: number,
  authorEmail: string,
  authorName: string | null
): { ok: boolean; error?: string } {
  const photo = db.prepare('SELECT id, route_id, subsection_id, status FROM photo_submissions WHERE id = ?').get(photoId) as
    | { id: number; route_id: string; subsection_id: string; status: string }
    | undefined;
  if (!photo) return { ok: false, error: 'Photo not found' };
  if (action === 'qc_required' || action === 'nc') {
    const c = typeof comment === 'string' ? comment.trim() : '';
    if (!c) return { ok: false, error: 'Comment is required for QC Required and NC' };
    db.prepare(
      'INSERT INTO photo_submission_comments (photo_submission_id, user_id, author_email, author_name, created_at, comment_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(photoId, userId, authorEmail, authorName, new Date().toISOString(), c);
  } else if (action === 'approve' && comment != null && String(comment).trim()) {
    db.prepare(
      'INSERT INTO photo_submission_comments (photo_submission_id, user_id, author_email, author_name, created_at, comment_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(photoId, userId, authorEmail, authorName, new Date().toISOString(), String(comment).trim());
  }
  db.prepare('UPDATE photo_submissions SET status = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?').run(
    action === 'approve' ? 'approved' : action,
    userId,
    new Date().toISOString(),
    new Date().toISOString(),
    photoId
  );
  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { photoId, photoIds, action, comment } = body;
    const act = typeof action === 'string' ? action.trim().toLowerCase() : '';
    if (!ACTIONS.includes(act as Action)) {
      return NextResponse.json({ error: 'action must be approve, qc_required, or nc' }, { status: 400 });
    }
    const db = getDb();
    const userRow = db.prepare('SELECT id, name FROM users WHERE email = ?').get(session.user.email) as { id: number; name: string | null } | undefined;
    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 400 });
    const authorEmail = session.user.email;
    const authorName = session.user.name ?? userRow.name ?? null;

    const ids: number[] = [];
    if (Array.isArray(photoIds) && photoIds.length > 0) {
      ids.push(...photoIds.map((id: unknown) => Number(id)).filter((n: number) => !Number.isNaN(n) && n > 0));
    } else if (photoId != null) {
      const n = Number(photoId);
      if (!Number.isNaN(n) && n > 0) ids.push(n);
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: 'photoId or photoIds required' }, { status: 400 });
    }

    const commentStr = typeof comment === 'string' ? comment.trim() : undefined;
    if ((act === 'qc_required' || act === 'nc') && !commentStr) {
      return NextResponse.json({ error: 'Comment is required for QC Required and NC' }, { status: 400 });
    }

    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    const errors: string[] = [];
    for (const id of ids) {
      const photo = db.prepare('SELECT id, route_id, subsection_id FROM photo_submissions WHERE id = ?').get(id) as
        | { id: number; route_id: string; subsection_id: string }
        | undefined;
      if (!photo) {
        errors.push(`Photo ${id} not found`);
        continue;
      }
      const key = `${photo.route_id}::${photo.subsection_id}`;
      if (!allowedKeys.has(key)) {
        errors.push(`Access denied to photo ${id}`);
        continue;
      }
      const result = processOne(db, id, act as Action, commentStr, userRow.id, authorEmail, authorName);
      if (!result.ok) errors.push(result.error ?? `Photo ${id} failed`);
    }
    if (errors.length > 0 && errors.length === ids.length) {
      return NextResponse.json({ error: errors[0] ?? 'Failed' }, { status: 400 });
    }
    return NextResponse.json({ success: true, processed: ids.length, errors: errors.length ? errors : undefined });
  } catch (error: unknown) {
    logError('Approval', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
