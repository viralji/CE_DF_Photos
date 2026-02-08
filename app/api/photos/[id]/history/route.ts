import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { getAllowedSubsectionKeys } from '@/lib/subsection-access';

type PhotoHistoryEntry = {
  id: number;
  route_id: string;
  subsection_id: string;
  checkpoint_id: number | null;
  execution_stage: string;
  photo_type_number: number | null;
  photo_category: string | null;
  status: string;
  created_at: string;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
  reviewer_id: number | null;
  reviewer_email: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  route_name: string | null;
  subsection_name: string | null;
  entity: string | null;
  checkpoint_name: string | null;
  resubmission_of_id: number | null;
  comments: Array<{
    id: number;
    author_email: string;
    author_name: string | null;
    created_at: string;
    comment_text: string;
  }>;
};

function checkPhotoAccess(photoId: number, email: string, role: string): { route_id: string; subsection_id: string } | null {
  const result = query('SELECT route_id, subsection_id FROM photo_submissions WHERE id = ?', [photoId]);
  const row = result.rows[0] as { route_id: string; subsection_id: string } | undefined;
  if (!row) return null;
  const allowedKeys = getAllowedSubsectionKeys(email, role);
  const key = `${row.route_id}::${row.subsection_id}`;
  return allowedKeys.has(key) ? row : null;
}

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
    if (isNaN(photoId)) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 });
    }

    // Check access to the starting photo
    const access = checkPhotoAccess(photoId, session.user.email, session.role);
    if (!access) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 });
    }

    // Walk backwards through the resubmission chain
    const history: PhotoHistoryEntry[] = [];
    const visited = new Set<number>();
    let currentId: number | null = photoId;
    const MAX_DEPTH = 20; // Prevent infinite loops

    while (currentId !== null && history.length < MAX_DEPTH) {
      // Prevent circular references
      if (visited.has(currentId)) {
        break; // circular reference
        break;
      }
      visited.add(currentId);

      // Fetch photo details
      const photoResult = query(
        `SELECT 
          ps.id, ps.route_id, ps.subsection_id, ps.checkpoint_id, ps.execution_stage,
          ps.photo_type_number, ps.photo_category, ps.status, ps.created_at,
          ps.user_id, ps.reviewer_id, ps.reviewed_at, ps.resubmission_of_id,
          r.route_name, s.subsection_name, e.name AS entity, c.checkpoint_name,
          u.email as user_email, u.name as user_name,
          rev.email as reviewer_email, rev.name as reviewer_name
         FROM photo_submissions ps
         LEFT JOIN routes r ON CAST(ps.route_id AS TEXT) = r.route_id
         LEFT JOIN subsections s ON CAST(ps.route_id AS TEXT) = s.route_id AND CAST(ps.subsection_id AS TEXT) = s.subsection_id
         LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id
         LEFT JOIN entities e ON c.entity_id = e.id
         LEFT JOIN users u ON ps.user_id = u.id
         LEFT JOIN users rev ON ps.reviewer_id = rev.id
         WHERE ps.id = ?`,
        [currentId]
      );

      const photoRow = photoResult.rows[0] as PhotoHistoryEntry | undefined;
      if (!photoRow) {
        // Photo not found (maybe deleted), skip
        break;
      }

      // Verify access to this photo in the chain
      const chainAccess = checkPhotoAccess(currentId, session.user.email, session.role);
      if (!chainAccess) {
        // User doesn't have access to this photo in the chain, stop here
        break;
      }

      // Fetch comments for this photo
      const commentsResult = query(
        'SELECT id, author_email, author_name, created_at, comment_text FROM photo_submission_comments WHERE photo_submission_id = ? ORDER BY created_at ASC',
        [currentId]
      );

      const comments = (commentsResult.rows ?? []).map((c: unknown) => {
        const x = c as { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string };
        return {
          id: x.id,
          author_email: x.author_email,
          author_name: x.author_name,
          created_at: x.created_at,
          comment_text: x.comment_text,
        };
      });

      history.push({ ...photoRow, comments });

      // Move to the previous photo in the chain
      currentId = photoRow.resubmission_of_id;
    }

    // Return history ordered oldest to newest (reverse the array)
    const orderedHistory = history.reverse();

    return NextResponse.json({ history: orderedHistory, count: orderedHistory.length });
  } catch (error: unknown) {
    logError('Photo history', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
