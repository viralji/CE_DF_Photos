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
    const flagId = parseInt(id, 10);
    if (Number.isNaN(flagId)) {
      return NextResponse.json({ error: 'Invalid flag id' }, { status: 400 });
    }

    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT pf.s3_key, ps.patroller_email AS session_patroller
      FROM patrol_flags pf
      JOIN patrol_sessions ps ON pf.session_id = ps.id
      WHERE pf.id = ?
    `
      )
      .get(flagId) as { s3_key: string | null; session_patroller: string } | undefined;

    if (!row?.s3_key) {
      return NextResponse.json({ error: 'Flag image not found' }, { status: 404 });
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
    logError('Patrol flag image', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
