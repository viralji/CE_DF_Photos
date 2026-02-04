import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Only Admin can update settings' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const db = getDb();
    const out: { captureDistanceCheckEnabled?: boolean; maxCaptureDistanceMeters?: number | null; maxGpsAccuracyMeters?: number | null } = {};
    if (body.hasOwnProperty('maxCaptureDistanceMeters')) {
      const raw = body.maxCaptureDistanceMeters;
      if (raw !== null && raw !== undefined) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json({ error: 'maxCaptureDistanceMeters must be a positive number or null' }, { status: 400 });
        }
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES ('max_capture_distance_meters', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run(String(n));
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES ('capture_distance_check_enabled', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run();
        out.maxCaptureDistanceMeters = n;
        out.captureDistanceCheckEnabled = true;
      } else {
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES ('max_capture_distance_meters', '') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run();
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES ('capture_distance_check_enabled', '0') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run();
        out.maxCaptureDistanceMeters = null;
        out.captureDistanceCheckEnabled = false;
      }
    }
    if (body.hasOwnProperty('maxGpsAccuracyMeters')) {
      const raw = body.maxGpsAccuracyMeters;
      if (raw !== null && raw !== undefined) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json({ error: 'maxGpsAccuracyMeters must be a positive number or null' }, { status: 400 });
        }
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES ('max_gps_accuracy_meters', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run(String(n));
        out.maxGpsAccuracyMeters = n;
      } else {
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES ('max_gps_accuracy_meters', '') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run();
        out.maxGpsAccuracyMeters = null;
      }
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: 'Provide maxCaptureDistanceMeters and/or maxGpsAccuracyMeters' }, { status: 400 });
    }
    return NextResponse.json(out);
  } catch (error: unknown) {
    console.error('Error in PATCH /api/settings:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
