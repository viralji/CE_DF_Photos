import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { uploadToS3 } from '@/lib/s3';
import { compressImage, burnGeoOverlay, getImageMetadata } from '@/lib/image-compression';
import { reverseGeocode, formatLocationForBurn } from '@/lib/geocode';
import { sendFlagAlert } from '@/lib/email';
import { logError } from '@/lib/safe-log';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const patrolSession = db.prepare(`
    SELECT ps.*, r.route_name
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    WHERE ps.id = ?
  `).get(id) as { patroller_email: string; status: string; route_id: string; route_name: string } | undefined;

  if (!patrolSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.role === 'Patroller' && patrolSession.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (patrolSession.status !== 'active') {
    return NextResponse.json({ error: 'Session not active' }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const description = (formData.get('description') as string)?.trim();
    const severityRaw = (formData.get('severity') as string) ?? 'medium';
    const severity = ['low', 'medium', 'high'].includes(severityRaw) ? severityRaw : 'medium';
    const latRaw = formData.get('latitude') as string;
    const lngRaw = formData.get('longitude') as string;
    const accuracyRaw = formData.get('accuracy') as string;
    const file = formData.get('file') as File | null;

    if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 });
    if (!latRaw || !lngRaw) return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 });

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    let s3Key: string | null = null;
    let s3Url: string | null = null;

    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);
      let compressed = await compressImage(buffer, { quality: 85 });
      const metadata = await getImageMetadata(compressed);

      if (Number.isFinite(lat) && metadata.width && metadata.height) {
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
      const now = Date.now();
      s3Key = `patrol-flags/${patrolSession.route_id}/${id}/${now}.${ext}`;
      s3Url = await uploadToS3(s3Key, compressed, `image/${metadata.format ?? 'jpeg'}`);
    }

    const flagResult = db.prepare(`
      INSERT INTO patrol_flags (session_id, patroller_email, route_id, latitude, longitude, accuracy, severity, description, s3_key, s3_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, session.user.email, patrolSession.route_id, lat, lng, accuracyRaw ? parseFloat(accuracyRaw) : null, severity, description, s3Key, s3Url);

    const flagId = Number(flagResult.lastInsertRowid);
    db.prepare('UPDATE patrol_sessions SET flag_count = flag_count + 1 WHERE id = ?').run(id);

    // Create in-app notifications for all admins
    const admins = db.prepare("SELECT email, name FROM users WHERE role = 'Admin'").all() as { email: string; name: string | null }[];
    const managerEmails: string[] = admins.map((a) => a.email);
    for (const admin of admins) {
      db.prepare('INSERT INTO manager_notifications (flag_id, manager_email) VALUES (?, ?)').run(flagId, admin.email);
    }

    const flag = db.prepare('SELECT * FROM patrol_flags WHERE id = ?').get(flagId);
    const patroller = db.prepare('SELECT name FROM users WHERE email = ?').get(session.user.email) as { name: string | null } | undefined;

    // Fire-and-forget email alert
    sendFlagAlert({
      flagId,
      patrollerName: patroller?.name ?? session.user.email,
      patrollerEmail: session.user.email,
      routeName: patrolSession.route_name ?? patrolSession.route_id,
      severity,
      description,
      latitude: lat,
      longitude: lng,
      flagPhotoUrl: s3Url,
      createdAt: new Date().toISOString(),
    }, managerEmails).catch((err) => logError('flag email', err));

    return NextResponse.json({ flag }, { status: 201 });
  } catch (err) {
    logError('patrol flag', err);
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

  const flags = db.prepare('SELECT * FROM patrol_flags WHERE session_id = ? ORDER BY id ASC').all(id);
  return NextResponse.json({ flags });
}
