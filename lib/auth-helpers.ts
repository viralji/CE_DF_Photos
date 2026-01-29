import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

export async function getSessionOrDevBypass(request: NextRequest): Promise<{ user: { email?: string | null; name?: string | null } } | null> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (token?.email) {
    return { user: { email: token.email, name: token.name ?? undefined } };
  }
  if (process.env.NODE_ENV === 'development') {
    const devBypass = request.cookies.get('dev-bypass-auth')?.value === 'true';
    if (devBypass) {
      return { user: { email: 'dev@local', name: 'Dev User' } };
    }
  }
  return null;
}
