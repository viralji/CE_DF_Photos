import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export type AllowedRole = 'Engineer' | 'Reviewer' | 'Admin';

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

/** Resolve effective role from DB: field_worker or NULL → Reviewer. */
function normalizeRole(raw: string | null | undefined): AllowedRole {
  const r = (raw ?? '').trim();
  if (r === 'Engineer' || r === 'Reviewer' || r === 'Admin') return r;
  return 'Reviewer';
}

const FIRST_ADMIN_EMAIL = 'v.shah@cloudextel.com';

/** Returns session + role from users table (default Reviewer). Use for APIs that need role. */
export async function getSessionWithRole(
  request: NextRequest
): Promise<{ user: { email: string; name?: string | null }; role: AllowedRole } | null> {
  const session = await getSessionOrDevBypass(request);
  if (!session?.user?.email) return null;
  const email = session.user.email;
  const db = getDb();
  let row = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: number; role: string | null } | undefined;
  if (!row && email === FIRST_ADMIN_EMAIL) {
    db.prepare('INSERT OR IGNORE INTO users (email, name, role) VALUES (?, ?, ?)').run(email, session.user.name ?? '', 'Admin');
    row = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: number; role: string | null } | undefined;
  }
  if (!row && email === 'dev@local' && process.env.NODE_ENV === 'development') {
    db.prepare('INSERT OR IGNORE INTO users (email, name, role) VALUES (?, ?, ?)').run(email, session.user.name ?? 'Dev User', 'Admin');
    row = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: number; role: string | null } | undefined;
  }
  const role = normalizeRole(row?.role ?? null);
  return { user: { email, name: session.user.name ?? null }, role };
}
