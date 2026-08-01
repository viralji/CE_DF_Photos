'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Assignment {
  id: number;
  route_id: string;
  route_name: string;
  photo_interval_meters: number;
  assigned_by_email: string;
  assigned_at: string;
  is_active: number;
}

interface PatrolSession {
  id: number;
  route_id: string;
  route_name: string;
  status: string;
  started_at: string;
  total_distance_meters: number;
  photo_count: number;
  flag_count: number;
  photo_interval_meters: number;
}

interface PatrollerNotification {
  id: number;
  flag_id: number;
  severity: string;
  description: string;
  route_name: string | null;
  route_id: string;
  resolved_by_email: string;
  resolution_notes: string | null;
  is_read: number;
  created_at: string;
}

export default function PatrolHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['patrol-assignments'],
    queryFn: async () => {
      const res = await fetch('/api/patrol/assignments');
      if (!res.ok) throw new Error('Failed to load assignments');
      return res.json();
    },
  });

  const { data: sessionsData } = useQuery({
    queryKey: ['patrol-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/patrol/sessions?status=active&limit=5');
      if (!res.ok) throw new Error('Failed to load sessions');
      return res.json();
    },
  });

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Failed to load me');
      return res.json();
    },
  });

  const { data: notifData } = useQuery({
    queryKey: ['patroller-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/patrol/patroller-notifications');
      if (!res.ok) return { notifications: [], unread_count: 0 };
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const assignments: Assignment[] = assignmentsData?.assignments ?? [];
  const activeSessions: PatrolSession[] = (sessionsData?.sessions ?? []).filter((s: PatrolSession) => s.status === 'active');
  const role = meData?.role;
  const notifications: PatrollerNotification[] = notifData?.notifications ?? [];
  const unreadCount: number = notifData?.unread_count ?? 0;

  async function startPatrol(assignmentId: number) {
    setStarting(assignmentId);
    setError('');
    try {
      const res = await fetch('/api/patrol/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start patrol'); return; }
      queryClient.invalidateQueries({ queryKey: ['patrol-sessions'] });
      router.push(`/patrol/session/${data.session.id}`);
    } finally {
      setStarting(null);
    }
  }

  if (role && role !== 'Patroller' && role !== 'Admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-slate-600 mb-4">This page is for Patrollers only.</p>
          <Link href="/" className="text-blue-600 underline">Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Patrol</h1>
          <p className="text-xs text-slate-500">My assigned routes</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowNotifs((v) => !v);
              if (!showNotifs && unreadCount > 0) {
                fetch('/api/patrol/patroller-notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
                  .then(() => queryClient.invalidateQueries({ queryKey: ['patroller-notifications'] }));
              }
            }}
            className="relative p-1.5 text-slate-500 hover:text-slate-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            {unreadCount > 0 && <span className="absolute top-0 right-0 bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          <Link href="/dashboard" className="text-sm text-blue-600">Home</Link>
        </div>
      </header>

      {/* Notification panel */}
      {showNotifs && (
        <div className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-800">Resolved Flag Notifications</h2>
              <button onClick={() => setShowNotifs(false)} className="text-slate-400 text-sm">✕</button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No notifications yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className={`rounded-lg px-3 py-2.5 text-sm ${!n.is_read ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-100'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-green-600 font-bold text-xs">✓ RESOLVED</span>
                      <span className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded ${n.severity === 'high' ? 'bg-red-100 text-red-700' : n.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'}`}>{n.severity}</span>
                      <span className="text-xs text-slate-400 ml-auto">{new Date(n.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}</span>
                    </div>
                    <p className="text-slate-800 line-clamp-2">{n.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.route_name ?? n.route_id} · by {n.resolved_by_email}</p>
                    {n.resolution_notes && <p className="text-xs text-green-700 mt-1 italic">&ldquo;{n.resolution_notes}&rdquo;</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {activeSessions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Active Patrol</h2>
            {activeSessions.map((s) => (
              <div key={s.id} className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{s.route_name ?? s.route_id}</p>
                    <p className="text-xs text-slate-500">Started {new Date(s.started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                  <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">ACTIVE</span>
                </div>
                <div className="flex gap-4 text-sm text-slate-600 mb-3">
                  <span>{(s.total_distance_meters / 1000).toFixed(2)} km</span>
                  <span>{s.photo_count} photos</span>
                  <span>{s.flag_count} flags</span>
                </div>
                <button
                  onClick={() => router.push(`/patrol/session/${s.id}`)}
                  className="w-full bg-amber-500 text-white font-semibold py-2 rounded-lg hover:bg-amber-600"
                >
                  Resume Patrol
                </button>
              </div>
            ))}
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">My Routes</h2>
          {assignmentsLoading ? (
            <p className="text-sm text-slate-500">Loading assignments…</p>
          ) : assignments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <p className="text-slate-500 text-sm">No routes assigned yet.</p>
              <p className="text-slate-400 text-xs mt-1">Contact your manager to get assigned to a route.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => {
                const isActive = activeSessions.some((s) => s.route_id === a.route_id);
                return (
                  <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">{a.route_name ?? a.route_id}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Photo every {a.photo_interval_meters}m</p>
                      </div>
                      {!a.is_active && (
                        <span className="text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    {a.is_active && !isActive && (
                      <button
                        onClick={() => startPatrol(a.id)}
                        disabled={starting === a.id}
                        className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                      >
                        {starting === a.id ? 'Starting…' : 'Start Patrol'}
                      </button>
                    )}
                    {isActive && (
                      <p className="text-sm text-amber-600 font-medium text-center">Patrol in progress on this route</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Past Patrols</h2>
          <PastSessions />
        </section>
      </main>
    </div>
  );
}

function PastSessions() {
  const { data } = useQuery({
    queryKey: ['patrol-past-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/patrol/sessions?limit=10');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });
  const sessions: PatrolSession[] = (data?.sessions ?? []).filter((s: PatrolSession) => s.status !== 'active');
  if (sessions.length === 0) return <p className="text-sm text-slate-500">No past patrols.</p>;
  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={`/patrol/history/${s.id}`}
          className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-slate-800">{s.route_name ?? s.route_id}</p>
            <p className="text-xs text-slate-500">{new Date(s.started_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · {(s.total_distance_meters / 1000).toFixed(2)} km · {s.photo_count} photos · {s.flag_count} flags</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {s.status}
            </span>
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}
