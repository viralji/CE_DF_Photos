import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from './db';
import { getObjectFromS3 } from './s3';
import { logError } from './safe-log';

const PROMPT_VERSION = 2;
const MODEL = 'gemini-2.0-flash';

// Fallbacks if DB has no active prompt version yet
const DEFAULT_SYSTEM_CONTEXT =
  'You are a QC inspector for fiber optic cable installation projects in India. You are evaluating construction site photos for compliance with project specifications.';

const DEFAULT_SCORING_GUIDE =
  'Scoring guide:\n' +
  '- 90-100: Excellent, clearly meets all requirements\n' +
  '- 70-89: Good, only minor issues\n' +
  '- 50-69: Acceptable but notable issues\n' +
  '- 30-49: Poor, significant issues\n' +
  '- 0-29: Does not meet requirements\n\n' +
  'Confidence reflects image clarity: "high" if content is clearly visible, "medium" if somewhat unclear, "low" if very unclear or image quality prevents proper assessment.';

interface ScoreResult {
  score: number;
  confidence: 'high' | 'medium' | 'low';
  issues: string[];
  positives: string[];
  summary: string;
}

interface PromptVersion {
  system_context: string;
  scoring_guide: string;
}

interface FeedbackDecision {
  status: string;
  comment: string | null;
  reviewed_at: string;
}

export interface FeedbackData {
  totalReviewed: number;
  approvedCount: number;
  ncCount: number;
  qcRequiredCount: number;
  recentDecisions: FeedbackDecision[];
}

export interface BuildPromptParams {
  entityName: string;
  checkpointName: string;
  description: string | null;
  specs: string | null;
  photoSpec1: string | null;
  photoSpec2: string | null;
  photoSpec3: string | null;
  photoSpec4: string | null;
  systemContext: string;
  scoringGuide: string;
  feedback: FeedbackData;
}

function getActivePromptVersion(db: ReturnType<typeof getDb>): PromptVersion {
  try {
    const row = db
      .prepare(
        `SELECT system_context, scoring_guide FROM ai_prompt_versions WHERE is_active = 1 ORDER BY version DESC LIMIT 1`
      )
      .get() as { system_context: string; scoring_guide: string } | undefined;
    if (row) return row;
  } catch {
    // table not yet created — fall back to defaults
  }
  return { system_context: DEFAULT_SYSTEM_CONTEXT, scoring_guide: DEFAULT_SCORING_GUIDE };
}

/**
 * Aggregate ALL reviewer decisions for a checkpoint (not just those with comments).
 * Returns stats + last 20 decisions with optional comment text.
 */
