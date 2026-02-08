import { NextResponse } from 'next/server';
import { handler } from '@/lib/auth';
import { logError } from '@/lib/safe-log';

async function handleWithJsonError(
  req: Request,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  try {
    return await handler(req, context);
  } catch (error) {
    logError('NextAuth', error);
    return NextResponse.json(
      { error: 'AuthError', message: (error as Error).message },
      { status: 500 }
    );
  }
}

export const GET = handleWithJsonError;
export const POST = handleWithJsonError;
