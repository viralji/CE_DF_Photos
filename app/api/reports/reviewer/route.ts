import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { limitLength, MAX_ROUTE_SUBSECTION_ID_LENGTH } from '@/lib/sanitize';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role === 'Engineer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const routeIdRaw = searchParams.get('routeId');
    const routeId = routeIdRaw ? limitLength(routeIdRaw, MAX_ROUTE_SUBSECTION_ID_LENGTH) || null : null;
    const dateFrom = searchParams.get('dateFrom') || null;
    const dateTo = searchParams.get('dateTo') || null;

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (routeId) {
      whereClauses.push('CAST(ps.route_id AS TEXT) = ?');
      params.push(routeId);
    }
    if (dateFrom) {
      whereClauses.push("DATE(ps.created_at) >= ?");
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClauses.push("DATE(ps.created_at) <= ?");
      params.push(dateTo);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const db = getDb();
    const rows = db.prepare(`
      SELECT
        COALESCE(u.name, u.email, 'Unknown') AS engineer_name,
        u.email AS engineer_email,
        CAST(ps.route_id AS TEXT) AS route_id,
        r.route_name,
        s.subsection_name,
        s.length AS subsection_length,
        e.name AS entity_name,
        c.checkpoint_name,
        COUNT(ps.id) AS total_photos,
        MIN(DATE(ps.created_at)) AS first_capture_date,
        MAX(DATE(ps.created_at)) AS last_capture_date,
        SUM(CASE WHEN ps.status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN ps.status = 'qc_required' THEN 1 ELSE 0 END) AS qc_count,
        SUM(CASE WHEN ps.status = 'nc' THEN 1 ELSE 0 END) AS nc_count,
        ROUND(AVG(CASE WHEN ai.status = 'done' THEN CAST(ai.score AS REAL) END), 0) AS avg_ai_score
      FROM photo_submissions ps
      LEFT JOIN routes r ON CAST(ps.route_id AS TEXT) = r.route_id
      LEFT JOIN subsections s ON CAST(ps.route_id AS TEXT) = s.route_id AND CAST(ps.subsection_id AS TEXT) = s.subsection_id
      LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id
      LEFT JOIN entities e ON c.entity_id = e.id
      LEFT JOIN users u ON ps.user_id = u.id
      LEFT JOIN photo_ai_scores ai ON ai.photo_submission_id = ps.id
      ${whereClause}
      GROUP BY ps.user_id, CAST(ps.route_id AS TEXT), CAST(ps.subsection_id AS TEXT), ps.checkpoint_id
      ORDER BY r.route_name, s.subsection_name, e.name, c.checkpoint_name, engineer_name
    `).all(...params);

    return NextResponse.json({ rows });
  } catch (error: unknown) {
    logError('Reviewer report GET', error);
    return NextResponse.json({ rows: [], error: (error as Error).message }, { status: 500 });
  }
}
