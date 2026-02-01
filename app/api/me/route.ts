import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({
      user: { email: session.user.email, name: session.user.name ?? null },
      role: session.role,
    });
  } catch (error: unknown) {
    console.error('Error in /api/me:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
