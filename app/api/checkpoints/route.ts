import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = query('SELECT * FROM checkpoints ORDER BY entity, checkpoint_name', []);
    return NextResponse.json({ checkpoints: result.rows });
  } catch (error: unknown) {
    console.error('Error fetching checkpoints:', error);
    return NextResponse.json({ checkpoints: [], error: (error as Error).message }, { status: 200 });
  }
}
