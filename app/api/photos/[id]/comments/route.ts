import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { logError } from '@/lib/safe-log';
import { getDb, query } from '@/lib/db';
import { sanitizeText, MAX_COMMENT_TEXT_LENGTH } from '@/lib/sanitize';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (Number.isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const photo = query('SELECT route_id, subsection_id FROM photo_submissions WHERE id = ?', [photoId]);
    const row = photo.rows[0] as { route_id: string; subsection_id: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (!allowedKeys.has(`${row.route_id}::${row.subsection_id}`)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const result = query(
      'SELECT id, author_email, author_name, created_at, comment_text FROM photo_submission_comments WHERE photo_submission_id = ? ORDER BY created_at ASC',
      [photoId]
    );
    const comments = (result.rows ?? []).map((c: unknown) => {
      const x = c as { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string };
      return { id: x.id, author_email: x.author_email, author_name: x.author_name, created_at: x.created_at, comment_text: x.comment_text };
    });
    return NextResponse.json({ comments });
  } catch (error: unknown) {
    logError('Comments GET', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (Number.isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const body = await request.json();
    const text = sanitizeText(typeof body.text === 'string' ? body.text : '', MAX_COMMENT_TEXT_LENGTH);
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });

    const db = getDb();
    const photo = db.prepare('SELECT id, route_id, subsection_id FROM photo_submissions WHERE id = ?').get(photoId) as
      | { id: number; route_id: string; subsection_id: string }
      | undefined;
    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (!allowedKeys.has(`${photo.route_id}::${photo.subsection_id}`)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const userRow = db.prepare('SELECT id, name FROM users WHERE email = ?').get(session.user.email) as { id: number; name: string | null } | undefined;
    const userId = userRow?.id ?? null;
    const authorName = session.user.name ?? userRow?.name ?? null;
    const run = db.prepare(
      'INSERT INTO photo_submission_comments (photo_submission_id, user_id, author_email, author_name, created_at, comment_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(photoId, userId, session.user.email, authorName, new Date().toISOString(), text);
    const commentId = Number(run.lastInsertRowid);
    const inserted = db.prepare('SELECT id, author_email, author_name, created_at, comment_text FROM photo_submission_comments WHERE id = ?').get(commentId) as {
      id: number;
      author_email: string;
      author_name: string | null;
      created_at: string;
      comment_text: string;
    };
    return NextResponse.json(inserted, { status: 201 });
  } catch (error: unknown) {
    logError('Comments POST', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
