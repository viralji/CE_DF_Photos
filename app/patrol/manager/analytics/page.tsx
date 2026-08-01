'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface PatrollerStat {
  patroller_email: string;
  patroller_name: string | null;
  session_count: number;
  total_km: number;
  total_photos: number;
  total_flags: number;
  flags_high: number;
  flags_medium: number;
  flags_low: number;
}

interface RouteStat {
  route_id: string;
  route_name: string | null;
  session_count: number;
  patroller_count: number;
  total_km: number;
  total_photos: number;
  total_flags: number;
}

interface DayTrend {
  date: string;
  distance_km: number;
  photos: number;
  flags: number;
}

interface Kpi {
  sessions: number;
  patrollers: number;
  total_km: number;
  total_photos: number;
  total_flags: number;
  resolution_rate: number;
  avg_resolve_hours: number | null;
}

interface FlagBreakdown {
  open: number;
  investigating: number;
  resolved: number;
  total: number;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getLastNMonths(n: number): string[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

const QUICK_FILTERS = [
  { label: 'This month', value: () => getCurrentMonth() },
  { label: 'Last month', value: () => getLastNMonths(2)[1] },
];

const FLAG_PIE_COLORS = { open: '#dc2626', investigating: '#ea580c', resolved: '#16a34a' };

export default function PatrolAnalytics() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [routeFilter, setRouteFilter] = useState('');

  const params = new URLSearchParams({ month });
  if (routeFilter) params.set('route_id', routeFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['patrol-analytics', month, routeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/patrol/analytics?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const { data: routesData } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => {
      const res = await fetch('/api/routes');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const patrollerStats: PatrollerStat[] = data?.patroller_stats ?? [];
  const routeStats: RouteStat[] = data?.route_stats ?? [];
  const dailyTrend: DayTrend[] = data?.daily_trend ?? [];
  const kpi: Kpi | undefined = data?.kpi;
  const flagBreakdown: FlagBreakdown | undefined = data?.flag_breakdown;
  const routes = routesData?.routes ?? [];

  const flagPieData = flagBreakdown ? [
    { name: 'Open', value: flagBreakdown.open, color: FLAG_PIE_COLORS.open },
    { name: 'Investigating', value: flagBreakdown.investigating, color: FLAG_PIE_COLORS.investigating },
    { name: 'Resolved', value: flagBreakdown.resolved, color: FLAG_PIE_COLORS.resolved },
  ].filter((d) => d.value > 0) : [];

  function exportCsv() {
    const rows = [
      ['Patroller', 'Sessions', 'Total km', 'Photos', 'Flags', 'High', 'Medium', 'Low'],
      ...patrollerStats.map((p) => [
        p.patroller_name ?? p.patroller_email, p.session_count, p.total_km, p.total_photos, p.total_flags, p.flags_high, p.flags_medium, p.flags_low,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `patrol-analytics-${month}.csv`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/patrol/manager" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-base font-bold text-slate-900">Patrol Analytics</h1>
        </div>
        <button onClick={exportCsv} className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-medium">Export CSV</button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setMonth(f.value())}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${month === f.value() ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Route</label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All routes</option>
              {routes.map((r: { route_id: string; route_name: string }) => (
                <option key={r.route_id} value={r.route_id}>{r.route_name ?? r.route_id}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-slate-400 text-sm py-8 text-center">Loading analytics…</p>
        ) : (
          <>
            {/* KPI cards */}
            {kpi && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard label="Total km" value={kpi.total_km.toFixed(1)} color="blue" icon="📍" />
                <KpiCard label="Sessions" value={String(kpi.sessions)} color="slate" icon="🏃" />
                <KpiCard label="Photos" value={String(kpi.total_photos)} color="purple" icon="📸" />
                <KpiCard label="Flags raised" value={String(kpi.total_flags)} color="orange" icon="🚩" />
                <KpiCard label="Resolution rate" value={`${kpi.resolution_rate}%`} color={kpi.resolution_rate >= 80 ? 'green' : kpi.resolution_rate >= 50 ? 'orange' : 'red'} icon="✓" />
                <KpiCard label="Avg resolve" value={kpi.avg_resolve_hours != null ? `${kpi.avg_resolve_hours}h` : '—'} color="slate" icon="⏱" />
              </div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Daily trend chart */}
              {dailyTrend.length > 0 && (
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
                  <h2 className="text-sm font-semibold text-slate-700 mb-4">Daily Activity</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dailyTrend} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number, name: string) => [v, name === 'distance_km' ? 'km' : name]} labelFormatter={(l: string) => new Date(l).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="distance_km" name="km" fill="#2563eb" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="photos" name="photos" fill="#9333ea" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="flags" name="flags" fill="#dc2626" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Flag breakdown pie */}
              {flagPieData.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h2 className="text-sm font-semibold text-slate-700 mb-4">Flag Status</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={flagPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {flagPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, name: string) => [v, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  {flagBreakdown && (
                    <div className="flex justify-around text-xs text-slate-500 mt-1">
                      <span className="text-red-600 font-medium">{flagBreakdown.open} open</span>
                      <span className="text-amber-600 font-medium">{flagBreakdown.investigating} active</span>
                      <span className="text-green-600 font-medium">{flagBreakdown.resolved} resolved</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Per-patroller table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Per Patroller</h2>
                <span className="text-xs text-slate-400">{patrollerStats.length} patroller{patrollerStats.length !== 1 ? 's' : ''}</span>
              </div>
              {patrollerStats.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No data for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        {['Patroller', 'Sessions', 'Distance', 'Photos', 'Flags', 'High', 'Med', 'Low'].map((h) => (
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {patrollerStats.map((p) => (
                        <tr key={p.patroller_email} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{p.patroller_name ?? p.patroller_email}</td>
                          <td className="px-4 py-3 text-slate-600">{p.session_count}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">{p.total_km} km</td>
                          <td className="px-4 py-3 text-slate-600">{p.total_photos}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{p.total_flags}</td>
                          <td className="px-4 py-3 text-red-600 font-medium">{p.flags_high}</td>
                          <td className="px-4 py-3 text-amber-600">{p.flags_medium}</td>
                          <td className="px-4 py-3 text-yellow-600">{p.flags_low}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Per-route table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Per Route</h2>
                <span className="text-xs text-slate-400">{routeStats.length} route{routeStats.length !== 1 ? 's' : ''}</span>
              </div>
              {routeStats.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No data for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        {['Route', 'Sessions', 'Patrollers', 'Distance', 'Photos', 'Flags'].map((h) => (
                          <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {routeStats.map((r) => (
                        <tr key={r.route_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{r.route_name ?? r.route_id}</td>
                          <td className="px-4 py-3 text-slate-600">{r.session_count}</td>
                          <td className="px-4 py-3 text-slate-600">{r.patroller_count}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">{r.total_km} km</td>
                          <td className="px-4 py-3 text-slate-600">{r.total_photos}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{r.total_flags}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    purple: 'border-purple-200 bg-purple-50',
    orange: 'border-orange-200 bg-orange-50',
    red: 'border-red-200 bg-red-50',
    slate: 'border-slate-200 bg-white',
  };
  const textColors: Record<string, string> = {
    blue: 'text-blue-900', green: 'text-green-900', purple: 'text-purple-900',
    orange: 'text-orange-900', red: 'text-red-900', slate: 'text-slate-900',
  };
  return (
    <div className={`border rounded-xl p-3 text-center ${colors[color] ?? colors.slate}`}>
      <div className="text-lg mb-0.5">{icon}</div>
      <p className={`text-xl font-bold ${textColors[color] ?? textColors.slate}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
