import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { uploadToS3 } from '@/lib/s3';
import { compressImage, burnGeoOverlay, getImageMetadata } from '@/lib/image-compression';
import { reverseGeocode, formatLocationForBurn } from '@/lib/geocode';
import { haversineMeters } from '@/lib/patrol-helpers';
import { logError } from '@/lib/safe-log';

export const maxDuration = 60;

function istDateAndTime(at: Date = new Date()) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const patrolSession = db.prepare(`
    SELECT ps.*, pa.photo_interval_meters
    FROM patrol_sessions ps
    LEFT JOIN patrol_assignments pa ON ps.assignment_id = pa.id
    WHERE ps.id = ?
  `).get(id) as {
    patroller_email: string; status: string; route_id: string; photo_count: number; total_distance_meters: number; photo_interval_meters: number;
  } | undefined;

  if (!patrolSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.role === 'Patroller' && patrolSession.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (patrolSession.status !== 'active') {
    return NextResponse.json({ error: 'Session not active' }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const latRaw = formData.get('latitude') as string;
    const lngRaw = formData.get('longitude') as string;
    const accuracyRaw = formData.get('accuracy') as string;

    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
    if (!latRaw || !lngRaw) return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 });

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // Distance from last patrol photo
    const lastPhoto = db.prepare(
      'SELECT latitude, longitude, cumulative_distance FROM patrol_photos WHERE session_id = ? ORDER BY id DESC LIMIT 1'
    ).get(id) as { latitude: number; longitude: number; cumulative_distance: number } | undefined;

    const distFromLast = lastPhoto ? haversineMeters(lastPhoto.latitude, lastPhoto.longitude, lat, lng) : 0;
    const cumDist = patrolSession.total_distance_meters;

    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    let compressed = await compressImage(buffer, { quality: 85 });
    const metadata = await getImageMetadata(compressed);

    if (Number.isFinite(lat) && Number.isFinite(lng) && metadata.width && metadata.height) {
      const { place, state } = await reverseGeocode(lat, lng);
      const locationBurn = formatLocationForBurn(place, state);
      const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' }) + ' IST';
      compressed = await burnGeoOverlay(compressed, {
        width: metadata.width, height: metadata.height,
        latitude: lat, longitude: lng,
        accuracy: accuracyRaw ? parseFloat(accuracyRaw) : undefined,
        timestamp, location: locationBurn ?? undefined,
      });
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const key = `patrol-photos/${patrolSession.route_id}/${id}/${istDateAndTime()}.${ext}`;
    const s3Url = await uploadToS3(key, compressed, `image/${metadata.format ?? 'jpeg'}`);

    const result = db.prepare(`
      INSERT INTO patrol_photos (session_id, patroller_email, s3_key, s3_url, latitude, longitude, accuracy, distance_from_last_photo, cumulative_distance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, session.user.email, key, s3Url, lat, lng, accuracyRaw ? parseFloat(accuracyRaw) : null, distFromLast, cumDist);

    db.prepare('UPDATE patrol_sessions SET photo_count = photo_count + 1 WHERE id = ?').run(id);

    const photo = db.prepare('SELECT * FROM patrol_photos WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ photo }, { status: 201 });
  } catch (err) {
    logError('patrol photo upload', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const patrolSession = db.prepare('SELECT patroller_email FROM patrol_sessions WHERE id = ?').get(id) as { patroller_email: string } | undefined;
  if (!patrolSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.role === 'Patroller' && patrolSession.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const photos = db.prepare('SELECT * FROM patrol_photos WHERE session_id = ? ORDER BY id ASC').all(id);
  return NextResponse.json({ photos });
}
