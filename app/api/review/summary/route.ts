import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = query(
      `SELECT ps.route_id, ps.subsection_id, r.route_name, s.subsection_name,
        SUM(CASE WHEN ps.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN ps.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN ps.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
       FROM photo_submissions ps
       LEFT JOIN routes r ON ps.route_id = r.route_id
       LEFT JOIN subsections s ON ps.route_id = s.route_id AND ps.subsection_id = s.subsection_id
       GROUP BY ps.route_id, ps.subsection_id
       ORDER BY r.route_name, s.subsection_name`,
      []
    );
    return NextResponse.json({ summary: result.rows });
  } catch (error: unknown) {
    console.error('Review summary error:', error);
    return NextResponse.json({ summary: [], error: (error as Error).message }, { status: 200 });
  }
}
