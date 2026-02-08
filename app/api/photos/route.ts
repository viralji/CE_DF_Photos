import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query, buildAllowedKeysFilter } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { limitLength, MAX_ROUTE_SUBSECTION_ID_LENGTH } from '@/lib/sanitize';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const routeIdRaw = searchParams.get('routeId');
    const subsectionIdRaw = searchParams.get('subsectionId');
    const routeId = routeIdRaw ? limitLength(routeIdRaw, MAX_ROUTE_SUBSECTION_ID_LENGTH) || null : null;
    const subsectionId = subsectionIdRaw ? limitLength(subsectionIdRaw, MAX_ROUTE_SUBSECTION_ID_LENGTH) || null : null;
    const status = searchParams.get('status');
    const latestPerSlot = searchParams.get('latestPerSlot') !== 'false';
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit), 500);
    const offset = Math.max(0, Number.isNaN(rawOffset) ? 0 : rawOffset);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (session.role === 'Admin') {
      if (routeId) { whereClauses.push('ps.route_id = ?'); params.push(routeId); }
      if (subsectionId) { whereClauses.push('ps.subsection_id = ?'); params.push(subsectionId); }
    } else {
      const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
      if (allowedKeys.size === 0) {
        return NextResponse.json({ photos: [] });
      }
      const subsectionKey = routeId && subsectionId ? `${routeId}::${subsectionId}` : null;
      if (subsectionKey != null && allowedKeys.has(subsectionKey)) {
        whereClauses.push('ps.route_id = ?');
        whereClauses.push('ps.subsection_id = ?');
        params.push(routeId, subsectionId);
      } else {
        const keys = [...allowedKeys];
        const { whereClause, params: keyParams } = buildAllowedKeysFilter(keys, 'ps.');
        whereClauses.push(whereClause);
        params.push(...keyParams);
        if (routeId) { whereClauses.push('ps.route_id = ?'); params.push(routeId); }
        if (subsectionId) { whereClauses.push('ps.subsection_id = ?'); params.push(subsectionId); }
      }
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) { whereClauses.push('ps.status = ?'); params.push(statuses[0]); }
      else if (statuses.length > 1) { whereClauses.push('ps.status IN (' + statuses.map(() => '?').join(',') + ')'); params.push(...statuses); }
    }
    if (latestPerSlot) {
      whereClauses.push('ps.id NOT IN (SELECT resubmission_of_id FROM photo_submissions WHERE resubmission_of_id IS NOT NULL)');
    }
    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    params.push(limit, offset);
    const result = query(
      'SELECT ps.*, r.route_name, s.subsection_name, e.name AS entity, c.checkpoint_name, u.email as user_email, u.name as user_name, rev.email as reviewer_email, rev.name as reviewer_name FROM photo_submissions ps LEFT JOIN routes r ON CAST(ps.route_id AS TEXT) = r.route_id LEFT JOIN subsections s ON CAST(ps.route_id AS TEXT) = s.route_id AND CAST(ps.subsection_id AS TEXT) = s.subsection_id LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id LEFT JOIN entities e ON c.entity_id = e.id LEFT JOIN users u ON ps.user_id = u.id LEFT JOIN users rev ON ps.reviewer_id = rev.id ' + whereClause + ' ORDER BY ps.created_at DESC LIMIT ? OFFSET ?',
      params
    );
    // Normalize status to lowercase key so client always gets it (SQLite may return STATUS)
    const photos = (result.rows as Record<string, unknown>[]).map((row) => {
      const raw = row.status ?? row.STATUS ?? 'pending';
      const status = typeof raw === 'string' ? raw.toLowerCase() : 'pending';
      return { ...row, status };
    });
    return NextResponse.json({ photos });
  } catch (error: unknown) {
    logError('Photos GET', error);
    return NextResponse.json({ photos: [], error: (error as Error).message }, { status: 500 });
  }
}
