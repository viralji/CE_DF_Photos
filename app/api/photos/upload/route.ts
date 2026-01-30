import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';
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
    const session = await getSessionOrDevBypass(request);
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
    const routeId = formData.get('routeId') as string;
    const subsectionId = formData.get('subsectionId') as string;
    const checkpointId = formData.get('checkpointId') as string;
    const executionStage = formData.get('executionStage') as string;
    const photoTypeNumber = formData.get('photoTypeNumber') as string;
    const photoCategory = formData.get('photoCategory') as string;
    const latitude = formData.get('latitude') as string;
    const longitude = formData.get('longitude') as string;
    const locationAccuracy = formData.get('locationAccuracy') as string;

    if (!file || !routeId || !subsectionId || !executionStage) {
      return NextResponse.json(
        { error: 'Missing required fields: routeId, subsectionId, and executionStage are required' },
        { status: 400 }
      );
    }
    if (typeof file.size !== 'number' || file.size === 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
    }

    const entity = (photoCategory || 'Unknown').trim();
    const photoIndex = photoTypeNumber ? parseInt(photoTypeNumber, 10) : 1;
    let entityCode = to3CharCode(entity);
    let checkpointCode = to3CharCode(entity);
    try {
      const allCheckpoints = query('SELECT id, entity, checkpoint_name FROM checkpoints ORDER BY id');
      const rows = (allCheckpoints.rows ?? []) as { id: number; entity: string; checkpoint_name: string }[];
      const checkpointCodeMap = uniqueCheckpointCodes(rows);
      const entityCodeMap = uniqueEntityCodes(rows);
      entityCode = entityCodeMap.get(entity) ?? entityCode;
      if (checkpointId) {
        const cid = parseInt(checkpointId, 10);
        checkpointCode = checkpointCodeMap.get(cid) ?? checkpointCode;
      }
    } catch {
      // ignore
    }

    const db = getDb();
    const userSelectStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const userResult = userSelectStmt.get(session.user.email) as { id: number } | undefined;
    let userId: number;
    if (!userResult) {
      const userInsertStmt = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)');
      const userInsertResult = userInsertStmt.run(session.user.email, session.user.name || '');
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
      `INSERT INTO photo_submissions (route_id, subsection_id, checkpoint_id, user_id, execution_stage, photo_type_number, photo_category, s3_key, s3_url, filename, file_size, width, height, format, latitude, longitude, location_accuracy, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      String(routeId),
      String(subsectionId),
      checkpointId ? parseInt(checkpointId, 10) : null,
      userId,
      executionStage,
      photoIndex,
      photoCategory || null,
      s3Key,
      s3Url,
      filename,
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
