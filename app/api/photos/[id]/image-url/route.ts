import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { getSignedUrlForS3 } from '@/lib/s3';

/**
 * Returns a short-lived presigned S3 URL so the client can load the image
 * directly from S3 (avoids cookie/auth issues with proxy image request).
 */
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
    const result = query('SELECT s3_key FROM photo_submissions WHERE id = ?', [photoId]);
    const row = result.rows[0] as { s3_key: string } | undefined;
    if (!row?.s3_key) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }
    const url = await getSignedUrlForS3(row.s3_key, 3600);
    return NextResponse.json({ url });
  } catch (error: unknown) {
    logError('Photo image-url', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
