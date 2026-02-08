import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { logError } from '@/lib/safe-log';
import { query } from '@/lib/db';
import { getObjectFromS3 } from '@/lib/s3';
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
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }
    const result = query('SELECT s3_key, route_id, subsection_id FROM photo_submissions WHERE id = ?', [photoId]);
    const row = result.rows[0] as { s3_key: string; route_id: string; subsection_id: string } | undefined;
    if (!row?.s3_key) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    const key = `${row.route_id}::${row.subsection_id}`;
    if (!allowedKeys.has(key)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { body, contentType } = await getObjectFromS3(row.s3_key);
    const ct = contentType ?? 'image/jpeg';
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch (error: unknown) {
    logError('Photo image', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
