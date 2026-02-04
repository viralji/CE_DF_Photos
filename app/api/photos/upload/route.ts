import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';
import {
  sanitizeExecutionStage,
  limitLength,
  MAX_PHOTO_CATEGORY_LENGTH,
  MAX_ROUTE_SUBSECTION_ID_LENGTH,
  parsePositiveInt,
} from '@/lib/sanitize';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';
import { uploadToS3, getS3Key } from '@/lib/s3';
import { compressImage, getImageMetadata, burnGeoOverlay } from '@/lib/image-compression';
import { reverseGeocode, formatLocationForBurn } from '@/lib/geocode';
import { to3CharCode, uniqueCheckpointCodes, uniqueEntityCodes } from '@/lib/photo-filename';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** IST date YYYYMMDD and time HHMMSS (Asia/Kolkata). */
function istDateAndTime(at: Date = new Date()): { dateStr: string; timeStr: string } {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dateStr = `${get('year')}${get('month')}${get('day')}`;
  const timeStr = `${get('hour')}${get('minute')}${get('second')}`;
  return { dateStr, timeStr };
}

/** IST display string for geo overlay (same timezone as filename). */
function istDisplayForOverlay(at: Date): string {
  return at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' }) + ' IST';
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

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Request body too large. Maximum 10MB per photo.' },
        { status: 413 }
      );
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const routeIdRaw = formData.get('routeId') as string;
    const subsectionIdRaw = formData.get('subsectionId') as string;
    const routeId = limitLength(String(routeIdRaw ?? ''), MAX_ROUTE_SUBSECTION_ID_LENGTH).trim() || '';
    const subsectionId = limitLength(String(subsectionIdRaw ?? ''), MAX_ROUTE_SUBSECTION_ID_LENGTH).trim() || '';
    const checkpointIdRaw = formData.get('checkpointId') as string;
    const executionStageRaw = formData.get('executionStage') as string;
    const executionStage = sanitizeExecutionStage(executionStageRaw);
    const photoTypeNumber = formData.get('photoTypeNumber') as string;
    const photoCategoryRaw = formData.get('photoCategory') as string;
    const photoCategoryTrimmed = typeof photoCategoryRaw === 'string' ? photoCategoryRaw.trim() : '';
    const photoCategory = photoCategoryTrimmed ? limitLength(photoCategoryTrimmed, MAX_PHOTO_CATEGORY_LENGTH) : null;
    const latitude = formData.get('latitude') as string;
    const longitude = formData.get('longitude') as string;
    const locationAccuracy = formData.get('locationAccuracy') as string;

    if (!file || !routeId || !subsectionId || !executionStage) {
      return NextResponse.json(
        { error: 'Missing required fields: routeId, subsectionId, and executionStage (B, O, or A) are required' },
        { status: 400 }
      );
    }
    const checkpointId = checkpointIdRaw ? parsePositiveInt(checkpointIdRaw) : null;
    if (checkpointIdRaw && checkpointId === null) {
      return NextResponse.json({ error: 'checkpointId must be a positive integer' }, { status: 400 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    const subsectionKey = `${String(routeId)}::${String(subsectionId)}`;
    if (!allowedKeys.has(subsectionKey)) {
      return NextResponse.json(
        { error: 'You do not have access to this route and subsection' },
        { status: 403 }
      );
    }
    if (typeof file.size !== 'number' || file.size === 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
    }

    // Duplicate check: use file metadata (size + lastModified). Runs only when both form fields fileSize and fileLastModified are present and valid; client must send them for new uploads. Size fallback from received file for storage only; lastModified is not read from server File (unreliable in Node/Next).
    const fileSizeRaw = formData.get('fileSize') as string | null;
    const fileLastModifiedRaw = formData.get('fileLastModified') as string | null;
    let fileOriginalSize: number | null = fileSizeRaw != null && fileSizeRaw !== '' ? parseInt(fileSizeRaw, 10) : null;
    const fileLastModified: number | null = fileLastModifiedRaw != null && fileLastModifiedRaw !== '' ? parseInt(fileLastModifiedRaw, 10) : null;
    if (fileOriginalSize == null || Number.isNaN(fileOriginalSize)) fileOriginalSize = file.size;
    if (fileOriginalSize != null && fileLastModified != null) {
      const dup = getDb()
        .prepare(
          `SELECT r.route_name, s.subsection_name, e.name AS entity_name, c.checkpoint_name
           FROM photo_submissions ps
           LEFT JOIN routes r ON ps.route_id = r.route_id
           LEFT JOIN subsections s ON ps.route_id = s.route_id AND ps.subsection_id = s.subsection_id
           LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id
           LEFT JOIN entities e ON c.entity_id = e.id
           WHERE ps.file_original_size = ? AND ps.file_last_modified = ?
           LIMIT 1`
        )
        .get(fileOriginalSize, fileLastModified) as { route_name: string | null; subsection_name: string | null; entity_name: string | null; checkpoint_name: string | null } | undefined;
      if (dup) {
        const route = dup.route_name ?? 'Unknown Route';
        const section = dup.subsection_name ?? 'Unknown Section';
        const entity = dup.entity_name ?? 'Unknown Entity';
        const checkpoint = dup.checkpoint_name ?? 'Unknown Checkpoint';
        const msg = `Photo already uploaded for ${route} - ${section} - ${entity} - ${checkpoint}.`;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } else if (fileOriginalSize != null && fileLastModified == null) {
      console.debug('Skipping duplicate check: fileLastModified not provided.');
    }

    const entity = (photoCategory && photoCategory.trim()) ? photoCategory.trim() : 'Unknown';
    const photoIndex = parsePositiveInt(photoTypeNumber) ?? 1;
    let entityCode = to3CharCode(entity);
    let checkpointCode = to3CharCode(entity);
    try {
      const allCheckpoints = query(
        'SELECT c.id, c.checkpoint_name, c.code AS checkpoint_code, e.name AS entity, e.code AS entity_code FROM checkpoints c LEFT JOIN entities e ON c.entity_id = e.id ORDER BY c.id'
      );
      const rows = (allCheckpoints.rows ?? []) as { id: number; checkpoint_name: string; checkpoint_code: string | null; entity: string; entity_code: string | null }[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const entityCodeByEntityName = new Map<string, string>();
      const checkpointCodeById = new Map<number, string>();
      for (const r of rows) {
        if (r.entity && r.entity_code) entityCodeByEntityName.set(r.entity, r.entity_code);
        if (r.checkpoint_code) checkpointCodeById.set(r.id, r.checkpoint_code);
      }
      if (entityCodeByEntityName.size > 0) entityCode = entityCodeByEntityName.get(entity) ?? entityCode;
      if (checkpointId != null) {
        checkpointCode = checkpointCodeById.get(checkpointId) ?? uniqueCheckpointCodes(rows.map((r) => ({ id: r.id, checkpoint_name: r.checkpoint_name }))).get(checkpointId) ?? checkpointCode;
      }
      if (entityCodeByEntityName.size === 0) {
        const entityCodeMap = uniqueEntityCodes(rows.map((r) => ({ entity: r.entity || '' })));
        entityCode = entityCodeMap.get(entity) ?? entityCode;
      }
    } catch {
      // ignore
    }

    const db = getDb();
    const userSelectStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const userResult = userSelectStmt.get(session.user.email) as { id: number } | undefined;
    let userId: number;
    const firstAdminEmail = 'v.shah@cloudextel.com';
    if (!userResult) {
      const defaultRole = session.user.email === firstAdminEmail ? 'Admin' : 'Reviewer';
      const userInsertStmt = db.prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)');
      const userInsertResult = userInsertStmt.run(session.user.email, session.user.name || '', defaultRole);
      userId = Number(userInsertResult.lastInsertRowid);
    } else {
      userId = userResult.id;
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let compressedBuffer = await compressImage(buffer, { quality: 85 });
    let metadata = await getImageMetadata(compressedBuffer);
    const format = typeof metadata.format === 'string' ? metadata.format : 'jpeg';

    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;
    const captureDate = new Date();
    const { dateStr, timeStr } = istDateAndTime(captureDate);
    const istTimestampDisplay = istDisplayForOverlay(captureDate);

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

    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const filename = buildPhotoFilename({
      routeId,
      subsectionId,
      entityCode,
      checkpointCode,
      executionStage,
      photoIndex,
      extension,
      dateStr,
      timeStr,
    });
    const s3Key = getS3Key(filename);
    await uploadToS3(s3Key, compressedBuffer, `image/${format}`);
    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME || 'ce-df-photos'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;

    db.prepare(
      `INSERT INTO photo_submissions (route_id, subsection_id, checkpoint_id, user_id, execution_stage, photo_type_number, photo_category, s3_key, s3_url, filename, file_original_size, file_last_modified, file_size, width, height, format, latitude, longitude, location_accuracy, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      String(routeId),
      String(subsectionId),
      checkpointId ?? null,
      userId,
      executionStage,
      photoIndex,
      photoCategory || null,
      s3Key,
      s3Url,
      filename,
      fileOriginalSize ?? file.size,
      fileLastModified ?? null,
      compressedBuffer.length,
      metadata.width,
      metadata.height,
      format,
      lat,
      lng,
      locationAccuracy ? parseFloat(locationAccuracy) : null
    );
    const inserted = db.prepare('SELECT * FROM photo_submissions ORDER BY id DESC LIMIT 1').get() as { id: number };
    return NextResponse.json({ id: inserted.id, filename, s3_url: s3Url });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
