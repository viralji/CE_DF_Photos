import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';

// GET: return all prompt versions (newest first)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const db = getDb();
    const versions = db
      .prepare(
        `SELECT id, version, system_context, scoring_guide, is_active, notes, created_at, created_by
         FROM ai_prompt_versions
         ORDER BY version DESC`
      )
      .all();
    return NextResponse.json({ versions });
  } catch (error: unknown) {
    logError('ai-config GET', error);
    return NextResponse.json({ error: 'Failed to load prompt versions' }, { status: 500 });
  }
}

// POST: save a new prompt version (optionally activate it immediately)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const body = (await request.json()) as {
      system_context?: string;
      scoring_guide?: string;
      notes?: string;
      activate?: boolean;
    };
    const { system_context, scoring_guide, notes, activate } = body;
    if (!system_context?.trim() || !scoring_guide?.trim()) {
      return NextResponse.json({ error: 'system_context and scoring_guide are required' }, { status: 400 });
    }
    const db = getDb();
    const maxRow = db
      .prepare('SELECT MAX(version) as v FROM ai_prompt_versions')
      .get() as { v: number | null };
    const newVersion = (maxRow.v ?? 0) + 1;

    if (activate) {
      db.prepare('UPDATE ai_prompt_versions SET is_active = 0').run();
    }

    const result = db
      .prepare(
        `INSERT INTO ai_prompt_versions (version, system_context, scoring_guide, is_active, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        newVersion,
        system_context.trim(),
        scoring_guide.trim(),
        activate ? 1 : 0,
        notes?.trim() || null,
        session.user.email
      );

    return NextResponse.json({ id: result.lastInsertRowid, version: newVersion, is_active: activate ? 1 : 0 });
  } catch (error: unknown) {
    logError('ai-config POST', error);
    return NextResponse.json({ error: 'Failed to save prompt version' }, { status: 500 });
  }
}
