import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { scorePhoto } from '@/lib/ai-scoring';
import { logError } from '@/lib/safe-log';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (!photoId || Number.isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }
    const db = getDb();
    const row = db
      .prepare(
        'SELECT score, confidence, issues, positives, summary, status, error, created_at FROM photo_ai_scores WHERE photo_submission_id = ?'
      )
      .get(photoId) as {
        score: number | null;
        confidence: string | null;
        issues: string | null;
        positives: string | null;
        summary: string | null;
        status: string;
        error: string | null;
        created_at: string;
      } | undefined;

    if (!row) {
      return NextResponse.json({ status: 'not_scored' });
    }

    return NextResponse.json({
      status: row.status,
      score: row.score,
      confidence: row.confidence,
      issues: row.issues ? (JSON.parse(row.issues) as string[]) : [],
      positives: row.positives ? (JSON.parse(row.positives) as string[]) : [],
      summary: row.summary,
      scored_at: row.created_at,
    });
  } catch (error: unknown) {
    logError('Score GET', error);
    return NextResponse.json({ error: 'Failed to get score' }, { status: 500 });
  }
}

// Admin-only: re-trigger scoring for a photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const { id } = await params;
    const photoId = parseInt(id, 10);
    if (!photoId || Number.isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 });
    }
    const db = getDb();
    db.prepare(
      'INSERT OR REPLACE INTO photo_ai_scores (photo_submission_id, status) VALUES (?, ?)'
    ).run(photoId, 'pending');
    scorePhoto(photoId).catch((err) =>
      console.error('[AI scoring] re-trigger failed for photo', photoId, err)
    );
    return NextResponse.json({ status: 'pending' });
  } catch (error: unknown) {
    logError('Score POST', error);
    return NextResponse.json({ error: 'Failed to trigger scoring' }, { status: 500 });
  }
}
