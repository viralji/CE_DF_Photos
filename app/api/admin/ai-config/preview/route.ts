import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { buildPromptForPreview } from '@/lib/ai-scoring';
import { logError } from '@/lib/safe-log';

// GET ?checkpointId=N — returns the compiled prompt that would be sent to Gemini
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const cpId = parseInt(searchParams.get('checkpointId') ?? '', 10);
    if (!cpId || Number.isNaN(cpId)) {
      return NextResponse.json({ error: 'checkpointId query param required' }, { status: 400 });
    }
    const prompt = buildPromptForPreview(cpId);
    return NextResponse.json({ prompt });
  } catch (error: unknown) {
    logError('ai-config preview', error);
    return NextResponse.json({ error: 'Failed to build preview' }, { status: 500 });
  }
}
