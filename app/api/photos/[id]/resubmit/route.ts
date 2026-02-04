import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb, query } from '@/lib/db';
import { sanitizeText, MAX_COMMENT_TEXT_LENGTH } from '@/lib/sanitize';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';
import { uploadToS3, getS3Key } from '@/lib/s3';
import { compressImage, getImageMetadata, burnGeoOverlay } from '@/lib/image-compression';
import { reverseGeocode, formatLocationForBurn } from '@/lib/geocode';

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
      'SELECT id, route_id, subsection_id, checkpoint_id, execution_stage, photo_type_number, photo_category, s3_key, status FROM photo_submissions WHERE id = ?'
    ).get(photoId) as {
      id: number;
      route_id: string;
      subsection_id: string;
      checkpoint_id: number | null;
      execution_stage: string;
      photo_type_number: number | null;
      photo_category: string | null;
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
    const comment = sanitizeText((formData.get('comment') as string) ?? '', MAX_COMMENT_TEXT_LENGTH);
    const latitude = formData.get('latitude') as string;
    const longitude = formData.get('longitude') as string;
    const locationAccuracy = formData.get('locationAccuracy') as string;
    
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
    let compressedBuffer = await compressImage(buffer, { quality: 85 });
    let metadata = await getImageMetadata(compressedBuffer);
    
    // Burn geo overlay if location data is available
    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;
    const captureDate = new Date();
    const istTimestampDisplay = captureDate.toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata', 
      dateStyle: 'short', 
      timeStyle: 'medium' 
    }) + ' IST';
    
    if (lat != null && lng != null && metadata.width && metadata.height) {
      const { place, state } = await reverseGeocode(lat, lng);
      const locationBurn = formatLocationForBurn(place, state);
      
      compressedBuffer = await burnGeoOverlay(compressedBuffer, {
        width: metadata.width,
        height: metadata.height,
        latitude: lat,
        longitude: lng,
        accuracy: locationAccuracy ? parseFloat(locationAccuracy) : undefined,
        timestamp: istTimestampDisplay,
        location: locationBurn ?? undefined,
      });
      metadata = await getImageMetadata(compressedBuffer);
    }
    
    const format = typeof metadata.format === 'string' ? metadata.format : 'jpeg';

    await uploadToS3(s3Key, compressedBuffer, `image/${format}`);
    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME || 'ce-df-photos'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    const now = new Date().toISOString();

    const userSelectStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const userResult = userSelectStmt.get(session.user.email) as { id: number } | undefined;
    let userId: number;
    if (!userResult) {
      const userInsertStmt = db.prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)');
      const insertResult = userInsertStmt.run(session.user.email, session.user.name ?? '', 'field_worker');
      userId = Number(insertResult.lastInsertRowid);
    } else {
      userId = userResult.id;
    }

    db.prepare(
      `INSERT INTO photo_submissions (
        route_id, subsection_id, checkpoint_id, user_id, execution_stage, photo_type_number, photo_category,
        resubmission_of_id, s3_key, s3_url, filename, file_size, width, height, format,
        latitude, longitude, location_accuracy, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      photo.route_id,
      photo.subsection_id,
      photo.checkpoint_id,
      userId,
      photo.execution_stage,
      photo.photo_type_number,
      photo.photo_category ?? null,
      photoId,
      s3Key,
      s3Url,
      filename,
      compressedBuffer.length,
      metadata.width ?? null,
      metadata.height ?? null,
      format,
      lat,
      lng,
      locationAccuracy ? parseFloat(locationAccuracy) : null,
      now,
      now,
    );

    const newRow = db.prepare('SELECT id, status, filename, s3_url, created_at, resubmission_of_id FROM photo_submissions ORDER BY id DESC LIMIT 1').get() as {
      id: number;
      status: string;
      filename: string;
      s3_url: string;
      created_at: string;
      resubmission_of_id: number | null;
    };
    const newPhotoId = newRow.id;

    const userRow = db.prepare('SELECT id, name FROM users WHERE email = ?').get(session.user.email) as { id: number; name: string | null } | undefined;
    db.prepare(
      'INSERT INTO photo_submission_comments (photo_submission_id, user_id, author_email, author_name, created_at, comment_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(newPhotoId, userRow?.id ?? null, session.user.email, session.user.name ?? userRow?.name ?? null, now, comment);

    return NextResponse.json(newRow);
  } catch (error: unknown) {
    console.error('Resubmit error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
