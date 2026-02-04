import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

function checkPhotoAccess(photoId: number, email: string, role: string): { route_id: string; subsection_id: string } | null {
  const result = query('SELECT route_id, subsection_id FROM photo_submissions WHERE id = ?', [photoId]);
  const row = result.rows[0] as { route_id: string; subsection_id: string } | undefined;
  if (!row) return null;
  const allowedKeys = getAllowedSubsectionKeys(email, role);
  const key = `${row.route_id}::${row.subsection_id}`;
  return allowedKeys.has(key) ? row : null;
}

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
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const access = checkPhotoAccess(photoId, session.user.email, session.role);
    if (!access) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 });
    }
    const result = query(
      'SELECT ps.*, r.route_name, s.subsection_name, e.name AS entity, c.checkpoint_name FROM photo_submissions ps LEFT JOIN routes r ON ps.route_id = r.route_id LEFT JOIN subsections s ON ps.route_id = s.route_id AND ps.subsection_id = s.subsection_id LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id LEFT JOIN entities e ON c.entity_id = e.id WHERE ps.id = ?',
      [photoId]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    const commentsResult = query(
      'SELECT id, author_email, author_name, created_at, comment_text FROM photo_submission_comments WHERE photo_submission_id = ? ORDER BY created_at ASC',
      [photoId]
    );
    const comments = (commentsResult.rows ?? []).map((c: unknown) => {
      const x = c as { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string };
      return { id: x.id, author_email: x.author_email, author_name: x.author_name, created_at: x.created_at, comment_text: x.comment_text };
    });
    return NextResponse.json({ ...row, comments });
  } catch (error: unknown) {
    console.error('Error fetching photo:', error);
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
      return NextResponse.json({ error: 'Only Admin can delete photos' }, { status: 403 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const access = checkPhotoAccess(photoId, session.user.email, session.role);
    if (!access) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 });
    }
    const getResult = query('SELECT id, status, s3_key FROM photo_submissions WHERE id = ?', [
      photoId,
    ]);
    const row = getResult.rows[0] as { id: number; status: string; s3_key: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    if (row.status === 'approved') {
      return NextResponse.json({ error: 'Cannot delete approved photo' }, { status: 400 });
    }
    const childCheck = query(
      'SELECT 1 FROM photo_submissions WHERE resubmission_of_id = ? LIMIT 1',
      [photoId]
    );
    const hasChild = (childCheck.rows?.length ?? 0) > 0;
    if (hasChild) {
      return NextResponse.json(
        { error: 'Only the latest photo in a slot can be deleted. This photo has a resubmission.' },
        { status: 400 }
      );
    }
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    db.prepare('DELETE FROM photo_submissions WHERE id = ?').run(photoId);
    try {
      const { deleteFromS3 } = await import('@/lib/s3');
      await deleteFromS3(row.s3_key);
    } catch (s3Err) {
      console.error('S3 delete error:', s3Err);
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
