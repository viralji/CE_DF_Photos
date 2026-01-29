import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const result = query(
      'SELECT ps.*, r.route_name, s.subsection_name, c.entity, c.checkpoint_name FROM photo_submissions ps LEFT JOIN routes r ON ps.route_id = r.route_id LEFT JOIN subsections s ON ps.route_id = s.route_id AND ps.subsection_id = s.subsection_id LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id WHERE ps.id = ?',
      [photoId]
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    return NextResponse.json(row);
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
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const getResult = query('SELECT id, status, s3_key FROM photo_submissions WHERE id = ?', [
      photoId,
    ]);
    const row = getResult.rows[0] as { id: number; status: string; s3_key: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    if (row.status === 'approved') {
      return NextResponse.json({ error: 'Cannot delete approved photo' }, { status: 400 });
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
