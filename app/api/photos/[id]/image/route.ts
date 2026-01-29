import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { getObjectFromS3 } from '@/lib/s3';

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
    const { body, contentType } = await getObjectFromS3(row.s3_key);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': contentType ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch (error: unknown) {
    console.error('Photo image proxy error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
