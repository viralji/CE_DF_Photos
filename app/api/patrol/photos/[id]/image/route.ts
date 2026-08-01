import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { getObjectFromS3 } from '@/lib/s3';
import { logError } from '@/lib/safe-log';

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

    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT pp.s3_key, ps.patroller_email AS session_patroller
      FROM patrol_photos pp
      JOIN patrol_sessions ps ON pp.session_id = ps.id
      WHERE pp.id = ?
    `
      )
      .get(photoId) as { s3_key: string; session_patroller: string } | undefined;

    if (!row?.s3_key) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    if (session.role === 'Patroller' && row.session_patroller !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    logError('Patrol photo image', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
