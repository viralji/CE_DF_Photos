import { getDb } from '@/lib/db';

/**
 * Returns the set of "route_id::subsection_id" keys the user is allowed to access.
 * - Admin: all subsections.
 * - Others: subsections that have no allowed_emails (open to all) OR user's email in subsection_allowed_emails.
 */
export function getAllowedSubsectionKeys(email: string, role: string): Set<string> {
  const db = getDb();
  const key = (r: string, s: string) => `${r}::${s}`;
  if (role === 'Admin') {
    const rows = db.prepare('SELECT route_id, subsection_id FROM subsections').all() as { route_id: string; subsection_id: string }[];
    return new Set(rows.map((r) => key(r.route_id, r.subsection_id)));
  }
  // Subsection is allowed if: no allowed_emails for it (open) OR user email is in allowed_emails
  const rows = db
    .prepare(
      `SELECT s.route_id, s.subsection_id
       FROM subsections s
       WHERE NOT EXISTS (
         SELECT 1 FROM subsection_allowed_emails a
         WHERE a.route_id = s.route_id AND a.subsection_id = s.subsection_id
       )
       OR EXISTS (
         SELECT 1 FROM subsection_allowed_emails a
         WHERE a.route_id = s.route_id AND a.subsection_id = s.subsection_id
         AND LOWER(TRIM(a.email)) = LOWER(TRIM(?))
       )`
    )
    .all(email) as { route_id: string; subsection_id: string }[];
  return new Set(rows.map((r) => key(r.route_id, r.subsection_id)));
}
