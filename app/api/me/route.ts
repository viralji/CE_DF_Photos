import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let captureDistanceCheckEnabled = true;
    let maxGpsAccuracyMeters: number | null = null;
    try {
      const db = getDb();
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'capture_distance_check_enabled'").get() as { value: string } | undefined;
      captureDistanceCheckEnabled = row?.value === '1';
      const accRow = db.prepare("SELECT value FROM app_settings WHERE key = 'max_gps_accuracy_meters'").get() as { value: string } | undefined;
      if (accRow?.value != null && accRow.value !== '') {
        const n = Number(accRow.value);
        if (Number.isFinite(n) && n > 0) maxGpsAccuracyMeters = Math.floor(n);
      }
    } catch {
      // app_settings may not exist yet; default to true
    }
    return NextResponse.json({
      user: { email: session.user.email, name: session.user.name ?? null },
      role: session.role,
      captureDistanceCheckEnabled,
      maxGpsAccuracyMeters,
    });
  } catch (error: unknown) {
    console.error('Error in /api/me:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
