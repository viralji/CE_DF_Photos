import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole, type AllowedRole } from '@/lib/auth-helpers';
import { query, getDb } from '@/lib/db';

const ALLOWED_ROLES: AllowedRole[] = ['Engineer', 'Reviewer', 'Admin'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const result = query(
      'SELECT id, email, name, role FROM users ORDER BY email',
      []
    );
    const users = (result.rows ?? []).map((row: unknown) => {
      const r = row as { id: number; email: string; name: string | null; role: string | null };
      return {
        id: r.id,
        email: r.email,
        name: r.name ?? null,
        role: r.role === 'Engineer' || r.role === 'Reviewer' || r.role === 'Admin' ? r.role : 'Reviewer',
      };
    });
    return NextResponse.json({ users });
  } catch (error: unknown) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
      return NextResponse.json({ error: 'role must be Engineer, Reviewer, or Admin' }, { status: 400 });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
    }
    db.prepare('INSERT INTO users (email, name, role) VALUES (?, ?, ?)').run(email, name || email.split('@')[0], role);
    const row = db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email) as {
      id: number;
      email: string;
      name: string | null;
      role: string | null;
    };
    return NextResponse.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name ?? null,
        role: ALLOWED_ROLES.includes(row.role as AllowedRole) ? row.role : 'Reviewer',
      },
    });
  } catch (error: unknown) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
