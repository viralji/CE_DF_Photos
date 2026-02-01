import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb, query } from '@/lib/db';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';
import { uploadToS3, getS3Key, deleteFromS3 } from '@/lib/s3';
import { compressImage, getImageMetadata } from '@/lib/image-compression';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function istDateAndTime(at: Date = new Date()): { dateStr: string; timeStr: string } {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dateStr = `${get('year')}${get('month')}${get('day')}`;
  const timeStr = `${get('hour')}${get('minute')}${get('second')}`;
  return { dateStr, timeStr };
}

function buildPhotoFilename(params: {
  routeId: string;
  subsectionId: string;
  entityCode: string;
  checkpointCode: string;
  executionStage: string;
  photoIndex: number;
  extension: string;
  dateStr: string;
  timeStr: string;
}): string {
  const stageLetter =
    params.executionStage === 'Before' || params.executionStage === 'B' ? 'B' :
    params.executionStage === 'Ongoing' || params.executionStage === 'O' ? 'O' : 'A';
  return `${params.routeId}-${params.subsectionId}-${params.entityCode}-${params.checkpointCode}-${stageLetter}-${params.photoIndex}-${params.dateStr}-${params.timeStr}.${params.extension}`;
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

    const db = getDb();
    const photo = db.prepare(
      'SELECT id, route_id, subsection_id, checkpoint_id, execution_stage, photo_type_number, filename, s3_key, status FROM photo_submissions WHERE id = ?'
    ).get(photoId) as {
      id: number;
      route_id: string;
      subsection_id: string;
      checkpoint_id: number | null;
      execution_stage: string;
      photo_type_number: number | null;
      filename: string;
      s3_key: string;
      status: string;
    } | undefined;
    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    if (photo.status !== 'qc_required' && photo.status !== 'nc') {
      return NextResponse.json({ error: 'Resubmit is only allowed for QC Required or NC photos' }, { status: 400 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (!allowedKeys.has(`${photo.route_id}::${photo.subsection_id}`)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Request body too large. Maximum 10MB per photo.' }, { status: 413 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const comment = (formData.get('comment') as string)?.trim() ?? '';
    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!comment) {
      return NextResponse.json({ error: 'Comment is required when resubmitting a QC Required or NC photo.' }, { status: 400 });
    }

    // Get entity and checkpoint codes from checkpoint
    let entityCode = 'XXX';
    let checkpointCode = 'XXX';
    if (photo.checkpoint_id) {
      const cp = query(
        'SELECT e.code AS entity_code, c.code AS checkpoint_code FROM checkpoints c LEFT JOIN entities e ON c.entity_id = e.id WHERE c.id = ?',
        [photo.checkpoint_id]
      );
      const row = cp.rows[0] as { entity_code: string; checkpoint_code: string | null } | undefined;
      if (row?.entity_code) entityCode = row.entity_code;
      if (row?.checkpoint_code) checkpointCode = row.checkpoint_code;
    }
    const photoIndex = photo.photo_type_number ?? 1;
    const { dateStr, timeStr } = istDateAndTime(new Date());
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const filename = buildPhotoFilename({
      routeId: photo.route_id,
      subsectionId: photo.subsection_id,
      entityCode,
      checkpointCode,
      executionStage: photo.execution_stage,
      photoIndex,
      extension,
      dateStr,
      timeStr,
    });
    const s3Key = getS3Key(filename);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const compressedBuffer = await compressImage(buffer, { quality: 85 });
    const metadata = await getImageMetadata(compressedBuffer);
    const format = typeof metadata.format === 'string' ? metadata.format : 'jpeg';

    await uploadToS3(s3Key, compressedBuffer, `image/${format}`);
    try {
      await deleteFromS3(photo.s3_key);
    } catch (s3Err) {
      console.error('S3 delete old key error:', s3Err);
    }

    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME || 'ce-df-photos'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE photo_submissions SET
        s3_key = ?, s3_url = ?, filename = ?, file_size = ?, width = ?, height = ?, format = ?,
        status = 'pending', reviewer_id = NULL, reviewed_at = NULL, updated_at = ?
       WHERE id = ?`
    ).run(s3Key, s3Url, filename, compressedBuffer.length, metadata.width, metadata.height, format, now, photoId);

    if (comment) {
      const userRow = db.prepare('SELECT id, name FROM users WHERE email = ?').get(session.user.email) as { id: number; name: string | null } | undefined;
      db.prepare(
        'INSERT INTO photo_submission_comments (photo_submission_id, user_id, author_email, author_name, created_at, comment_text) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(photoId, userRow?.id ?? null, session.user.email, session.user.name ?? userRow?.name ?? null, now, comment);
    }

    const updated = db.prepare('SELECT id, status, filename, s3_url, updated_at FROM photo_submissions WHERE id = ?').get(photoId);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Resubmit error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
