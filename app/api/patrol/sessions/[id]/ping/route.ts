import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { haversineMeters } from '@/lib/patrol-helpers';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { latitude, longitude, accuracy } = body;

  if (latitude == null || longitude == null) {
    return NextResponse.json({ error: 'latitude and longitude required' }, { status: 400 });
  }

  const db = getDb();
  const patrolSession = db.prepare('SELECT * FROM patrol_sessions WHERE id = ?').get(id) as {
    patroller_email: string; status: string; total_distance_meters: number;
  } | undefined;

  if (!patrolSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.role === 'Patroller' && patrolSession.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (patrolSession.status !== 'active') {
    return NextResponse.json({ error: 'Session not active' }, { status: 400 });
  }

  const lastPing = db.prepare(
    'SELECT latitude, longitude, cumulative_distance FROM patrol_location_pings WHERE session_id = ? ORDER BY id DESC LIMIT 1'
  ).get(id) as { latitude: number; longitude: number; cumulative_distance: number } | undefined;

  const distFromLast = lastPing
    ? haversineMeters(lastPing.latitude, lastPing.longitude, latitude, longitude)
    : 0;
  const cumulative = (lastPing?.cumulative_distance ?? 0) + distFromLast;

  db.prepare(`
    INSERT INTO patrol_location_pings (session_id, latitude, longitude, accuracy, distance_from_last, cumulative_distance)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, latitude, longitude, accuracy ?? null, distFromLast, cumulative);

  // Update session total distance
  db.prepare('UPDATE patrol_sessions SET total_distance_meters = ? WHERE id = ?').run(cumulative, id);

  return NextResponse.json({ cumulative_distance: cumulative, distance_from_last: distFromLast });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const patrolSession = db.prepare('SELECT patroller_email FROM patrol_sessions WHERE id = ?').get(id) as {
    patroller_email: string;
  } | undefined;
  if (!patrolSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.role === 'Patroller' && patrolSession.patroller_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pings = db.prepare(
    'SELECT id, latitude, longitude, accuracy, distance_from_last, cumulative_distance, recorded_at FROM patrol_location_pings WHERE session_id = ? ORDER BY id ASC'
  ).all(id);

  return NextResponse.json({ pings });
}
