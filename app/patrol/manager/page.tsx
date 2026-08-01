'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  PHOTO_LOCATION_PIN_CLASS_NAME,
  PHOTO_LOCATION_PIN_ICON_ANCHOR,
  PHOTO_LOCATION_PIN_ICON_SIZE,
  photoLocationPinIconHtml,
} from '@/lib/leaflet-photo-pin';
import 'leaflet/dist/leaflet.css';

interface ActiveSession {
  session_id: number;
  patroller_email: string;
  patroller_name: string | null;
  route_id: string;
  route_name: string | null;
  started_at: string;
  total_distance_meters: number;
  photo_count: number;
  flag_count: number;
  status: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  last_ping_at: string | null;
}

interface PatrolFlag {
  id: number;
  session_id: number;
  patroller_email: string;
  patroller_name: string | null;
  route_name: string | null;
  route_id: string;
  severity: string;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  s3_url: string | null;
  created_at: string;
  resolution_notes?: string | null;
  resolved_by_email?: string | null;
  resolved_at?: string | null;
}

interface Notification {
  id: number;
  flag_id: number;
  is_read: number;
  created_at: string;
  severity: string;
  description: string;
  flag_status: string;
  patroller_name: string | null;
  patroller_email: string;
  route_name: string | null;
  session_id: number;
  latitude: number;
  longitude: number;
}

