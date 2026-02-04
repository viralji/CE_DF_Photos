import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

/** Lightweight count for dashboard badge. Avoids fetching 500 photo rows. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const allowedKeys = getAllowedSubsectionKeys(session.user.email, session.role);
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    if (allowedKeys.size > 0) {
      const keyConditions = [...allowedKeys].map((k) => {
        const [r, s] = k.split('::');
        params.push(r, s);
        return '(route_id = ? AND subsection_id = ?)';
      });
      whereClauses.push('(' + keyConditions.join(' OR ') + ')');
    } else {
      return NextResponse.json({ count: 0 });
    }
    whereClauses.push('id NOT IN (SELECT resubmission_of_id FROM photo_submissions WHERE resubmission_of_id IS NOT NULL)');
    const whereClause = 'WHERE ' + whereClauses.join(' AND ');
    const result = query(
      'SELECT COUNT(*) AS count FROM photo_submissions ' + whereClause,
      params
    );
    const count = Number((result.rows[0] as { count: number })?.count ?? 0);
    return NextResponse.json({ count });
  } catch (error: unknown) {
    console.error('Error fetching photo count:', error);
    return NextResponse.json({ count: 0, error: (error as Error).message }, { status: 500 });
  }
}
