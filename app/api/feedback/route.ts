import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import { sanitizeText, MAX_FEEDBACK_CONTENT_LENGTH } from '@/lib/sanitize';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function getGeminiReply(content: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(content);
  const text = result.response.text?.();
  if (text == null || text === '') {
    throw new Error('No reply from Gemini');
  }
  return text.trim();
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();
    const rows = db
      .prepare(
        'SELECT id, type, content, response, created_at FROM user_feedback WHERE author_email = ? ORDER BY created_at DESC'
      )
      .all(session.user.email) as { id: number; type: string; content: string; response: string | null; created_at: string }[];
    return NextResponse.json({ feedback: rows });
  } catch (error: unknown) {
    logError('Feedback GET', error);
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const type = body?.type as string | undefined;
    const content = sanitizeText(typeof body?.content === 'string' ? body.content : '', MAX_FEEDBACK_CONTENT_LENGTH);
    if (type !== 'question' && type !== 'suggestion') {
      return NextResponse.json({ error: 'Invalid type; use question or suggestion' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }
    const db = getDb();
    const authorEmail = session.user.email;
    if (type === 'question') {
      if (!process.env.GEMINI_API_KEY?.trim()) {
        return NextResponse.json({ error: 'Question service is not configured' }, { status: 503 });
      }
      let responseText: string;
      try {
        responseText = await getGeminiReply(content);
      } catch (geminiError: unknown) {
        logError('Feedback Gemini', geminiError);
        return NextResponse.json({ error: 'Failed to get answer' }, { status: 500 });
      }
      const result = db
        .prepare(
          'INSERT INTO user_feedback (author_email, type, content, response) VALUES (?, ?, ?, ?)'
        )
        .run(authorEmail, type, content, responseText);
      const id = Number(result.lastInsertRowid);
      const row = db.prepare('SELECT id, type, content, response, created_at FROM user_feedback WHERE id = ?').get(id) as {
        id: number;
        type: string;
        content: string;
        response: string | null;
        created_at: string;
      };
      return NextResponse.json(row);
    }
    // suggestion
    const result = db
      .prepare('INSERT INTO user_feedback (author_email, type, content) VALUES (?, ?, ?)')
      .run(authorEmail, type, content);
    const id = Number(result.lastInsertRowid);
    const row = db.prepare('SELECT id, type, content, response, created_at FROM user_feedback WHERE id = ?').get(id) as {
      id: number;
      type: string;
      content: string;
      response: string | null;
      created_at: string;
    };
    return NextResponse.json(row);
  } catch (error: unknown) {
    logError('Feedback POST', error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
