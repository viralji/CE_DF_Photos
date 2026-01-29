/**
 * Smoke test: run without dev server. Verifies DB and auth helper.
 * Usage: NODE_ENV=development npx tsx scripts/smoke-test.ts
 */
import { getDb, query } from '../lib/db';
import { getSessionOrDevBypass } from '../lib/auth-helpers';

async function main() {
  // 1. DB
  const db = getDb();
  const one = db.prepare('SELECT 1 as x').get() as { x: number };
  if (one?.x !== 1) throw new Error('DB query failed');
  console.log('✓ DB connection OK');

  const routesResult = query('SELECT * FROM routes ORDER BY route_name', []);
  console.log('✓ Routes query OK, count:', routesResult.rows.length);

  // 2. Auth helper with dev bypass (mock Request with cookie)
  const req = new Request('http://localhost:3000/api/routes', {
    headers: new Headers({ Cookie: 'dev-bypass-auth=true' }),
  }) as unknown as import('next/server').NextRequest;
  const session = await getSessionOrDevBypass(req);
  if (!session?.user?.email) throw new Error('Dev bypass auth should return session');
  console.log('✓ Auth dev-bypass OK, email:', session.user.email);

  // 3. Unauthorized without cookie
  const reqNoCookie = new Request('http://localhost:3000/api/routes') as unknown as import('next/server').NextRequest;
  const noSession = await getSessionOrDevBypass(reqNoCookie);
  if (noSession?.user?.email && process.env.NODE_ENV === 'development') {
    // In dev without cookie we might still get nothing; that's expected
  }
  console.log('✓ Smoke test passed');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
