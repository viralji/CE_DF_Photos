'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

type RouteCompletionRow = {
  route_id: string;
  route_name: string;
  subsection_count: number;
  expected_photos: number;
  uploaded_photos: number;
  percentage: number;
};

type ReviewerReportRow = {
  engineer_name: string;
  engineer_email: string;
  route_id: string;
  route_name: string;
  subsection_name: string;
  subsection_length: number | null;
  entity_name: string;
  checkpoint_name: string;
  total_photos: number;
  first_capture_date: string;
  last_capture_date: string;
  approved_count: number;
  qc_count: number;
  nc_count: number;
  avg_ai_score: number | null;
};

type ReviewerCard = {
  route_id: string;
  route_name: string;
  engineers: string[];
  total_photos: number;
  first_date: string;
  last_date: string;
  approved: number;
  qc: number;
  nc: number;
  avg_ai_score: number | null;
  rows: ReviewerReportRow[];
};

type View = 'home' | 'route-completion' | 'reviewer';

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchRouteCompletion() {
  const res = await fetch('/api/reports/route-completion');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

async function fetchReviewerReport(routeId: string | null, dateFrom: string, dateTo: string) {
  const p = new URLSearchParams();
  if (routeId) p.set('routeId', routeId);
  if (dateFrom) p.set('dateFrom', dateFrom);
  if (dateTo) p.set('dateTo', dateTo);
  const res = await fetch(`/api/reports/reviewer?${p}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

async function fetchRoutes() {
  const res = await fetch('/api/routes');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

const PHOTOS_PAGE_SIZE = 10000;

async function fetchPhotos(routeId: string | null) {
  const photos: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const p = new URLSearchParams({
      limit: String(PHOTOS_PAGE_SIZE),
      offset: String(offset),
    });
    if (routeId) p.set('routeId', routeId);
    const res = await fetch(`/api/photos?${p}`);
    if (!res.ok) throw new Error('Failed');
    const data = (await res.json()) as { photos?: Record<string, unknown>[] };
    const batch = data.photos ?? [];
    photos.push(...batch);
    if (batch.length < PHOTOS_PAGE_SIZE) break;
    offset += PHOTOS_PAGE_SIZE;
  }
  return { photos };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctColor(pct: number) {
  if (pct >= 80) return 'text-green-700 bg-green-50 border-green-200';
  if (pct >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function pctBarColor(pct: number) {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function aiColor(score: number | null) {
  if (score == null) return 'text-slate-400';
  if (score >= 75) return 'text-green-700';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function dateRange(first: string, last: string) {
  if (!first) return '—';
  if (first === last) return first;
  return `${first} – ${last}`;
}

function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [view, setView] = useState<View>('home');
  // Route completion
  const [rcRouteFilter, setRcRouteFilter] = useState<string>('all');
  // Reviewer report
  const [rvRouteFilter, setRvRouteFilter] = useState<string>('all');
  const [rvDateFrom, setRvDateFrom] = useState('');
  const [rvDateTo, setRvDateTo] = useState('');
  const [rvSelectedCard, setRvSelectedCard] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: fetchRoutes });
  const routes = (routesData?.routes ?? []) as { route_id: string; route_name?: string }[];

  const { data: rcData, isLoading: rcLoading } = useQuery({
    queryKey: ['route-completion'],
    queryFn: fetchRouteCompletion,
    enabled: view === 'route-completion' || view === 'home',
  });
  const completionRows = (rcData?.routes ?? []) as RouteCompletionRow[];

  const { data: photosData } = useQuery({
    queryKey: ['photos-rc', rcRouteFilter],
    queryFn: () => fetchPhotos(rcRouteFilter === 'all' ? null : rcRouteFilter),
    enabled: view === 'route-completion',
  });
  const photos = (photosData?.photos ?? []) as { route_name?: string; subsection_name?: string; entity?: string; checkpoint_name?: string; filename?: string; s3_url?: string }[];

  const { data: rvData, isLoading: rvLoading } = useQuery({
    queryKey: ['reviewer-report', rvRouteFilter, rvDateFrom, rvDateTo],
    queryFn: () => fetchReviewerReport(rvRouteFilter === 'all' ? null : rvRouteFilter, rvDateFrom, rvDateTo),
    enabled: view === 'reviewer',
  });
  const rvRows = (rvData?.rows ?? []) as ReviewerReportRow[];

  // ── Derived data ─────────────────────────────────────────────────────────

  // Home-level totals (from completion data — preloaded)
  const rcTotalRoutes = completionRows.length;
  const rcTotalPhotos = completionRows.reduce((s, r) => s + r.uploaded_photos, 0);

  // Reviewer cards grouped by route
  const rvCards = useMemo<ReviewerCard[]>(() => {
    const map = new Map<string, ReviewerCard>();
    for (const row of rvRows) {
      const key = row.route_id ?? row.route_name ?? 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          route_id: row.route_id ?? '',
          route_name: row.route_name || 'Unknown',
          engineers: [],
          total_photos: 0,
          first_date: row.first_capture_date,
          last_date: row.last_capture_date,
          approved: 0, qc: 0, nc: 0,
          avg_ai_score: null,
          rows: [],
        });
      }
      const card = map.get(key)!;
      card.total_photos += row.total_photos;
      card.approved += row.approved_count;
      card.qc += row.qc_count;
      card.nc += row.nc_count;
      if (row.first_capture_date && (!card.first_date || row.first_capture_date < card.first_date)) card.first_date = row.first_capture_date;
      if (row.last_capture_date && (!card.last_date || row.last_capture_date > card.last_date)) card.last_date = row.last_capture_date;
      if (row.engineer_name && !card.engineers.includes(row.engineer_name)) card.engineers.push(row.engineer_name);
      card.rows.push(row);
    }
    for (const card of map.values()) {
      const scored = card.rows.filter((r) => r.avg_ai_score != null);
      if (scored.length > 0) {
        const tp = scored.reduce((s, r) => s + r.total_photos, 0);
        const ws = scored.reduce((s, r) => s + r.avg_ai_score! * r.total_photos, 0);
        card.avg_ai_score = tp > 0 ? Math.round(ws / tp) : null;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.route_name.localeCompare(b.route_name));
  }, [rvRows]);

  const rvDetailRows = useMemo<ReviewerReportRow[]>(
    () => rvCards.find((c) => c.route_id === rvSelectedCard)?.rows ?? [],
    [rvSelectedCard, rvCards],
  );

  // ── Download handlers ────────────────────────────────────────────────────

  function downloadRC() {
    downloadCSV(
      ['Route', 'Subsections', 'Expected Photos', 'Uploaded Photos', '% Complete'],
      completionRows.map((r) => [r.route_name, String(r.subsection_count), String(r.expected_photos), String(r.uploaded_photos), String(r.percentage)]),
      `route-completion-${Date.now()}.csv`,
    );
  }

  function downloadPhotosCSV() {
    downloadCSV(
      ['Route', 'Subsection', 'Entity', 'Checkpoint', 'Filename', 'URL'],
      photos.map((p) => [p.route_name || '', p.subsection_name || '', p.entity || '', p.checkpoint_name || '', p.filename || '', p.s3_url || '']),
      `photos-${rcRouteFilter}-${Date.now()}.csv`,
    );
  }

  function downloadReviewerCSV() {
    const rows = rvSelectedCard ? rvDetailRows : rvRows;
    downloadCSV(
      ['SN', 'Engineer', 'Route', 'Sub Section', 'Entity', 'Checkpoint', 'Photos', 'Capture Date', 'Length (m)', 'Approved', 'QC', 'NC', 'Avg AI Score'],
      rows.map((r, i) => [
        String(i + 1), r.engineer_name || '', r.route_name || '', r.subsection_name || '',
        r.entity_name || '', r.checkpoint_name || '', String(r.total_photos),
        dateRange(r.first_capture_date, r.last_capture_date),
        r.subsection_length != null ? String(r.subsection_length) : '',
        String(r.approved_count), String(r.qc_count), String(r.nc_count),
        r.avg_ai_score != null ? String(r.avg_ai_score) : '',
      ]),
      `reviewer-report-${rvSelectedCard ?? 'all'}-${Date.now()}.csv`,
    );
  }

  // ── Breadcrumb title ─────────────────────────────────────────────────────

  const breadcrumb =
    view === 'route-completion' ? 'Route Completion' :
    view === 'reviewer' ? (rvSelectedCard ? `Reviewer · ${rvCards.find((c) => c.route_id === rvSelectedCard)?.route_name ?? ''}` : 'Reviewer Report') :
    null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-3 py-2.5 flex items-center gap-2">
          {view === 'home' ? (
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (rvSelectedCard) { setRvSelectedCard(null); return; }
                setView('home');
              }}
              className="text-slate-500 hover:text-slate-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
          )}
          <span className="text-xs text-slate-400">Reports</span>
          {breadcrumb && <><span className="text-xs text-slate-300">/</span><span className="text-xs font-medium text-slate-700 truncate">{breadcrumb}</span></>}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 py-3 space-y-3">

        {/* ── Home: 2 top-level cards ───────────────────────────────────── */}
        {view === 'home' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Route Completion card */}
            <button
              type="button"
              onClick={() => setView('route-completion')}
              className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-400 hover:bg-indigo-50 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="font-semibold text-sm text-slate-900 group-hover:text-indigo-700">Route Completion</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">Upload progress by route — expected vs captured.</p>
              {rcLoading ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : (
                <div className="flex gap-3 text-xs">
                  <span className="text-slate-700 font-medium">{rcTotalRoutes} routes</span>
                  <span className="text-slate-500">{rcTotalPhotos.toLocaleString()} photos</span>
                </div>
              )}
            </button>

            {/* Reviewer Report card */}
            <button
              type="button"
              onClick={() => setView('reviewer')}
              className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <span className="font-semibold text-sm text-slate-900 group-hover:text-blue-700">Reviewer Report</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">Per-engineer photo capture with approval status and AI score.</p>
              <div className="text-xs text-slate-500">Click to filter by route or date</div>
            </button>
          </div>
        )}

        {/* ── Route Completion: child route cards ───────────────────────── */}
        {view === 'route-completion' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rcRouteFilter}
                onChange={(e) => setRcRouteFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">All Routes</option>
                {routes.map((r) => (
                  <option key={r.route_id} value={r.route_id}>{r.route_name || r.route_id}</option>
                ))}
              </select>
              <button
                onClick={downloadRC}
                disabled={completionRows.length === 0}
                className="px-2.5 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Completion CSV
              </button>
              <button
                onClick={downloadPhotosCSV}
                disabled={photos.length === 0}
                className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Photos CSV
              </button>
            </div>

            {/* Route cards */}
            {rcLoading ? (
              <p className="text-xs text-slate-400 text-center py-8">Loading…</p>
            ) : completionRows.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No route data. Add routes and run checkpoint seed.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {completionRows
                  .filter((r) => rcRouteFilter === 'all' || r.route_id === rcRouteFilter)
                  .map((row) => (
                    <div
                      key={row.route_id}
                      className="bg-white border border-slate-200 rounded-lg p-3"
                    >
                      <div className="font-medium text-xs text-slate-900 mb-1.5 truncate" title={row.route_name}>
                        {row.route_name}
                      </div>
                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full mb-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pctBarColor(row.percentage)}`}
                          style={{ width: `${Math.min(100, row.percentage)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${pctColor(row.percentage)}`}>
                          {row.percentage}%
                        </span>
                        <span className="text-xs text-slate-500">
                          {row.uploaded_photos}/{row.expected_photos}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{row.subsection_count} subsection{row.subsection_count !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {/* ── Reviewer Report: child route cards → detail table ─────────── */}
        {view === 'reviewer' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rvRouteFilter}
                onChange={(e) => { setRvRouteFilter(e.target.value); setRvSelectedCard(null); }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Routes</option>
                {routes.map((r) => (
                  <option key={r.route_id} value={r.route_id}>{r.route_name || r.route_id}</option>
                ))}
              </select>
              <input
                type="date"
                value={rvDateFrom}
                onChange={(e) => { setRvDateFrom(e.target.value); setRvSelectedCard(null); }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <input
                type="date"
                value={rvDateTo}
                onChange={(e) => { setRvDateTo(e.target.value); setRvSelectedCard(null); }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button
                onClick={downloadReviewerCSV}
                disabled={(rvSelectedCard ? rvDetailRows : rvRows).length === 0}
                className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                CSV
              </button>
              {rvSelectedCard && (
                <button
                  type="button"
                  onClick={() => setRvSelectedCard(null)}
                  className="px-2.5 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  All routes
                </button>
              )}
            </div>

            {/* Route cards (shown when no card is selected) */}
            {!rvSelectedCard && (
              rvLoading ? (
                <p className="text-xs text-slate-400 text-center py-8">Loading…</p>
              ) : rvCards.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">No data found.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {rvCards.map((card) => (
                    <button
                      key={card.route_id}
                      type="button"
                      onClick={() => setRvSelectedCard(card.route_id)}
                      className="text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                    >
                      <div className="font-medium text-xs text-slate-900 group-hover:text-blue-700 truncate mb-1" title={card.route_name}>
                        {card.route_name}
                      </div>
                      <div className="text-xs text-slate-400 mb-2">
                        {card.engineers.length} eng · {card.total_photos} photos
                      </div>
                      <div className="text-xs text-slate-400 mb-2">{dateRange(card.first_date, card.last_date)}</div>
                      <div className="flex gap-1 flex-wrap mb-1.5">
                        <span className="text-xs text-green-700 font-medium">{card.approved}✓</span>
                        <span className="text-xs text-amber-600 font-medium">{card.qc}⚠</span>
                        <span className="text-xs text-red-600 font-medium">{card.nc}✗</span>
                      </div>
                      {card.avg_ai_score != null && (
                        <div className={`text-xs font-semibold ${aiColor(card.avg_ai_score)}`}>AI {card.avg_ai_score}/100</div>
                      )}
                    </button>
                  ))}
                </div>
              )
            )}

            {/* Detail table (shown when a route card is selected) */}
            {rvSelectedCard && (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['SN', 'Engineer', 'Route', 'Sub Section', 'Entity', 'Checkpoint', 'Photos', 'Capture Date', 'Length (m)', 'Approved', 'QC', 'NC', 'Avg AI'].map((h, i) => (
                          <th key={h} className={`p-2 font-semibold text-slate-700 whitespace-nowrap ${i >= 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rvDetailRows.length > 0 ? rvDetailRows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 text-slate-400">{i + 1}</td>
                          <td className="p-2 text-slate-900 whitespace-nowrap">{row.engineer_name || '—'}</td>
                          <td className="p-2 text-slate-700 whitespace-nowrap">{row.route_name || '—'}</td>
                          <td className="p-2 text-slate-700 whitespace-nowrap">{row.subsection_name || '—'}</td>
                          <td className="p-2 text-slate-700 whitespace-nowrap">{row.entity_name || '—'}</td>
                          <td className="p-2 text-slate-700 whitespace-nowrap">{row.checkpoint_name || '—'}</td>
                          <td className="p-2 text-right font-medium text-slate-900">{row.total_photos}</td>
                          <td className="p-2 text-slate-500 whitespace-nowrap">{dateRange(row.first_capture_date, row.last_capture_date)}</td>
                          <td className="p-2 text-right text-slate-700">{row.subsection_length != null ? row.subsection_length : '—'}</td>
                          <td className="p-2 text-right font-semibold text-green-700">{row.approved_count}</td>
                          <td className="p-2 text-right font-semibold text-amber-600">{row.qc_count}</td>
                          <td className="p-2 text-right font-semibold text-red-600">{row.nc_count}</td>
                          <td className={`p-2 text-right font-semibold ${aiColor(row.avg_ai_score)}`}>
                            {row.avg_ai_score != null ? row.avg_ai_score : '—'}
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={13} className="p-6 text-center text-slate-400">No data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