interface PatrolPhoto {
  id: number;
  session_id: number;
  patroller_email: string;
  patroller_name: string | null;
  route_id: string;
  route_name: string | null;
  s3_url: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  created_at: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// Stable color-per-patroller using email hash
function emailToColor(email: string): string {
  const colors = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#d97706', '#be185d', '#0d9488'];
  let hash = 0;
  for (const c of email) hash = (hash << 5) - hash + c.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

function flagIcon(severity: string, size: number) {
  const colors: Record<string, string> = { high: '#dc2626', medium: '#ea580c', low: '#ca8a04' };
  const c = colors[severity] ?? '#64748b';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${c}"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export default function ManagerDashboard() {
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const trailsRef = useRef<unknown[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<PatrolFlag | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [flagFilter, setFlagFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all');
  const [mapMode, setMapMode] = useState<'flags' | 'photos'>('flags');
  const [mapFilterDate, setMapFilterDate] = useState<string | null>(null);
  const [mapFilterPatroller, setMapFilterPatroller] = useState('');
  const todayStr = new Date().toISOString().slice(0, 7);

  const { data: liveData } = useQuery({
    queryKey: ['patrol-live'],
    queryFn: async () => { const r = await fetch('/api/patrol/live'); if (!r.ok) throw new Error(''); return r.json(); },
    refetchInterval: 15_000,
  });

  const { data: flagsData } = useQuery({
    queryKey: ['patrol-flags'],
    queryFn: async () => { const r = await fetch('/api/patrol/flags?limit=200'); if (!r.ok) throw new Error(''); return r.json(); },
    refetchInterval: 30_000,
  });

  const { data: notifData } = useQuery({
    queryKey: ['patrol-notifications'],
    queryFn: async () => { const r = await fetch('/api/patrol/notifications?limit=50'); if (!r.ok) throw new Error(''); return r.json(); },
    refetchInterval: 15_000,
  });

  const { data: sessionsData } = useQuery({
    queryKey: ['patrol-all-sessions'],
    queryFn: async () => { const r = await fetch('/api/patrol/sessions?limit=200'); if (!r.ok) throw new Error(''); return r.json(); },
    refetchInterval: 30_000,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['patrol-analytics-today', todayStr],
    queryFn: async () => { const r = await fetch(`/api/patrol/analytics?month=${todayStr}`); if (!r.ok) throw new Error(''); return r.json(); },
    refetchInterval: 60_000,
  });

  const { data: photosMapData } = useQuery({
    queryKey: ['patrol-photos-map', mapFilterDate, mapFilterPatroller],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '500' });
      const date = mapFilterDate ?? new Date().toISOString().slice(0, 10);
      params.set('date', date);
      if (mapFilterPatroller) params.set('patroller_email', mapFilterPatroller);
      const r = await fetch(`/api/patrol/photos?${params}`);
      if (!r.ok) throw new Error('');
      return r.json();
    },
    enabled: mapMode === 'photos',
    refetchInterval: 30_000,
  });

  const activeSessions: ActiveSession[] = liveData?.active_sessions ?? [];
  const allFlags: PatrolFlag[] = flagsData?.flags ?? [];
  const flags = flagFilter === 'all' ? allFlags : allFlags.filter((f) => f.status === flagFilter);
  const notifications: Notification[] = notifData?.notifications ?? [];
  const unreadCount: number = notifData?.unread_count ?? 0;
  const sessions = sessionsData?.sessions ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const todayAnalytics = analyticsData?.daily_trend?.find((d: { date: string }) => d.date === today);
  const totalKmToday = (todayAnalytics?.distance_km ?? 0) as number;
  const totalPhotosToday = (todayAnalytics?.photos ?? 0) as number;
  const openFlagCount = allFlags.filter((f) => f.status === 'open').length;

  const markAsRead = useMutation({
    mutationFn: async (notifId: number | 'all') => {
      await fetch(`/api/patrol/notifications/${notifId}`, { method: 'PATCH' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patrol-notifications'] }),
  });

  const updateFlagStatus = async (flagId: number, status: string, notes?: string) => {
    setResolving(true);
    try {
      await fetch(`/api/patrol/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution_notes: notes }),
      });
      queryClient.invalidateQueries({ queryKey: ['patrol-flags'] });
      setSelectedFlag(null);
      setResolveNotes('');
    } finally {
      setResolving(false);
    }
  };

  // Map init
  useEffect(() => {
    if (!mapRef.current || mapReady) return;
    let destroyed = false;
    import('leaflet').then((L) => {
      if (destroyed || !mapRef.current) return;
      // @ts-expect-error leaflet icon fix
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({ iconUrl: '/leaflet/marker-icon.png', iconRetinaUrl: '/leaflet/marker-icon-2x.png', shadowUrl: '/leaflet/marker-shadow.png' });
      const map = L.default.map(mapRef.current, { zoomControl: true, attributionControl: false });
      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      map.setView([20.5937, 78.9629], 5);
      mapInstanceRef.current = map;
      setMapReady(true);
    });
    return () => { destroyed = true; };
  }, [mapReady]);

  // Fetch trail pings for active sessions
  const fetchAndDrawTrails = useCallback(async () => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = await import('leaflet');
    const map = mapInstanceRef.current as ReturnType<typeof L.default.map>;
    for (const t of trailsRef.current) (t as ReturnType<typeof L.default.polyline>).remove();
    trailsRef.current = [];
    await Promise.all(activeSessions.map(async (s) => {
      try {
        const r = await fetch(`/api/patrol/sessions/${s.session_id}/ping`);
        if (!r.ok) return;
        const data = await r.json();
        const pings: { latitude: number; longitude: number }[] = data.pings ?? [];
        if (pings.length < 2) return;
        const coords = pings.map((p) => [p.latitude, p.longitude] as [number, number]);
        const color = emailToColor(s.patroller_email);
        const trail = L.default.polyline(coords, { color, weight: 3, opacity: 0.6 }).addTo(map);
        trailsRef.current.push(trail);
      } catch { /* ignore */ }
    }));
  }, [mapReady, activeSessions]);

  useEffect(() => { fetchAndDrawTrails(); }, [fetchAndDrawTrails]);

  // Map markers (mode-aware)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current as ReturnType<typeof L.default.map>;
      for (const m of markersRef.current) (m as ReturnType<typeof L.default.marker>).remove();
      markersRef.current = [];

      // Always show live patroller positions
      activeSessions.forEach((s) => {
        if (s.latitude == null || s.longitude == null) return;
        const color = emailToColor(s.patroller_email);
        const lastPing = s.last_ping_at
          ? `Last ping: ${new Date(s.last_ping_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`
          : '';
        const icon = L.default.divIcon({
          html: `<div style="width:22px;height:22px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
          iconSize: [22, 22], iconAnchor: [11, 11], className: '',
        });
        const marker = L.default.marker([s.latitude, s.longitude], { icon })
          .addTo(map)
          .bindPopup(`<div style="min-width:160px"><b>${s.patroller_name ?? s.patroller_email}</b><br><span style="color:#64748b;font-size:12px">${s.route_name ?? s.route_id}</span><br><span style="font-size:12px">${(s.total_distance_meters / 1000).toFixed(2)} km · ${s.photo_count} photos · ${s.flag_count} flags</span><br><span style="font-size:11px;color:#94a3b8">${lastPing}</span></div>`, { maxWidth: 220 });
        markersRef.current.push(marker);
      });

      if (mapMode === 'flags') {
        // Flag markers
        for (const f of allFlags) {
          const size = f.severity === 'high' ? 28 : f.severity === 'medium' ? 22 : 18;
          const icon = L.default.divIcon({ html: flagIcon(f.severity, size), iconSize: [size, size], iconAnchor: [4, size], className: '' });
          const statusBadge = f.status === 'resolved' ? ' ✓' : f.status === 'investigating' ? ' 🔍' : '';
          const marker = L.default.marker([f.latitude, f.longitude], { icon })
            .addTo(map)
            .bindTooltip(`<b>${f.severity.toUpperCase()}${statusBadge}</b> · ${f.route_name ?? f.route_id}<br><span style="font-size:11px">${f.description.slice(0, 70)}</span>`, { permanent: false });
          marker.on('click', () => setSelectedFlag(f));
          markersRef.current.push(marker);
        }
        const allCoords: [number, number][] = [
          ...activeSessions.filter((s) => s.latitude != null).map((s) => [s.latitude!, s.longitude!] as [number, number]),
          ...allFlags.map((f) => [f.latitude, f.longitude] as [number, number]),
        ];
        if (allCoords.length > 0) map.fitBounds(allCoords, { padding: [60, 60], maxZoom: 14 });
      } else {
        // Photo markers colored by patroller
        const photos: PatrolPhoto[] = photosMapData?.photos ?? [];
        for (const photo of photos) {
          const color = emailToColor(photo.patroller_email);
          const icon = L.default.divIcon({
            className: PHOTO_LOCATION_PIN_CLASS_NAME,
            html: photoLocationPinIconHtml(color, 'Patrol photo'),
            iconSize: [...PHOTO_LOCATION_PIN_ICON_SIZE],
            iconAnchor: [...PHOTO_LOCATION_PIN_ICON_ANCHOR],
          });
          const thumbUrl = `/api/patrol/photos/${photo.id}/image`;
          const timeStr = new Date(photo.created_at).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
          });
          const name = escapeHtml(photo.patroller_name ?? photo.patroller_email);
          const route = escapeHtml(photo.route_name ?? photo.route_id);
          const marker = L.default.marker([photo.latitude, photo.longitude], { icon })
            .addTo(map)
            .bindTooltip(`<b>${name}</b><br><span style="font-size:11px">${route} · ${escapeHtml(timeStr)}</span>`, { permanent: false })
            .bindPopup(
              `<div style="min-width:200px;">
                <a href="${thumbUrl}" target="_blank" rel="noopener noreferrer"><img src="${thumbUrl}" alt="" style="width:200px;height:200px;object-fit:cover;display:block;border-radius:4px;" /></a>
                <p style="margin:8px 0 0;font-size:12px;"><strong>${name}</strong></p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${route} · ${escapeHtml(timeStr)}</p>
                <p style="margin:6px 0 0;font-size:11px;"><a href="${thumbUrl}" target="_blank" rel="noopener noreferrer">Open full size</a></p>
              </div>`,
              { maxWidth: 240 }
            );
          markersRef.current.push(marker);
        }
        const allCoords: [number, number][] = [
          ...activeSessions.filter((s) => s.latitude != null).map((s) => [s.latitude!, s.longitude!] as [number, number]),
          ...photos.map((p) => [p.latitude, p.longitude] as [number, number]),
        ];
        if (allCoords.length > 0) map.fitBounds(allCoords, { padding: [60, 60], maxZoom: 16 });
      }
    });
  }, [mapReady, activeSessions, allFlags, mapMode, photosMapData]);

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">Patrol Manager</h1>
            <p className="text-xs text-slate-500">{activeSessions.length} active · {openFlagCount} open flags</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowNotifPanel(!showNotifPanel); if (!showNotifPanel && unreadCount > 0) markAsRead.mutate('all'); }}
            className="relative p-2 text-slate-600 hover:text-slate-900"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            {unreadCount > 0 && <span className="absolute top-0.5 right-0.5 bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <Link href="/patrol/manager/analytics" className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100">Analytics</Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Full-screen map */}
        <div className="absolute inset-0 z-0">
          <div ref={mapRef} className="w-full h-full" />

          {/* Stats overlay — clear Leaflet zoom (top-left); chips align right; when side panel open, stay left of it */}
          <div
            className={`absolute top-3 z-[500] pointer-events-none left-14 sm:left-16 ${
              panelOpen ? 'right-[20.5rem]' : 'right-3'
            }`}
          >
            <div className="flex gap-2 flex-wrap justify-end">
              <StatChip label="Active" value={String(activeSessions.length)} color="blue" />
              <StatChip label="Patrollers" value={String(new Set([...activeSessions.map((s) => s.patroller_email)]).size || activeSessions.length)} color="slate" />
              <StatChip label="Km today" value={totalKmToday.toFixed(1)} color="green" />
              <StatChip label="Photos today" value={String(totalPhotosToday)} color="purple" />
              <StatChip label="Open flags" value={String(openFlagCount)} color={openFlagCount > 0 ? 'red' : 'slate'} />
            </div>
          </div>

          {/* Map mode toggle */}
          <div className="absolute bottom-4 left-3 z-[500] flex gap-1.5">
            <button
              onClick={() => setMapMode('flags')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-md transition-colors ${mapMode === 'flags' ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-600 hover:bg-white'}`}
            >
              🚩 Flags
            </button>
            <button
              onClick={() => setMapMode('photos')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-md transition-colors ${mapMode === 'photos' ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-600 hover:bg-white'}`}
            >
              📷 All Photos
            </button>
          </div>

          {/* Panel toggle */}
          <button
            onClick={() => setPanelOpen((p) => !p)}
            className="absolute top-1/2 -translate-y-1/2 z-[500] bg-white border border-slate-200 shadow-md rounded-l-lg px-1 py-3 text-slate-500 hover:text-slate-800 transition-colors"
            style={{ right: panelOpen ? '20rem' : '0' }}
          >
            <svg className={`w-4 h-4 transition-transform ${panelOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {/* Side panel */}
        {panelOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden z-[400] shadow-xl">
            {showNotifPanel ? (
              <NotifPanel
                notifications={notifications}
                onClose={() => setShowNotifPanel(false)}
                onMarkRead={(nid) => markAsRead.mutate(nid)}
                onFlagClick={(n) => { setSelectedFlag(allFlags.find((x) => x.id === n.flag_id) ?? null); setShowNotifPanel(false); }}
              />
            ) : (
              <SessionsPanel
                sessions={sessions}
                activeSessions={activeSessions}
                flags={allFlags}
                flagFilter={flagFilter}
                setFlagFilter={setFlagFilter}
                onFlagClick={setSelectedFlag}
                onCalendarFilter={(date, patrollerEmail) => {
                  setMapFilterDate(date);
                  setMapFilterPatroller(patrollerEmail);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Flag detail modal */}
      {selectedFlag && (
        <FlagDetailModal
          flag={selectedFlag}
          resolveNotes={resolveNotes}
          setResolveNotes={setResolveNotes}
          resolving={resolving}
          onClose={() => { setSelectedFlag(null); setResolveNotes(''); }}
          onUpdateStatus={updateFlagStatus}
        />
      )}

    </div>
  );
}

// ─── Stat Chip ───────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-600/90 text-white',
    green: 'bg-green-600/90 text-white',
    purple: 'bg-purple-600/90 text-white',
    red: 'bg-red-600/90 text-white',
    slate: 'bg-slate-700/80 text-white',
  };
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow backdrop-blur-sm ${colors[color] ?? colors.slate}`}>
      <span className="font-bold">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  );
}

// ─── Sessions Panel ──────────────────────────────────────────────────────────

function SessionsPanel({ sessions, activeSessions, flags, flagFilter, setFlagFilter, onFlagClick, onCalendarFilter }: {
  sessions: ActiveSession[];
  activeSessions: ActiveSession[];
  flags: PatrolFlag[];
  flagFilter: 'all' | 'open' | 'investigating' | 'resolved';
  setFlagFilter: (f: 'all' | 'open' | 'investigating' | 'resolved') => void;
  onFlagClick: (f: PatrolFlag) => void;
  onCalendarFilter: (date: string | null, patrollerEmail: string) => void;
}) {
  const [tab, setTab] = useState<'live' | 'flags' | 'history'>('live');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [patrollerFilter, setPatrollerFilter] = useState('');
  const filtered = flagFilter === 'all' ? flags : flags.filter((f) => f.status === flagFilter);

  // Notify parent when filters change
  useEffect(() => {
    onCalendarFilter(selectedDate, patrollerFilter);
  }, [selectedDate, patrollerFilter, onCalendarFilter]);

  // Analytics for calendar highlighting
  const { data: calAnalytics } = useQuery({
    queryKey: ['patrol-cal-analytics', calendarMonth],
    queryFn: async () => {
      const r = await fetch(`/api/patrol/analytics?month=${calendarMonth}`);
      if (!r.ok) throw new Error('');
      return r.json();
    },
    enabled: tab === 'history',
    staleTime: 2 * 60 * 1000,
  });

  // Filtered sessions for selected date / patroller
  const { data: filteredSessionsData } = useQuery({
    queryKey: ['patrol-sessions-filtered', selectedDate, patrollerFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (selectedDate) params.set('date', selectedDate);
      if (patrollerFilter) params.set('patroller_email', patrollerFilter);
      const r = await fetch(`/api/patrol/sessions?${params}`);
      if (!r.ok) throw new Error('');
      return r.json();
    },
    enabled: !!(selectedDate || patrollerFilter) && tab === 'history',
  });

  const datesWithData = useMemo(() => {
    const s = new Set<string>();
    for (const d of calAnalytics?.daily_trend ?? []) s.add(d.date);
    return s;
  }, [calAnalytics]);

  const allPatrollers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) map.set(s.patroller_email, s.patroller_name ?? s.patroller_email);
    return [...map.entries()].map(([email, name]) => ({ email, name }));
  }, [sessions]);

  const historySessions: ActiveSession[] = (selectedDate || patrollerFilter)
    ? (filteredSessionsData?.sessions ?? [])
    : sessions.slice(0, 30);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {(['live', 'flags', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-xs font-semibold capitalize ${tab === t ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'live' ? `Live (${activeSessions.length})` : t === 'flags' ? `Flags (${flags.filter((f) => f.status !== 'resolved').length})` : 'History'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Live tab */}
        {tab === 'live' && (
          <div className="divide-y divide-slate-100">
            {activeSessions.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No active patrols right now</p>}
            {activeSessions.map((s) => (
              <div key={s.session_id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: emailToColor(s.patroller_email) }} />
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.patroller_name ?? s.patroller_email}</p>
                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Active</span>
                </div>
                <p className="text-xs text-slate-500 ml-4">{s.route_name ?? s.route_id}</p>
                <div className="flex gap-4 mt-1.5 ml-4 text-xs text-slate-600">
                  <span className="font-medium">{(s.total_distance_meters / 1000).toFixed(2)} km</span>
                  <span>{s.photo_count} photos</span>
                  {s.flag_count > 0 && <span className="text-red-600 font-medium">{s.flag_count} flags</span>}
                </div>
                {s.last_ping_at && (
                  <p className="text-xs text-slate-400 mt-0.5 ml-4">
                    Last ping {new Date(s.last_ping_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Flags tab */}
        {tab === 'flags' && (
          <>
            <div className="flex gap-1 px-3 py-2 border-b border-slate-100 flex-shrink-0">
              {(['all', 'open', 'investigating', 'resolved'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFlagFilter(f)}
                  className={`px-2 py-1 text-xs rounded-full font-medium capitalize ${flagFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No flags</p>}
              {filtered.map((f) => (
                <button key={f.id} onClick={() => onFlagClick(f)} className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={f.severity} />
                    <StatusBadge status={f.status} />
                    <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
                      {new Date(f.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 font-medium line-clamp-2">{f.description}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f.route_name ?? f.route_id} · {f.patroller_name ?? f.patroller_email}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="flex flex-col">
            {/* Patroller filter */}
            <div className="px-3 py-2 border-b border-slate-100">
              <select
                value={patrollerFilter}
                onChange={(e) => setPatrollerFilter(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Patrollers</option>
                {allPatrollers.map((p) => (
                  <option key={p.email} value={p.email}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Mini calendar */}
            <MiniCalendar
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              selectedDate={selectedDate}
              onDateSelect={(d) => setSelectedDate(d === selectedDate ? null : d)}
              datesWithData={datesWithData}
            />

            {/* Session list */}
            <div className="divide-y divide-slate-100">
              {selectedDate && (
                <p className="px-4 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 flex items-center justify-between">
                  <span>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })}</span>
                  <button onClick={() => setSelectedDate(null)} className="text-slate-400 hover:text-slate-600 text-xs">Clear ✕</button>
                </p>
              )}
              {historySessions.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  {selectedDate ? 'No patrols on this date' : 'Select a date to filter'}
                </p>
              )}
              {historySessions.map((s: ActiveSession) => (
                <div key={s.session_id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: emailToColor(s.patroller_email) }} />
                    <p className="text-sm font-medium text-slate-800 truncate">{s.patroller_name ?? s.patroller_email}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-slate-500 ml-4">{s.route_name ?? s.route_id}</p>
                  <div className="flex gap-3 ml-4 mt-0.5 text-xs text-slate-500">
                    <span>{(s.total_distance_meters / 1000).toFixed(2)} km</span>
                    <span>{s.photo_count} photos</span>
                    {s.flag_count > 0 && <span className="text-red-600">{s.flag_count} flags</span>}
                    <span className="ml-auto text-slate-400">
                      {new Date(s.started_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ month, onMonthChange, selectedDate, onDateSelect, datesWithData }: {
  month: string;
  onMonthChange: (m: string) => void;
  selectedDate: string | null;
  onDateSelect: (d: string) => void;
  datesWithData: Set<string>;
}) {
  const [year, mon] = month.split('-').map(Number);
  const firstDow = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const monthLabel = new Date(year, mon - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const today = new Date().toISOString().slice(0, 10);

  const prevMonth = () => {
    const d = new Date(year, mon - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, mon, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="px-3 py-2 border-b border-slate-100">
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 text-lg leading-none">‹</button>
        <span className="text-xs font-semibold text-slate-700">{monthLabel}</span>
        <button onClick={nextMonth} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 text-lg leading-none">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-xs text-slate-400 font-medium py-0.5">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasData = datesWithData.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === today;
          return (
            <button
              key={i}
              onClick={() => onDateSelect(dateStr)}
              className={`relative flex flex-col items-center justify-center py-1 rounded text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : isToday
                  ? 'bg-blue-50 text-blue-700'
                  : hasData
                  ? 'text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              {day}
              {hasData && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Flag Detail Modal ───────────────────────────────────────────────────────

function FlagDetailModal({ flag, resolveNotes, setResolveNotes, resolving, onClose, onUpdateStatus }: {
  flag: PatrolFlag;
  resolveNotes: string;
  setResolveNotes: (v: string) => void;
  resolving: boolean;
  onClose: () => void;
  onUpdateStatus: (id: number, status: string, notes?: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[600] p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className={`px-5 py-4 flex items-center justify-between ${flag.severity === 'high' ? 'bg-red-50' : flag.severity === 'medium' ? 'bg-amber-50' : 'bg-yellow-50'}`}>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={flag.severity} large />
            <StatusBadge status={flag.status} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-base font-bold text-slate-900">{flag.route_name ?? flag.route_id}</p>
            <p className="text-sm text-slate-500">{flag.patroller_name ?? flag.patroller_email} · {new Date(flag.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-sm text-slate-800">{flag.description}</p>
          </div>
          {flag.s3_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/patrol/flags/${flag.id}/image`} alt="Flag photo" className="w-full rounded-xl max-h-52 object-cover" />
          )}
          <a
            href={`https://maps.google.com/?q=${flag.latitude},${flag.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {flag.latitude.toFixed(5)}, {flag.longitude.toFixed(5)} — View on Google Maps
          </a>
          {flag.status === 'resolved' && flag.resolution_notes && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-700 mb-1">Resolution Notes</p>
              <p className="text-sm text-green-800">{flag.resolution_notes}</p>
              {flag.resolved_at && <p className="text-xs text-green-600 mt-1">Resolved {new Date(flag.resolved_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</p>}
            </div>
          )}
          {flag.status !== 'resolved' && (
            <div className="space-y-2 pt-1">
              {flag.status === 'open' && (
                <button onClick={() => onUpdateStatus(flag.id, 'investigating')} disabled={resolving} className="w-full border-2 border-amber-400 text-amber-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-amber-50 disabled:opacity-50">
                  🔍 Mark Investigating
                </button>
              )}
              <textarea rows={2} value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} placeholder="Resolution notes (optional)…" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={() => onUpdateStatus(flag.id, 'resolved', resolveNotes)} disabled={resolving} className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
                {resolving ? 'Resolving…' : '✓ Mark Resolved'}
              </button>
            </div>
          )}
          {flag.status === 'resolved' && (
            <div className="text-center py-2 text-green-700 font-semibold text-sm">✓ This flag has been resolved</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notification Panel ──────────────────────────────────────────────────────

function NotifPanel({ notifications, onClose, onMarkRead, onFlagClick }: {
  notifications: Notification[];
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onFlagClick: (n: Notification) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {notifications.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No notifications</p>}
        {notifications.map((n) => (
          <button key={n.id} onClick={() => { onMarkRead(n.id); onFlagClick(n); }} className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-red-50' : ''}`}>
            <div className="flex items-center gap-2 mb-0.5">
              {!n.is_read && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
              <SeverityBadge severity={n.severity} />
            </div>
            <p className="text-sm text-slate-800 font-medium line-clamp-2">{n.description}</p>
            <p className="text-xs text-slate-500 mt-0.5">{n.patroller_name ?? n.patroller_email} · {n.route_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function SeverityBadge({ severity, large }: { severity: string; large?: boolean }) {
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`font-bold uppercase rounded-full ${large ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5'} ${map[severity] ?? 'bg-slate-100 text-slate-600'}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    abandoned: 'bg-slate-100 text-slate-500',
    open: 'bg-red-100 text-red-700',
    investigating: 'bg-amber-100 text-amber-700',
    resolved: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}
