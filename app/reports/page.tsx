'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

async function getRoutes() {
  const res = await fetch('/api/routes');
  if (!res.ok) throw new Error('Failed to fetch routes');
  return res.json();
}

async function getPhotos(routeId: string | null) {
  const params = new URLSearchParams(routeId ? { routeId, limit: '1000' } : { limit: '1000' });
  const res = await fetch(`/api/photos?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch photos');
  return res.json();
}

async function getRouteCompletion() {
  const res = await fetch('/api/reports/route-completion');
  if (!res.ok) throw new Error('Failed to fetch route completion');
  return res.json();
}

type RouteCompletionRow = {
  route_id: string;
  route_name: string;
  subsection_count: number;
  expected_photos: number;
  uploaded_photos: number;
  percentage: number;
};

const BUCKETS = [
  { key: '0-20', label: '0–20%', min: 0, max: 20, color: '#ef4444' },
  { key: '21-40', label: '21–40%', min: 21, max: 40, color: '#f59e0b' },
  { key: '41-60', label: '41–60%', min: 41, max: 60, color: '#eab308' },
  { key: '61-80', label: '61–80%', min: 61, max: 80, color: '#22c55e' },
  { key: '81-100', label: '81–100%', min: 81, max: 100, color: '#059669' },
];

function getBucketKey(pct: number): string {
  if (pct <= 20) return '0-20';
  if (pct <= 40) return '21-40';
  if (pct <= 60) return '41-60';
  if (pct <= 80) return '61-80';
  return '81-100';
}

export default function ReportsPage() {
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: completionData } = useQuery({
    queryKey: ['route-completion'],
    queryFn: getRouteCompletion,
  });
  const { data: photosData } = useQuery({
    queryKey: ['photos-report', selectedRoute],
    queryFn: () => getPhotos(selectedRoute === 'all' ? null : selectedRoute),
  });

  const routes = (routesData?.routes ?? []) as { route_id: string; route_name?: string }[];
  const completionRows = (completionData?.routes ?? []) as RouteCompletionRow[];

  const { pieData, routesByBucket } = useMemo(() => {
    const byBucket: Record<string, RouteCompletionRow[]> = {};
    BUCKETS.forEach((b) => { byBucket[b.key] = []; });
    completionRows.forEach((row) => {
      const key = getBucketKey(row.percentage);
      byBucket[key].push(row);
    });
    const pieData = BUCKETS.map((b) => ({
      name: b.label,
      key: b.key,
      count: byBucket[b.key].length,
      color: b.color,
    })).filter((d) => d.count > 0);
    return { pieData, routesByBucket: byBucket };
  }, [completionRows]);
  const photos = (photosData?.photos ?? []) as {
    id: number;
    route_name?: string;
    subsection_name?: string;
    entity?: string;
    checkpoint_name?: string;
    filename?: string;
    s3_url?: string;
  }[];

  function downloadCSV() {
    const headers = ['Route', 'Subsection', 'Entity', 'Checkpoint', 'Filename', 'URL'];
    const rows = photos.map((p) => [
      p.route_name || '',
      p.subsection_name || '',
      p.entity || '',
      p.checkpoint_name || '',
      p.filename || '',
      p.s3_url || '',
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `df-photos-report-${selectedRoute}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-800"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 space-y-4 overflow-x-auto">
        {/* Route completion pie chart */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Route completion</h2>
          <p className="text-xs text-slate-500 mb-4">
            Routes by % of expected photos uploaded. Click a slice to see routes in that range.
          </p>
          {completionRows.length === 0 ? (
            <p className="text-sm text-slate-500">No routes or no checkpoints configured. Add routes and run checkpoint seed.</p>
          ) : pieData.length === 0 ? (
            <p className="text-sm text-slate-500">No route data to display.</p>
          ) : (
            <>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      onClick={(data: { key: string }) => setSelectedBucket(data.key)}
                      cursor="pointer"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={entry.key} fill={entry.color} stroke="#fff" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name: string, props: unknown) => {
                        const p = props as { payload?: { name: string; count: number } };
                        const count = p?.payload?.count ?? value;
                        return [`${count} route${count !== 1 ? 's' : ''}`, p?.payload?.name ?? ''];
                      }}
                    />
                    <Legend formatter={(value, entry) => `${value}: ${(entry as { payload?: { count: number } })?.payload?.count ?? 0} route(s)`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {selectedBucket && routesByBucket[selectedBucket] && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">
                      Routes in {BUCKETS.find((b) => b.key === selectedBucket)?.label ?? selectedBucket}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedBucket(null)}
                      className="text-xs text-slate-500 hover:text-slate-700 underline"
                    >
                      Close
                    </button>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {routesByBucket[selectedBucket].map((row) => (
                      <li key={row.route_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRoute(row.route_id);
                            setSelectedBucket(null);
                          }}
                          className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          {row.route_name} ({row.percentage}%)
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Route</label>
              <select value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Routes</option>
                {routes.map((r) => (
                  <option key={r.route_id} value={r.route_id}>
                    {r.route_name || `Route ${r.route_id}`}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={downloadCSV} disabled={photos.length === 0} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download CSV
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {photos.length} photo{photos.length !== 1 ? 's' : ''} in report
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Route</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Subsection</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Entity</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Checkpoint</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Filename</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {photos.length > 0 ? (
                  photos.map((photo) => (
                    <tr key={photo.id} className="hover:bg-slate-50">
                      <td className="p-2 text-slate-900">{photo.route_name || '—'}</td>
                      <td className="p-2 text-slate-700">{photo.subsection_name || '—'}</td>
                      <td className="p-2 text-slate-700">{photo.entity || '—'}</td>
                      <td className="p-2 text-slate-700">{photo.checkpoint_name || '—'}</td>
                      <td className="p-2 font-mono text-xs text-slate-600 truncate max-w-[10rem]">{photo.filename || '—'}</td>
                      <td className="p-2">
                        {photo.s3_url && (
                          <a href={photo.s3_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 font-medium text-xs">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">No photos found. Try a different route.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
