import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';

// PUT: activate a specific prompt version by id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const { id } = await params;
    const versionId = parseInt(id, 10);
    if (!versionId || Number.isNaN(versionId)) {
      return NextResponse.json({ error: 'Invalid version ID' }, { status: 400 });
    }
    const db = getDb();
    const exists = db.prepare('SELECT 1 FROM ai_prompt_versions WHERE id = ?').get(versionId);
    if (!exists) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    db.prepare('UPDATE ai_prompt_versions SET is_active = 0').run();
    db.prepare('UPDATE ai_prompt_versions SET is_active = 1 WHERE id = ?').run(versionId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logError('ai-config activate', error);
    return NextResponse.json({ error: 'Failed to activate version' }, { status: 500 });
  }
}
