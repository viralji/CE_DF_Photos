'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { uniqueCheckpointCodes, uniqueEntityCodes } from '@/lib/photo-filename';

async function getRoutes() {
  const res = await fetch('/api/routes');
  if (!res.ok) throw new Error('Failed to fetch routes');
  return res.json();
}

async function getSubsections() {
  const res = await fetch('/api/subsections');
  if (!res.ok) throw new Error('Failed to fetch subsections');
  return res.json();
}

async function getCheckpoints() {
  const res = await fetch('/api/checkpoints');
  if (!res.ok) throw new Error('Failed to fetch checkpoints');
  return res.json();
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
}

export default function AdminPage() {
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [subRouteId, setSubRouteId] = useState('');
  const [subsectionId, setSubsectionId] = useState('');
  const [subsectionName, setSubsectionName] = useState('');
  const [message, setMessage] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: subsectionsData } = useQuery({ queryKey: ['subsections'], queryFn: getSubsections });
  const { data: checkpointsData } = useQuery({ queryKey: ['checkpoints'], queryFn: getCheckpoints });

  const routes = (routesData?.routes ?? []) as { route_id: string; route_name: string }[];
  const checkpoints = (checkpointsData?.checkpoints ?? []) as { id: number; entity: string; checkpoint_name: string }[];
  const checkpointCodeMap = useMemo(
    () => uniqueCheckpointCodes(checkpoints.map((c) => ({ id: c.id, checkpoint_name: c.checkpoint_name }))),
    [checkpoints]
  );
  const entityCodeMap = useMemo(
    () => uniqueEntityCodes(checkpoints.map((c) => ({ entity: c.entity || '' }))),
    [checkpoints]
  );

  async function createRoute() {
    if (!routeId.trim() || !routeName.trim()) { 
      setMessage('⚠️ Route ID and name required.'); 
      setTimeout(() => setMessage(''), 3000);
      return; 
    }
    const res = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_id: routeId.trim(), route_name: routeName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { 
      setMessage(`❌ ${data.error || 'Failed'}`); 
      setTimeout(() => setMessage(''), 3000);
      return; 
    }
    setMessage('✓ Route created successfully!');
    setTimeout(() => setMessage(''), 3000);
    setRouteId(''); setRouteName('');
    queryClient.invalidateQueries({ queryKey: ['routes'] });
  }

  async function createSubsection() {
    if (!subRouteId || !subsectionId.trim() || !subsectionName.trim()) { 
      setMessage('⚠️ Route, subsection ID and name required.'); 
      setTimeout(() => setMessage(''), 3000);
      return; 
    }
    const res = await fetch('/api/subsections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_id: subRouteId, subsection_id: subsectionId.trim(), subsection_name: subsectionName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { 
      setMessage(`❌ ${data.error || 'Failed'}`); 
      setTimeout(() => setMessage(''), 3000);
      return; 
    }
    setMessage('✓ Subsection created successfully!');
    setTimeout(() => setMessage(''), 3000);
    setSubsectionId(''); setSubsectionName('');
    queryClient.invalidateQueries({ queryKey: ['subsections'] });
  }

  async function reseedCheckpoints() {
    setSeedLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/checkpoints/seed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`❌ Seed failed: ${data.error || 'Unknown error'}`);
        return;
      }
      setMessage(`✓ Seed complete! Inserted ${data.inserted} new checkpoint(s). Total: ${data.total}.`);
      queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
    } catch (e) {
      setMessage(`❌ ${(e as Error).message}`);
    } finally {
      setSeedLoading(false);
    }
  }

  async function handleBulkRoutes(file: File | null) {
    if (!file) return;
    setBulkLoading(true);
    setBulkMessage('');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setBulkMessage('⚠️ CSV is empty.');
        return;
      }
      const isHeader = rows[0][0]?.toLowerCase() === 'route_id' && rows[0][1]?.toLowerCase() === 'route_name';
      const data = (isHeader ? rows.slice(1) : rows).map((r) => ({ route_id: r[0] ?? '', route_name: r[1] ?? '' }));
      const res = await fetch('/api/routes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: data }),
      });
      const result = await res.json();
      if (!res.ok) {
        setBulkMessage(`❌ ${result.error || 'Upload failed'}`);
        return;
      }
      setBulkMessage(`✓ Routes: ${result.inserted} inserted of ${result.total}.${result.errors?.length ? ` ${result.errors.length} row(s) skipped.` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    } catch (e) {
      setBulkMessage(`❌ ${(e as Error).message}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkSubsections(file: File | null) {
    if (!file) return;
    setBulkLoading(true);
    setBulkMessage('');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setBulkMessage('⚠️ CSV is empty.');
        return;
      }
      const isHeader =
        rows[0][0]?.toLowerCase() === 'route_id' &&
        rows[0][1]?.toLowerCase() === 'subsection_id' &&
        rows[0][2]?.toLowerCase() === 'subsection_name';
      const data = (isHeader ? rows.slice(1) : rows).map((r) => ({
        route_id: r[0] ?? '',
        subsection_id: r[1] ?? '',
        subsection_name: r[2] ?? '',
      }));
      const res = await fetch('/api/subsections/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subsections: data }),
      });
      const result = await res.json();
      if (!res.ok) {
        setBulkMessage(`❌ ${result.error || 'Upload failed'}`);
        return;
      }
      setBulkMessage(`✓ Subsections: ${result.inserted} inserted of ${result.total}.${result.errors?.length ? ` ${result.errors.length} row(s) skipped.` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['subsections'] });
    } catch (e) {
      setBulkMessage(`❌ ${(e as Error).message}`);
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-800"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-lg font-bold text-slate-900">Admin</h1>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 space-y-4">
        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
            message.startsWith('✓') ? 'bg-green-600 text-white' : 
            message.startsWith('❌') ? 'bg-red-600 text-white' : 
            'bg-amber-500 text-white'
          }`}>
            <span className="font-medium">{message}</span>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Create Route</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Route ID</label>
              <input type="text" value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="e.g. R001" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-[2]">
              <label className="block text-xs font-medium text-slate-600 mb-1">Route Name</label>
              <input type="text" value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="e.g. Main Street" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:self-end">
              <button onClick={createRoute} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                Create Route
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Create Subsection</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Route</label>
              <select value={subRouteId} onChange={(e) => setSubRouteId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select route...</option>
                {routes.map((r) => (
                  <option key={r.route_id} value={r.route_id}>{r.route_name || `Route ${r.route_id}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Subsection ID</label>
              <input type="text" value={subsectionId} onChange={(e) => setSubsectionId(e.target.value)} placeholder="e.g. S01" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Subsection Name</label>
              <input type="text" value={subsectionName} onChange={(e) => setSubsectionName(e.target.value)} placeholder="e.g. Section A" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <button onClick={createSubsection} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            Create Subsection
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Bulk upload via CSV</h2>
          {bulkMessage && (
            <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${bulkMessage.startsWith('✓') ? 'bg-green-100 text-green-800' : bulkMessage.startsWith('❌') ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
              {bulkMessage}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Routes</p>
              <p className="text-xs text-slate-500 mb-2">Columns: route_id, route_name (header optional)</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBulkRoutes(f);
                  e.target.value = '';
                }}
                disabled={bulkLoading}
              />
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Subsections</p>
              <p className="text-xs text-slate-500 mb-2">Columns: route_id, subsection_id, subsection_name (header optional)</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBulkSubsections(f);
                  e.target.value = '';
                }}
                disabled={bulkLoading}
              />
            </div>
          </div>
          {bulkLoading && <p className="text-xs text-slate-500 mt-2">Uploading…</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">Checkpoint Reference (3-digit codes)</h2>
              <p className="text-xs text-slate-500">Photo filenames use entity code and checkpoint code. All checkpoints from the database are listed below.</p>
            </div>
            <button
              onClick={reseedCheckpoints}
              disabled={seedLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {seedLoading ? 'Seeding…' : 'Re-seed from JSON'}
            </button>
          </div>
          {checkpoints.length === 0 ? (
            <p className="text-slate-500 text-sm">Run database seed to load checkpoints: <code className="bg-slate-100 px-1 rounded">npm run seed:checkpoints</code> or <code className="bg-slate-100 px-1 rounded">node scripts/init-db-full.mjs</code></p>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Entity</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Entity code</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Checkpoint</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Checkpoint code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checkpoints.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{c.entity}</td>
                      <td className="p-2 font-mono font-semibold text-blue-600">{entityCodeMap.get(c.entity || '') ?? '—'}</td>
                      <td className="p-2 text-slate-700">{c.checkpoint_name}</td>
                      <td className="p-2 font-mono font-semibold text-blue-600">{checkpointCodeMap.get(c.id) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500 mt-3">{checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''} total.</p>
            </div>
          )}
          {checkpoints.length > 0 && (
            <p className="text-xs text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded p-2">
              If you see only one checkpoint per entity, re-run the seed to load all rows from <code>checkpoints_data.json</code>: <code className="bg-white/80 px-1 rounded">npm run seed:checkpoints</code>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
