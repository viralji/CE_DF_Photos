import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query, buildAllowedKeysFilter } from '@/lib/db';
import { logError } from '@/lib/safe-log';
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

    // Admin: simple query, no key filter (avoids huge OR / temp table)
    if (session.role === 'Admin') {
      const result = query(
        `SELECT ps.route_id, ps.subsection_id, r.route_name, s.subsection_name,
          SUM(CASE WHEN ps.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN ps.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN ps.status = 'qc_required' THEN 1 ELSE 0 END) as qc_required_count,
          SUM(CASE WHEN ps.status = 'nc' THEN 1 ELSE 0 END) as nc_count
         FROM (
           SELECT * FROM photo_submissions
           WHERE id NOT IN (SELECT resubmission_of_id FROM photo_submissions WHERE resubmission_of_id IS NOT NULL)
         ) ps
         LEFT JOIN routes r ON CAST(ps.route_id AS TEXT) = r.route_id
         LEFT JOIN subsections s ON CAST(ps.route_id AS TEXT) = s.route_id AND CAST(ps.subsection_id AS TEXT) = s.subsection_id
         GROUP BY ps.route_id, ps.subsection_id
         ORDER BY r.route_name, s.route_id, s.subsection_id`,
        []
      );
      return NextResponse.json({ summary: result.rows });
    }

    // Non-Admin: only subsections allowed per subsection email setup (subsection_allowed_emails)
    const keys = [...allowedKeys];
    const { whereClause, params } = buildAllowedKeysFilter(keys, 'ps.');
    const result = query(
      `SELECT ps.route_id, ps.subsection_id, r.route_name, s.subsection_name,
        SUM(CASE WHEN ps.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN ps.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN ps.status = 'qc_required' THEN 1 ELSE 0 END) as qc_required_count,
        SUM(CASE WHEN ps.status = 'nc' THEN 1 ELSE 0 END) as nc_count
       FROM (
         SELECT * FROM photo_submissions
         WHERE id NOT IN (SELECT resubmission_of_id FROM photo_submissions WHERE resubmission_of_id IS NOT NULL)
       ) ps
       LEFT JOIN routes r ON CAST(ps.route_id AS TEXT) = r.route_id
       LEFT JOIN subsections s ON CAST(ps.route_id AS TEXT) = s.route_id AND CAST(ps.subsection_id AS TEXT) = s.subsection_id
       WHERE ${whereClause}
       GROUP BY ps.route_id, ps.subsection_id
       ORDER BY r.route_name, s.route_id, s.subsection_id`,
      params
    );
    return NextResponse.json({ summary: result.rows });
  } catch (error: unknown) {
    logError('Review summary', error);
    return NextResponse.json({ summary: [], error: (error as Error).message }, { status: 200 });
  }
}