function getFeedbackData(
  db: ReturnType<typeof getDb>,
  checkpointId: number,
  excludePhotoId: number
): FeedbackData {
  try {
    const stats = db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'nc'       THEN 1 ELSE 0 END) as nc,
          SUM(CASE WHEN status = 'qc_required' THEN 1 ELSE 0 END) as qc_required
        FROM photo_submissions
        WHERE checkpoint_id = ?
          AND status IN ('approved', 'nc', 'qc_required')
          AND reviewed_at IS NOT NULL
          AND id != ?`
      )
      .get(checkpointId, excludePhotoId) as {
        total: number;
        approved: number;
        nc: number;
        qc_required: number;
      };

    const decisions = db
      .prepare(
        `SELECT ps.status, ps.reviewed_at,
           (SELECT psc.comment_text
            FROM photo_submission_comments psc
            WHERE psc.photo_submission_id = ps.id
            ORDER BY psc.created_at DESC LIMIT 1) AS comment
         FROM photo_submissions ps
         WHERE ps.checkpoint_id = ?
           AND ps.status IN ('approved', 'nc', 'qc_required')
           AND ps.reviewed_at IS NOT NULL
           AND ps.id != ?
         ORDER BY ps.reviewed_at DESC
         LIMIT 20`
      )
      .all(checkpointId, excludePhotoId) as Array<{
        status: string;
        reviewed_at: string;
        comment: string | null;
      }>;

    return {
      totalReviewed: stats.total || 0,
      approvedCount: stats.approved || 0,
      ncCount: stats.nc || 0,
      qcRequiredCount: stats.qc_required || 0,
      recentDecisions: decisions,
    };
  } catch {
    return { totalReviewed: 0, approvedCount: 0, ncCount: 0, qcRequiredCount: 0, recentDecisions: [] };
  }
}

export function buildPrompt(params: BuildPromptParams): string {
  const specLines: string[] = [];
  if (params.description) specLines.push(`Description: ${params.description}`);
  if (params.specs) specLines.push(`Specifications: ${params.specs}`);
  if (params.photoSpec1) specLines.push(`Photo requirement 1: ${params.photoSpec1}`);
  if (params.photoSpec2) specLines.push(`Photo requirement 2: ${params.photoSpec2}`);
  if (params.photoSpec3) specLines.push(`Photo requirement 3: ${params.photoSpec3}`);
  if (params.photoSpec4) specLines.push(`Photo requirement 4: ${params.photoSpec4}`);

  let prompt = `${params.systemContext}\n\nCHECKPOINT BEING EVALUATED:\n`;
  prompt += `- Entity type: ${params.entityName}\n`;
  prompt += `- Checkpoint: ${params.checkpointName}\n`;
  if (specLines.length > 0) {
    prompt += specLines.join('\n') + '\n';
  } else {
    prompt += '(No specific specifications provided — evaluate general photo quality and relevance)\n';
  }

  const { totalReviewed, approvedCount, ncCount, qcRequiredCount, recentDecisions } = params.feedback;
  prompt += `\nREVIEWER HISTORY FOR THIS CHECKPOINT:\n`;
  if (totalReviewed > 0) {
    const approvalPct = Math.round((approvedCount / totalReviewed) * 100);
    prompt += `- Total reviewed: ${totalReviewed} photos | Approved: ${approvedCount} (${approvalPct}%) | NC: ${ncCount} | QC Required: ${qcRequiredCount}\n`;
    if (recentDecisions.length > 0) {
      prompt += `- Recent decisions (use these to calibrate your scoring):\n`;
      for (const d of recentDecisions) {
        const label =
          d.status === 'approved'
            ? 'APPROVED'
            : d.status === 'nc'
              ? 'NC (rejected)'
              : 'QC REQUIRED (needs retake)';
        const date = new Date(d.reviewed_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
        prompt += d.comment
          ? `  - ${label}: "${d.comment}" (${date})\n`
          : `  - ${label} [no comment] (${date})\n`;
      }
    }
  } else {
    prompt += `- No prior review history for this checkpoint yet.\n`;
  }

  prompt += `\nAnalyze the attached photo and evaluate whether it meets the requirements for this checkpoint.\n\n`;
  prompt += `Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):\n`;
  prompt += `{\n  "score": <integer 0-100>,\n  "confidence": "<high|medium|low>",\n  "issues": [<specific issues found, empty array if none>],\n  "positives": [<what the photo does well>],\n  "summary": "<one sentence summary>"\n}\n\n`;
  prompt += params.scoringGuide;

  return prompt;
}

/** Build the compiled prompt for a checkpoint without an actual photo (admin preview). */
export function buildPromptForPreview(checkpointId: number): string {
  const db = getDb();

  const checkpoint = db
    .prepare(
      `SELECT c.checkpoint_name, c.description, c.specs, c.execution_stage,
              c.photo_spec_1, c.photo_spec_2, c.photo_spec_3, c.photo_spec_4,
              e.name AS entity_name
       FROM checkpoints c
       LEFT JOIN entities e ON c.entity_id = e.id
       WHERE c.id = ?`
    )
    .get(checkpointId) as {
      checkpoint_name: string;
      description: string | null;
      specs: string | null;
      execution_stage: string;
      photo_spec_1: string | null;
      photo_spec_2: string | null;
      photo_spec_3: string | null;
      photo_spec_4: string | null;
      entity_name: string | null;
    } | undefined;

  if (!checkpoint) return 'Checkpoint not found.';

  const promptVersion = getActivePromptVersion(db);
  const feedback = getFeedbackData(db, checkpointId, 0);

  return buildPrompt({
    entityName: checkpoint.entity_name ?? 'Unknown Entity',
    checkpointName: checkpoint.checkpoint_name,
    description: checkpoint.description,
    specs: checkpoint.specs,
    photoSpec1: checkpoint.photo_spec_1,
    photoSpec2: checkpoint.photo_spec_2,
    photoSpec3: checkpoint.photo_spec_3,
    photoSpec4: checkpoint.photo_spec_4,
    systemContext: promptVersion.system_context,
    scoringGuide: promptVersion.scoring_guide,
    feedback,
  });
}

export async function scorePhoto(photoId: number): Promise<void> {
  const db = getDb();

  db.prepare(`UPDATE photo_ai_scores SET status = 'scoring' WHERE photo_submission_id = ?`).run(photoId);

  try {
    const photo = db
      .prepare(
        `SELECT ps.s3_key, ps.checkpoint_id, ps.execution_stage,
                c.checkpoint_name, c.description, c.specs,
                c.photo_spec_1, c.photo_spec_2, c.photo_spec_3, c.photo_spec_4,
                e.name AS entity_name
         FROM photo_submissions ps
         LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id
         LEFT JOIN entities e ON c.entity_id = e.id
         WHERE ps.id = ?`
      )
      .get(photoId) as {
        s3_key: string;
        checkpoint_id: number | null;
        execution_stage: string;
        checkpoint_name: string | null;
        description: string | null;
        specs: string | null;
        photo_spec_1: string | null;
        photo_spec_2: string | null;
        photo_spec_3: string | null;
        photo_spec_4: string | null;
        entity_name: string | null;
      } | undefined;

    if (!photo) {
      db.prepare(`UPDATE photo_ai_scores SET status = 'error', error = ? WHERE photo_submission_id = ?`).run(
        'Photo record not found',
        photoId
      );
      return;
    }

    const promptVersion = getActivePromptVersion(db);
    const feedback: FeedbackData =
      photo.checkpoint_id != null
        ? getFeedbackData(db, photo.checkpoint_id, photoId)
        : { totalReviewed: 0, approvedCount: 0, ncCount: 0, qcRequiredCount: 0, recentDecisions: [] };

    const { body: imageBuffer } = await getObjectFromS3(photo.s3_key);
    const base64Image = imageBuffer.toString('base64');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      db.prepare(`UPDATE photo_ai_scores SET status = 'error', error = ? WHERE photo_submission_id = ?`).run(
        'GEMINI_API_KEY not configured',
        photoId
      );
      return;
    }

    const prompt = buildPrompt({
      entityName: photo.entity_name ?? 'Unknown Entity',
      checkpointName: photo.checkpoint_name ?? 'Unknown Checkpoint',
      description: photo.description,
      specs: photo.specs,
      photoSpec1: photo.photo_spec_1,
      photoSpec2: photo.photo_spec_2,
      photoSpec3: photo.photo_spec_3,
      photoSpec4: photo.photo_spec_4,
      systemContext: promptVersion.system_context,
      scoringGuide: promptVersion.scoring_guide,
      feedback,
    });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
    ]);
    const responseText = result.response.text?.()?.trim();
    if (!responseText) throw new Error('Empty response from Gemini');

    let scoreResult: ScoreResult;
    try {
      const jsonText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      scoreResult = JSON.parse(jsonText) as ScoreResult;
    } catch {
      throw new Error(`Failed to parse Gemini response: ${responseText.slice(0, 300)}`);
    }

    const score = Math.min(100, Math.max(0, Math.round(Number(scoreResult.score) || 0)));
    const confidence = ['high', 'medium', 'low'].includes(scoreResult.confidence)
      ? scoreResult.confidence
      : 'medium';
    const issues = Array.isArray(scoreResult.issues)
      ? scoreResult.issues.filter((s) => typeof s === 'string')
      : [];
    const positives = Array.isArray(scoreResult.positives)
      ? scoreResult.positives.filter((s) => typeof s === 'string')
      : [];
    const summary = typeof scoreResult.summary === 'string' ? scoreResult.summary.slice(0, 500) : '';

    db.prepare(
      `UPDATE photo_ai_scores
       SET score = ?, confidence = ?, issues = ?, positives = ?, summary = ?,
           model_used = ?, prompt_version = ?, status = 'done', error = NULL
       WHERE photo_submission_id = ?`
    ).run(score, confidence, JSON.stringify(issues), JSON.stringify(positives), summary, MODEL, PROMPT_VERSION, photoId);
  } catch (error: unknown) {
    logError('[AI scoring]', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    db.prepare(`UPDATE photo_ai_scores SET status = 'error', error = ? WHERE photo_submission_id = ?`).run(
      errMsg.slice(0, 500),
      photoId
    );
  }
}
