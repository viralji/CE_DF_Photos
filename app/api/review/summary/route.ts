import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (allowedKeys.size === 0) {
      return NextResponse.json({ summary: [] });
    }
    const placeholders = [...allowedKeys].map(() => '(ps.route_id = ? AND ps.subsection_id = ?)').join(' OR ');
    const keyParams = [...allowedKeys].flatMap((k) => k.split('::'));
    const result = query(
      `SELECT ps.route_id, ps.subsection_id, r.route_name, s.subsection_name,
        SUM(CASE WHEN ps.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN ps.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN ps.status = 'qc_required' THEN 1 ELSE 0 END) as qc_required_count,
        SUM(CASE WHEN ps.status = 'nc' THEN 1 ELSE 0 END) as nc_count
       FROM photo_submissions ps
       LEFT JOIN routes r ON ps.route_id = r.route_id
       LEFT JOIN subsections s ON ps.route_id = s.route_id AND ps.subsection_id = s.subsection_id
       WHERE ${placeholders}
       GROUP BY ps.route_id, ps.subsection_id
       ORDER BY r.route_name, s.subsection_name`,
      keyParams
    );
    return NextResponse.json({ summary: result.rows });
  } catch (error: unknown) {
    console.error('Review summary error:', error);
    return NextResponse.json({ summary: [], error: (error as Error).message }, { status: 200 });
  }
}
