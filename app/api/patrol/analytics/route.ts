import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionWithRole(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const month = url.searchParams.get('month'); // e.g. "2026-04"
  const routeId = url.searchParams.get('route_id');

  const db = getDb();

  const conditions: string[] = ["ps.status IN ('completed', 'abandoned')"];
  const params: unknown[] = [];

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    conditions.push("strftime('%Y-%m', ps.started_at) = ?");
    params.push(month);
  }
  if (routeId) {
    conditions.push('ps.route_id = ?');
    params.push(routeId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Per-patroller summary
  const patrollerStats = db.prepare(`
    SELECT
      ps.patroller_email,
      u.name AS patroller_name,
      COUNT(DISTINCT ps.id) AS session_count,
      ROUND(SUM(ps.total_distance_meters) / 1000.0, 2) AS total_km,
      SUM(ps.photo_count) AS total_photos,
      SUM(ps.flag_count) AS total_flags,
      SUM(CASE WHEN pf.severity = 'high' THEN 1 ELSE 0 END) AS flags_high,
      SUM(CASE WHEN pf.severity = 'medium' THEN 1 ELSE 0 END) AS flags_medium,
      SUM(CASE WHEN pf.severity = 'low' THEN 1 ELSE 0 END) AS flags_low
    FROM patrol_sessions ps
    LEFT JOIN users u ON ps.patroller_email = u.email
    LEFT JOIN patrol_flags pf ON pf.session_id = ps.id
    ${where}
    GROUP BY ps.patroller_email
    ORDER BY total_km DESC
  `).all(...params);

  // Per-route summary
  const routeStats = db.prepare(`
    SELECT
      ps.route_id,
      r.route_name,
      COUNT(DISTINCT ps.id) AS session_count,
      COUNT(DISTINCT ps.patroller_email) AS patroller_count,
      ROUND(SUM(ps.total_distance_meters) / 1000.0, 2) AS total_km,
      SUM(ps.photo_count) AS total_photos,
      SUM(ps.flag_count) AS total_flags
    FROM patrol_sessions ps
    LEFT JOIN routes r ON ps.route_id = r.route_id
    ${where}
    GROUP BY ps.route_id
    ORDER BY total_km DESC
  `).all(...params);

  // Daily distance for chart (within month filter)
  const dailyTrend = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', ps.started_at) AS date,
      ROUND(SUM(ps.total_distance_meters) / 1000.0, 2) AS distance_km,
      SUM(ps.photo_count) AS photos,
      SUM(ps.flag_count) AS flags
    FROM patrol_sessions ps
    WHERE ${conditions.join(' AND ')}
    GROUP BY date
    ORDER BY date ASC
  `).all(...params);

  // KPI aggregates (filtered by same conditions)
  const kpiRow = db.prepare(`
    SELECT
      COUNT(DISTINCT ps.id) AS sessions,
      COUNT(DISTINCT ps.patroller_email) AS patrollers,
      ROUND(SUM(ps.total_distance_meters) / 1000.0, 2) AS total_km,
      SUM(ps.photo_count) AS total_photos,
      SUM(ps.flag_count) AS total_flags
    FROM patrol_sessions ps
    WHERE ${conditions.join(' AND ')}
  `).get(...params) as { sessions: number; patrollers: number; total_km: number; total_photos: number; total_flags: number };

  // Flag resolution stats (all time or filtered by month via started_at join)
  const flagConditions: string[] = [];
  const flagParams: unknown[] = [];
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    flagConditions.push("strftime('%Y-%m', pf.created_at) = ?");
    flagParams.push(month);
  }
  if (routeId) { flagConditions.push('pf.route_id = ?'); flagParams.push(routeId); }
  const flagWhere = flagConditions.length > 0 ? `WHERE ${flagConditions.join(' AND ')}` : '';

  const flagStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'investigating' THEN 1 ELSE 0 END) AS investigating,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
      ROUND(AVG(CASE WHEN status = 'resolved' AND resolved_at IS NOT NULL
        THEN (julianday(resolved_at) - julianday(created_at)) * 24
        ELSE NULL END), 1) AS avg_resolve_hours
    FROM patrol_flags pf
    ${flagWhere}
  `).get(...flagParams) as { total: number; open: number; investigating: number; resolved: number; avg_resolve_hours: number | null };

  const resolutionRate = flagStats.total > 0 ? Math.round((flagStats.resolved / flagStats.total) * 100) : 0;

  return NextResponse.json({
    patroller_stats: patrollerStats,
    route_stats: routeStats,
    daily_trend: dailyTrend,
    kpi: { ...kpiRow, resolution_rate: resolutionRate, avg_resolve_hours: flagStats.avg_resolve_hours },
    flag_breakdown: { open: flagStats.open, investigating: flagStats.investigating, resolved: flagStats.resolved, total: flagStats.total },
  });
}
