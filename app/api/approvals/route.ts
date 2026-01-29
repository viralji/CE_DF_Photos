import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { photoId, action } = body;
    if (!photoId || !action) {
      return NextResponse.json({ error: 'photoId and action required' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }
    const db = getDb();
    const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(session.user.email) as { id: number } | undefined;
    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 400 });
    const status = action === 'approve' ? 'approved' : 'rejected';
    db.prepare('UPDATE photo_submissions SET status = ?, reviewer_id = ?, reviewed_at = ? WHERE id = ?').run(status, userRow.id, new Date().toISOString(), photoId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Approval error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
