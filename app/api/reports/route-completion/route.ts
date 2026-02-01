import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

/**
 * For each route: expected photos = (number of subsections) × (number of checkpoints).
 * Uploaded = count of photo_submissions for that route.
 * % completion = min(100, (uploaded / expected) * 100).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const checkpointCount =
      (query('SELECT COUNT(*) as c FROM checkpoints', []).rows[0] as { c: number })?.c ?? 0;

    const routeSubsections = query(
      `SELECT r.route_id, r.route_name, COUNT(DISTINCT s.subsection_id) as subsection_count
       FROM routes r
       LEFT JOIN subsections s ON r.route_id = s.route_id
       GROUP BY r.route_id, r.route_name
       ORDER BY r.route_name`,
      []
    ).rows as { route_id: string; route_name: string; subsection_count: number }[];

    const uploadedByRoute = query(
      `SELECT route_id, COUNT(*) as uploaded
       FROM photo_submissions
       GROUP BY route_id`,
      []
    ).rows as { route_id: string; uploaded: number }[];

    const uploadedMap = new Map(uploadedByRoute.map((r) => [r.route_id, r.uploaded]));

    const routes = routeSubsections.map((r) => {
      const expected = r.subsection_count * checkpointCount;
      const uploaded = uploadedMap.get(r.route_id) ?? 0;
      const percentage =
        expected > 0 ? Math.min(100, Math.round((uploaded / expected) * 100)) : 0;
      return {
        route_id: r.route_id,
        route_name: r.route_name || `Route ${r.route_id}`,
        subsection_count: r.subsection_count,
        expected_photos: expected,
        uploaded_photos: uploaded,
        percentage,
      };
    });

    return NextResponse.json({ routes });
  } catch (error: unknown) {
    console.error('Route completion error:', error);
    return NextResponse.json(
      { routes: [], error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 200 }
    );
  }
}
