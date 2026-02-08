import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { logError } from '@/lib/safe-log';
import { query, buildAllowedKeysFilter } from '@/lib/db';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

/** Lightweight count for dashboard badge. Avoids fetching 500 photo rows. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    if (allowedKeys.size === 0) {
      return NextResponse.json({ count: 0 });
    }
    const keys = [...allowedKeys];
    const { whereClause, params } = buildAllowedKeysFilter(keys, '');
    const fullParams: unknown[] = [...params];
    const whereClauses = [whereClause, 'id NOT IN (SELECT resubmission_of_id FROM photo_submissions WHERE resubmission_of_id IS NOT NULL)'];
    const result = query(
      'SELECT COUNT(*) AS count FROM photo_submissions WHERE ' + whereClauses.join(' AND '),
      fullParams
    );
    const count = Number((result.rows[0] as { count: number })?.count ?? 0);
    return NextResponse.json({ count });
  } catch (error: unknown) {
    logError('Photo count', error);
    return NextResponse.json({ count: 0, error: (error as Error).message }, { status: 500 });
  }
}
