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
      'SELECT DISTINCT entity FROM checkpoints WHERE entity IS NOT NULL AND entity != "" ORDER BY entity',
      []
    );
    const entities = (result.rows as { entity: string }[]).map((r) => r.entity);
    return NextResponse.json({ entities });
  } catch (error: unknown) {
    console.error('Error fetching entities:', error);
    return NextResponse.json({ entities: [], error: (error as Error).message }, { status: 200 });
  }
}
