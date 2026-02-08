import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb, query } from '@/lib/db';
import { sanitizeText, MAX_COMMENT_TEXT_LENGTH } from '@/lib/sanitize';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';
import { uploadToS3, getS3Key } from '@/lib/s3';
import { compressImage, getImageMetadata, burnGeoOverlay } from '@/lib/image-compression';
import { reverseGeocode, formatLocationForBurn } from '@/lib/geocode';
import { logError } from '@/lib/safe-log';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allow up to 60s for resubmit + compression + S3 (concurrent users). */
export const maxDuration = 60;

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

    // Duplicate check: same as new upload — reject if this file (size + lastModified) is already in any photo
    const fileSizeRaw = formData.get('fileSize') as string | null;
    const fileLastModifiedRaw = formData.get('fileLastModified') as string | null;
    let fileOriginalSize: number | null = fileSizeRaw != null && fileSizeRaw !== '' ? parseInt(fileSizeRaw, 10) : null;
    let fileLastModified: number | null = fileLastModifiedRaw != null && fileLastModifiedRaw !== '' ? parseInt(fileLastModifiedRaw, 10) : null;
    if (fileOriginalSize == null || Number.isNaN(fileOriginalSize)) fileOriginalSize = file.size;
    if (fileLastModified == null || Number.isNaN(fileLastModified)) fileLastModified = typeof file.lastModified === 'number' ? file.lastModified : null;
    if (fileOriginalSize != null && fileLastModified != null) {
      const dup = db.prepare(
        `SELECT r.route_name, s.subsection_name, e.name AS entity_name, c.checkpoint_name
         FROM photo_submissions ps
         LEFT JOIN routes r ON CAST(ps.route_id AS TEXT) = r.route_id
         LEFT JOIN subsections s ON CAST(ps.route_id AS TEXT) = s.route_id AND CAST(ps.subsection_id AS TEXT) = s.subsection_id
         LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id
         LEFT JOIN entities e ON c.entity_id = e.id
         WHERE ps.file_original_size = ? AND ps.file_last_modified = ?
         LIMIT 1`
      ).get(fileOriginalSize, fileLastModified) as { route_name: string | null; subsection_name: string | null; entity_name: string | null; checkpoint_name: string | null } | undefined;
      if (dup) {
        const route = dup.route_name ?? 'Unknown Route';
        const section = dup.subsection_name ?? 'Unknown Section';
        const entity = dup.entity_name ?? 'Unknown Entity';
        const checkpoint = dup.checkpoint_name ?? 'Unknown Checkpoint';
        const msg = `Photo already uploaded for ${route} - ${section} - ${entity} - ${checkpoint}.`;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;
    const geocodePromise =
      lat != null && lng != null ? reverseGeocode(lat, lng) : Promise.resolve({ place: null as string | null, state: null as string | null });

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
    const metadata = await getImageMetadata(compressedBuffer);

    const captureDate = new Date();
    const istTimestampDisplay = captureDate.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'short',
      timeStyle: 'medium',
    }) + ' IST';

    if (lat != null && lng != null && metadata.width && metadata.height) {
      const { place, state } = await geocodePromise;
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
      const insertResult = userInsertStmt.run(session.user.email, session.user.name ?? '', 'Engineer');
      userId = Number(insertResult.lastInsertRowid);
    } else {
      userId = userResult.id;
    }

    db.prepare(
      `INSERT INTO photo_submissions (
        route_id, subsection_id, checkpoint_id, user_id, execution_stage, photo_type_number, photo_category,
        resubmission_of_id, s3_key, s3_url, filename, file_original_size, file_last_modified, file_size, width, height, format,
        latitude, longitude, location_accuracy, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
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
      fileOriginalSize ?? file.size,
      fileLastModified ?? null,
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
    logError('Resubmit', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
