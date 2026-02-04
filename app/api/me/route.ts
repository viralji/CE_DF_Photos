import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let maxCaptureDistanceMeters: number | null = null;
    let maxGpsAccuracyMeters: number | null = null;
    try {
      const db = getDb();
      const distRow = db.prepare("SELECT value FROM app_settings WHERE key = 'max_capture_distance_meters'").get() as { value: string } | undefined;
      if (distRow?.value != null && distRow.value !== '') {
        const n = Number(distRow.value);
        if (Number.isFinite(n) && n > 0) maxCaptureDistanceMeters = Math.floor(n);
      } else {
        const legacyRow = db.prepare("SELECT value FROM app_settings WHERE key = 'capture_distance_check_enabled'").get() as { value: string } | undefined;
        if (legacyRow?.value === '1') maxCaptureDistanceMeters = 40;
      }
      const accRow = db.prepare("SELECT value FROM app_settings WHERE key = 'max_gps_accuracy_meters'").get() as { value: string } | undefined;
      if (accRow?.value != null && accRow.value !== '') {
        const n = Number(accRow.value);
        if (Number.isFinite(n) && n > 0) maxGpsAccuracyMeters = Math.floor(n);
      }
    } catch {
      // app_settings may not exist yet
    }
    return NextResponse.json({
      user: { email: session.user.email, name: session.user.name ?? null },
      role: session.role,
      captureDistanceCheckEnabled: maxCaptureDistanceMeters != null,
      maxCaptureDistanceMeters,
      maxGpsAccuracyMeters,
    });
  } catch (error: unknown) {
    console.error('Error in /api/me:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
