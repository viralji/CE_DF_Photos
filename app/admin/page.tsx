'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

async function getEntities() {
  const res = await fetch('/api/entities');
  if (!res.ok) throw new Error('Failed to fetch entities');
  return res.json();
}

async function getSubsectionEmails() {
  const res = await fetch('/api/subsections/emails');
  if (!res.ok) throw new Error('Failed to fetch subsection emails');
  return res.json();
}

async function getMe() {
  const res = await fetch('/api/me');
  if (!res.ok) throw new Error('Failed to fetch me');
  return res.json();
}

async function getUsers() {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
}

type AllowedRole = 'Engineer' | 'Reviewer' | 'Admin';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [routeId, setRouteId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [subRouteId, setSubRouteId] = useState('');
  const [subsectionId, setSubsectionId] = useState('');
  const [subsectionName, setSubsectionName] = useState('');
  const [message, setMessage] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [syncErpnextLoading, setSyncErpnextLoading] = useState(false);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current != null) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: subsectionsData } = useQuery({ queryKey: ['subsections'], queryFn: getSubsections });
  const { data: checkpointsData } = useQuery({ queryKey: ['checkpoints'], queryFn: getCheckpoints });
  const { data: entitiesData } = useQuery({ queryKey: ['entities'], queryFn: getEntities });
  const { data: subsectionEmailsData } = useQuery({ queryKey: ['subsection-emails'], queryFn: getSubsectionEmails });
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: activeTab === 3 && !!meData?.user?.email,
  });

  const routes = (routesData?.routes ?? []) as { route_id: string; route_name: string; length?: number | null }[];
  const subsections = (subsectionsData?.subsections ?? []) as { route_id: string; subsection_id: string; subsection_name: string; length?: number | null }[];
  const checkpoints = (checkpointsData?.checkpoints ?? []) as {
    id: number;
    entity_id: number;
    entity: string;
    entity_code?: string;
    checkpoint_name: string;
    code?: string | null;
    display_order: number;
    execution_stage?: string | null;
  }[];
  const entities = (entitiesData?.entities ?? []) as { id: number; name: string; code: string; display_order: number }[];
  const subsectionEmailsList = (subsectionEmailsData?.emails ?? []) as { id: number; route_id: string; subsection_id: string; email: string }[];
  const usersList = (usersData?.users ?? []) as { id: number; email: string; name: string | null; role: AllowedRole }[];

  const [editingEntityId, setEditingEntityId] = useState<number | null>(null);
  const [editingEntityName, setEditingEntityName] = useState('');
  const [editingEntityCode, setEditingEntityCode] = useState('');
  const [editingCheckpointId, setEditingCheckpointId] = useState<number | null>(null);
  const [editingCheckpointEntityId, setEditingCheckpointEntityId] = useState<number>(0);
  const [editingCheckpointName, setEditingCheckpointName] = useState('');
  const [editingCheckpointCode, setEditingCheckpointCode] = useState('');
  const [editingCheckpointOrder, setEditingCheckpointOrder] = useState(0);
  const [editingCheckpointStage, setEditingCheckpointStage] = useState<string>('Ongoing');
  const [subsectionEmailsByKey, setSubsectionEmailsByKey] = useState<Record<string, string[]>>({});
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<AllowedRole>('Reviewer');

  function scheduleMessageClear() {
    if (messageTimeoutRef.current != null) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => {
      setMessage('');
      messageTimeoutRef.current = null;
    }, 3000);
  }

  async function createRoute() {
    if (!routeId.trim() || !routeName.trim()) { 
      setMessage('⚠️ Route ID and name required.'); 
      scheduleMessageClear();
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
      scheduleMessageClear();
      return; 
    }
    setMessage('✓ Route created successfully!');
    scheduleMessageClear();
    setRouteId(''); setRouteName('');
    queryClient.invalidateQueries({ queryKey: ['routes'] });
  }

  async function createSubsection() {
    if (!subRouteId || !subsectionId.trim() || !subsectionName.trim()) { 
      setMessage('⚠️ Route, subsection ID and name required.'); 
      scheduleMessageClear();
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
      scheduleMessageClear();
      return; 
    }
    setMessage('✓ Subsection created successfully!');
    scheduleMessageClear();
    setSubsectionId(''); setSubsectionName('');
    queryClient.invalidateQueries({ queryKey: ['subsections'] });
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

  useEffect(() => {
    const byKey: Record<string, string[]> = {};
    for (const row of subsectionEmailsList) {
      const key = `${row.route_id}::${row.subsection_id}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(row.email);
    }
    setSubsectionEmailsByKey((prev) => (Object.keys(byKey).length > 0 ? { ...prev, ...byKey } : prev));
  }, [subsectionEmailsList]);

  async function createEntity(name: string, code: string) {
    const res = await fetch('/api/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), code: code.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Entity created.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['entities'] });
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  async function updateEntity(id: number, name: string, code: string, display_order: number) {
    const res = await fetch(`/api/entities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), code: code.trim(), display_order }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Entity updated.');
    scheduleMessageClear();
    setEditingEntityId(null);
    queryClient.invalidateQueries({ queryKey: ['entities'] });
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  async function deleteEntity(id: number) {
    if (!confirm('Delete this entity? Checkpoints under it must be removed first.')) return;
    const res = await fetch(`/api/entities/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Entity deleted.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['entities'] });
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  async function moveEntity(id: number, direction: 'up' | 'down') {
    const idx = entities.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= entities.length) return;
    const current = entities[idx];
    const swap = entities[swapIdx];
    const newOrderCurrent = swapIdx;
    const newOrderSwap = idx;
    const res1 = await fetch(`/api/entities/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: current.name, code: current.code, display_order: newOrderCurrent }),
    });
    const res2 = await fetch(`/api/entities/${swap.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: swap.name, code: swap.code, display_order: newOrderSwap }),
    });
    if (!res1.ok || !res2.ok) {
      const d1 = await res1.json().catch(() => ({}));
      const d2 = await res2.json().catch(() => ({}));
      setMessage(`❌ ${!res1.ok ? d1.error : d2.error || 'Reorder failed'}`);
      scheduleMessageClear();
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['entities'] });
  }

  async function moveCheckpoint(id: number, direction: 'up' | 'down') {
    const current = checkpoints.find((c) => c.id === id);
    if (!current) return;
    const sameEntity = checkpoints.filter((c) => c.entity_id === current.entity_id);
    const idx = sameEntity.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameEntity.length) return;
    const swap = sameEntity[swapIdx];
    const res1 = await fetch(`/api/checkpoints/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_order: swapIdx }),
    });
    const res2 = await fetch(`/api/checkpoints/${swap.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_order: idx }),
    });
    if (!res1.ok || !res2.ok) {
      const d1 = await res1.json().catch(() => ({}));
      const d2 = await res2.json().catch(() => ({}));
      setMessage(`❌ ${!res1.ok ? d1.error : d2.error || 'Reorder failed'}`);
      scheduleMessageClear();
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  const STAGE_OPTIONS = ['Before', 'Ongoing', 'After'] as const;

  async function createCheckpoint(entity_id: number, checkpoint_name: string, code: string, execution_stage: string) {
    const res = await fetch('/api/checkpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id, checkpoint_name: checkpoint_name.trim(), code: code.trim() || undefined, execution_stage: execution_stage === 'Before' || execution_stage === 'Ongoing' || execution_stage === 'After' ? execution_stage : 'Ongoing' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Checkpoint created.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  async function updateCheckpoint(id: number, entity_id: number, checkpoint_name: string, code: string, display_order: number, execution_stage: string) {
    const res = await fetch(`/api/checkpoints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id, checkpoint_name: checkpoint_name.trim(), code: code.trim(), display_order, execution_stage: execution_stage === 'Before' || execution_stage === 'Ongoing' || execution_stage === 'After' ? execution_stage : 'Ongoing' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Checkpoint updated.');
    scheduleMessageClear();
    setEditingCheckpointId(null);
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  async function deleteCheckpoint(id: number) {
    if (!confirm('Delete this checkpoint? It cannot have any photo submissions.')) return;
    const res = await fetch(`/api/checkpoints/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Checkpoint deleted.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
  }

  async function saveSubsectionEmails(route_id: string, subsection_id: string, emails: string[]) {
    const res = await fetch('/api/subsections/emails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_id, subsection_id, emails }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Subsection emails saved.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['subsection-emails'] });
  }

  async function updateUserRole(userId: number, role: AllowedRole) {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed to update role'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ Role updated.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  async function createUser() {
    const email = newUserEmail.trim().toLowerCase();
    if (!email) {
      setMessage('⚠️ Email is required.');
      scheduleMessageClear();
      return;
    }
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: newUserName.trim(), role: newUserRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed to add user'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ User added.');
    scheduleMessageClear();
    setNewUserEmail('');
    setNewUserName('');
    setNewUserRole('Reviewer');
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  async function deleteUser(userId: number, email: string) {
    if (!confirm(`Remove user ${email}? They will need to be re-added to access the app.`)) return;
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`❌ ${data.error || 'Failed to delete user'}`);
      scheduleMessageClear();
      return;
    }
    setMessage('✓ User removed.');
    scheduleMessageClear();
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  const isAdmin = meData?.role === 'Admin';
  const meLoaded = meData !== undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-800"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-lg font-bold text-slate-900">Admin</h1>
        </div>
      </header>

      {meLoaded && !isAdmin && (
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
            <p className="font-medium">Access denied.</p>
            <p className="text-sm mt-1">Only Admins can access this page.</p>
            <Link href="/dashboard" className="inline-block mt-3 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">Back to Dashboard</Link>
          </div>
        </main>
      )}

      {meLoaded && isAdmin && (
      <>
      <div className="flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 flex gap-1">
          {[
            { label: 'Routes & Subsections', idx: 0 },
            { label: 'Entities & Checkpoints', idx: 1 },
            { label: 'Subsection emails', idx: 2 },
            { label: 'Users & roles', idx: 3 },
            { label: 'Settings', idx: 4 },
          ].map(({ label, idx }) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === idx
                  ? 'border-blue-600 text-blue-700 bg-slate-50'
                  : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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

        {activeTab === 0 && (
        <div className="space-y-4">
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
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Sync with ERPNext</h2>
          <p className="text-xs text-slate-500 mb-3">Fetch report &quot;DF QC App Report&quot; from ERPNext and add missing routes (ID from 1001) and subsections (ID from 10001). Existing data is never deleted.</p>
          <button
            type="button"
            onClick={async () => {
              setSyncErpnextLoading(true);
              setMessage('');
              try {
                const res = await fetch('/api/sync-erpnext', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setMessage(`❌ ${data?.message ?? data?.error ?? 'Sync failed'}`);
                  return;
                }
                setMessage(`✓ ${data?.message ?? 'Synced.'}`);
                scheduleMessageClear();
                queryClient.invalidateQueries({ queryKey: ['routes'] });
                queryClient.invalidateQueries({ queryKey: ['subsections'] });
              } catch (e) {
                setMessage(`❌ ${(e as Error).message}`);
              } finally {
                setSyncErpnextLoading(false);
              }
            }}
            disabled={syncErpnextLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncErpnextLoading ? 'Syncing…' : 'Sync with ERPNext'}
          </button>
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
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Routes (review)</h2>
          <p className="text-xs text-slate-500 mb-2">Length is populated from ERP sync (route_length).</p>
          <div className="overflow-x-auto max-h-[30vh] overflow-y-auto mb-4">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Route ID</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Route Name</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {routes.map((r) => (
                  <tr key={r.route_id} className="hover:bg-slate-50">
                    <td className="p-2 font-mono text-slate-800">{r.route_id}</td>
                    <td className="p-2 text-slate-900">{r.route_name || '—'}</td>
                    <td className="p-2 text-slate-600">{r.length != null ? String(r.length) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Subsections (review)</h2>
          <p className="text-xs text-slate-500 mb-2">Length is populated from ERP sync (subsection_length).</p>
          <div className="overflow-x-auto max-h-[30vh] overflow-y-auto mb-4">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-700">Route ID</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Subsection ID</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Subsection Name</th>
                  <th className="text-left p-2 font-semibold text-slate-700">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subsections.map((s) => (
                  <tr key={s.route_id + '::' + s.subsection_id} className="hover:bg-slate-50">
                    <td className="p-2 font-mono text-slate-800">{s.route_id}</td>
                    <td className="p-2 font-mono text-slate-800">{s.subsection_id}</td>
                    <td className="p-2 text-slate-900">{s.subsection_name || '—'}</td>
                    <td className="p-2 text-slate-600">{s.length != null ? String(s.length) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        </div>
        )}

        {activeTab === 1 && (
        <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <h2 className="font-semibold text-slate-900 text-sm mb-1">Entities</h2>
          <p className="text-xs text-slate-500 mb-2">Manage entities (display order and codes).</p>
          <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left p-1.5 font-semibold text-slate-700">Order</th>
                      <th className="text-left p-1.5 font-semibold text-slate-700">Name</th>
                      <th className="text-left p-1.5 font-semibold text-slate-700">Code</th>
                      <th className="text-left p-1.5 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entities.map((e, idx) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="p-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 font-mono text-xs w-4 tabular-nums">{idx + 1}</span>
                            <span className="flex items-center gap-0.5">
                              <button type="button" onClick={() => moveEntity(e.id, 'up')} disabled={idx === 0} className="p-0.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 text-xs" aria-label="Move up">↑</button>
                              <button type="button" onClick={() => moveEntity(e.id, 'down')} disabled={idx === entities.length - 1} className="p-0.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 text-xs" aria-label="Move down">↓</button>
                            </span>
                          </div>
                        </td>
                    {editingEntityId === e.id ? (
                      <>
                        <td className="p-1.5" colSpan={2}>
                          <input type="text" value={editingEntityName} onChange={(ev) => setEditingEntityName(ev.target.value)} className="px-1.5 py-0.5 border border-slate-300 rounded text-xs w-32 mr-1.5" placeholder="Name" />
                          <input type="text" value={editingEntityCode} onChange={(ev) => setEditingEntityCode(ev.target.value)} maxLength={3} className="px-1.5 py-0.5 border border-slate-300 rounded text-xs w-12 font-mono" placeholder="Code" />
                          {entities.some((o) => o.id !== e.id && (o.code || '').toUpperCase() === (editingEntityCode || '').trim().toUpperCase()) && (
                            <span className="text-red-600 text-xs ml-1">Code already in use</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          <button type="button" onClick={() => updateEntity(e.id, editingEntityName, editingEntityCode, e.display_order)} disabled={entities.some((o) => o.id !== e.id && (o.code || '').toUpperCase() === (editingEntityCode || '').trim().toUpperCase())} className="text-blue-600 hover:text-blue-800 text-xs mr-1 disabled:opacity-50">Save</button>
                          <button type="button" onClick={() => { setEditingEntityId(null); }} className="text-slate-600 hover:text-slate-800 text-xs">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-1.5 font-medium text-slate-900">{e.name}</td>
                        <td className="p-1.5 font-mono text-blue-600">{e.code}</td>
                        <td className="p-1.5">
                          <button type="button" onClick={() => { setEditingEntityId(e.id); setEditingEntityName(e.name); setEditingEntityCode(e.code); }} className="text-blue-600 hover:text-blue-800 text-xs mr-1">Edit</button>
                          <button type="button" onClick={() => deleteEntity(e.id)} className="text-red-600 hover:text-red-800 text-xs mr-1">Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="mt-2 flex flex-wrap gap-1.5 items-center" onSubmit={(ev) => { ev.preventDefault(); const n = (ev.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="new-entity-name"]'); const c = (ev.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="new-entity-code"]'); const code = (c?.value ?? '').trim().toUpperCase(); if (n?.value.trim()) { if (entities.some((o) => (o.code || '').toUpperCase() === code)) { setMessage('⚠️ Entity code already in use.'); scheduleMessageClear(); return; } createEntity(n.value.trim(), c?.value.trim() ?? ''); n.value = ''; if (c) c.value = ''; } }}>
            <input name="new-entity-name" type="text" placeholder="Entity name" className="px-1.5 py-1 border border-slate-300 rounded text-xs w-36" />
            <input name="new-entity-code" type="text" placeholder="Code (3)" maxLength={3} className="px-1.5 py-1 border border-slate-300 rounded text-xs w-14 font-mono" />
            <button type="submit" className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Add entity</button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-1">Checkpoints</h2>
          <p className="text-xs text-slate-500 mb-3">Photo filenames use entity code and checkpoint code. Category is the execution stage (Before / Ongoing / After) for capture.</p>
          {checkpoints.length === 0 && entities.length === 0 ? (
            <p className="text-slate-500 text-sm">No checkpoints yet. Add entities above, then add checkpoints below.</p>
          ) : (
            <>
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-700">Order</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Entity</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Checkpoint</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Code</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Category</th>
                      <th className="text-left p-2 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {checkpoints.map((c, idx) => {
                      const sameEntity = checkpoints.filter((x) => x.entity_id === c.entity_id);
                      const idxInEntity = sameEntity.findIndex((x) => x.id === c.id);
                      const canMoveUp = idxInEntity > 0;
                      const canMoveDown = idxInEntity < sameEntity.length - 1;
                      return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="p-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 font-mono text-xs w-4 tabular-nums">{idx + 1}</span>
                            <span className="flex items-center gap-0.5">
                              <button type="button" onClick={() => moveCheckpoint(c.id, 'up')} disabled={!canMoveUp} className="p-0.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 text-xs">↑</button>
                              <button type="button" onClick={() => moveCheckpoint(c.id, 'down')} disabled={!canMoveDown} className="p-0.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 text-xs">↓</button>
                            </span>
                          </div>
                        </td>
                        {editingCheckpointId === c.id ? (
                          <>
                            <td className="p-2">
                              <select value={editingCheckpointEntityId} onChange={(ev) => setEditingCheckpointEntityId(Number(ev.target.value))} className="px-2 py-1 border border-slate-300 rounded text-sm w-36">
                                {entities.map((ent) => (
                                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <input type="text" value={editingCheckpointName} onChange={(ev) => setEditingCheckpointName(ev.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm w-40" placeholder="Checkpoint name" />
                            </td>
                            <td className="p-2">
                              <input type="text" value={editingCheckpointCode} onChange={(ev) => setEditingCheckpointCode(ev.target.value)} maxLength={3} className="px-2 py-1 border border-slate-300 rounded text-sm w-16 font-mono" placeholder="Code" />
                              {(() => { const norm = (editingCheckpointCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); const dup = norm.length === 3 && checkpoints.some((o) => o.entity_id === editingCheckpointEntityId && o.id !== editingCheckpointId && (o.code || '').toUpperCase() === norm); return dup ? <span className="text-red-600 text-xs ml-1 block">Code already in use for this entity</span> : null; })()}
                            </td>
                            <td className="p-2">
                              <select value={editingCheckpointStage} onChange={(ev) => setEditingCheckpointStage(ev.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm">
                                {STAGE_OPTIONS.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              {(() => { const norm = (editingCheckpointCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); const dup = norm.length === 3 && checkpoints.some((o) => o.entity_id === editingCheckpointEntityId && o.id !== editingCheckpointId && (o.code || '').toUpperCase() === norm); return <><button type="button" onClick={() => updateCheckpoint(c.id, editingCheckpointEntityId, editingCheckpointName, editingCheckpointCode, editingCheckpointOrder, editingCheckpointStage)} disabled={dup} className="text-blue-600 hover:text-blue-800 text-xs mr-2 disabled:opacity-50">Save</button>
                              <button type="button" onClick={() => setEditingCheckpointId(null)} className="text-slate-600 hover:text-slate-800 text-xs">Cancel</button></>; })()}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2 font-medium text-slate-900">{c.entity}</td>
                            <td className="p-2 text-slate-700">{c.checkpoint_name}</td>
                            <td className="p-2 font-mono text-blue-600">{c.code ?? '—'}</td>
                            <td className="p-2">
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                                (c.execution_stage ?? 'Ongoing') === 'Before' ? 'bg-blue-100 text-blue-700' :
                                (c.execution_stage ?? 'Ongoing') === 'Ongoing' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {c.execution_stage ?? 'Ongoing'}
                              </span>
                            </td>
                            <td className="p-2">
                              <button type="button" onClick={() => { setEditingCheckpointId(c.id); setEditingCheckpointEntityId(c.entity_id); setEditingCheckpointName(c.checkpoint_name); setEditingCheckpointCode(c.code ?? ''); setEditingCheckpointOrder(c.display_order); setEditingCheckpointStage((c.execution_stage === 'Before' || c.execution_stage === 'Ongoing' || c.execution_stage === 'After') ? c.execution_stage : 'Ongoing'); }} className="text-blue-600 hover:text-blue-800 text-xs mr-2">Edit</button>
                              <button type="button" onClick={() => deleteCheckpoint(c.id)} className="text-red-600 hover:text-red-800 text-xs mr-2">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mt-3">{checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''} total.</p>
              </div>
              <form className="mt-3 flex flex-wrap gap-2 items-end" onSubmit={(ev) => { ev.preventDefault(); const entityId = (ev.target as HTMLFormElement).querySelector<HTMLSelectElement>('[name="new-checkpoint-entity"]'); const nameEl = (ev.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="new-checkpoint-name"]'); const codeEl = (ev.target as HTMLFormElement).querySelector<HTMLInputElement>('[name="new-checkpoint-code"]'); const stageEl = (ev.target as HTMLFormElement).querySelector<HTMLSelectElement>('[name="new-checkpoint-stage"]'); if (entityId?.value && nameEl?.value.trim()) { createCheckpoint(Number(entityId.value), nameEl.value.trim(), codeEl?.value.trim() ?? '', stageEl?.value ?? 'Ongoing'); nameEl.value = ''; if (codeEl) codeEl.value = ''; } }}>
                <select name="new-checkpoint-entity" className="px-2 py-1.5 border border-slate-300 rounded text-sm w-40" required>
                  <option value="">Entity…</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
                <input name="new-checkpoint-name" type="text" placeholder="Checkpoint name" className="px-2 py-1.5 border border-slate-300 rounded text-sm w-48" required />
                <input name="new-checkpoint-code" type="text" placeholder="Code (3 chars)" maxLength={3} className="px-2 py-1.5 border border-slate-300 rounded text-sm w-20 font-mono" />
                <select name="new-checkpoint-stage" className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28">
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Add checkpoint</button>
              </form>
            </>
          )}
        </div>
        </div>
        )}

        {activeTab === 2 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Subsection allowed emails</h2>
          <p className="text-xs text-slate-500 mb-3">Add allowed emails per subsection for future access control.</p>
          {subsections.length === 0 ? <p className="text-slate-500 text-sm">Create subsections above first.</p> : (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {subsections.map((s) => {
                const key = s.route_id + '::' + s.subsection_id;
                const emails = subsectionEmailsByKey[key] ?? [];
                return (
                  <div key={key} className="border border-slate-200 rounded p-2 text-sm">
                    <span className="font-medium text-slate-800">{s.subsection_name}</span> ({s.route_id} / {s.subsection_id})
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      {emails.map((email, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs">
                          {email}
                          <button type="button" onClick={() => { const next = emails.filter((_, j) => j !== i); setSubsectionEmailsByKey((p) => ({ ...p, [key]: next })) }} className="text-slate-500 hover:text-red-600">x</button>
                        </span>
                      ))}
                      <input type="email" placeholder="Add email" className="px-2 py-1 border border-slate-300 rounded text-xs w-40" data-subsection-key={key} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const el = e.target as HTMLInputElement; const v = el.value.trim(); if (v) { const next = [...emails, v]; setSubsectionEmailsByKey((p) => ({ ...p, [key]: next })); el.value = ''; } } }} />
                      <button type="button" onClick={() => { const input = document.querySelector(`input[data-subsection-key="${key}"]`) as HTMLInputElement | null; const v = input?.value?.trim(); if (v) { const next = [...(subsectionEmailsByKey[key] ?? []), v]; setSubsectionEmailsByKey((p) => ({ ...p, [key]: next })); if (input) input.value = ''; } }} className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded hover:bg-slate-200">Add</button>
                      <button type="button" onClick={() => { const input = document.querySelector(`input[data-subsection-key="${key}"]`) as HTMLInputElement | null; const v = input?.value?.trim(); const toSave = v ? [...(subsectionEmailsByKey[key] ?? []), v] : (subsectionEmailsByKey[key] ?? []); saveSubsectionEmails(s.route_id, s.subsection_id, toSave); if (v) { setSubsectionEmailsByKey((p) => ({ ...p, [key]: toSave })); if (input) input.value = ''; } }} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Save</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {activeTab === 3 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Users & roles</h2>
          <p className="text-xs text-slate-500 mb-3">Assign roles: Engineer (capture only), Reviewer (capture, review, gallery, map, reports), Admin (full access).</p>

          <div className="mb-4 p-3 border border-slate-200 rounded-lg bg-slate-50">
            <h3 className="text-xs font-semibold text-slate-700 mb-2">Add user</h3>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="min-w-[180px]">
                <label className="block text-xs font-medium text-slate-600 mb-0.5">Email</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="min-w-[120px]">
                <label className="block text-xs font-medium text-slate-600 mb-0.5">Name</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Display name"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="min-w-[100px]">
                <label className="block text-xs font-medium text-slate-600 mb-0.5">Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as AllowedRole)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Engineer">Engineer</option>
                  <option value="Reviewer">Reviewer</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <button
                type="button"
                onClick={createUser}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
              >
                Add user
              </button>
            </div>
          </div>

          {usersData == null ? (
            <p className="text-slate-500 text-sm">Loading users…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-700">Email</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Name</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Role</th>
                    <th className="text-left p-2 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="p-2 font-medium text-slate-900">{u.email}</td>
                      <td className="p-2 text-slate-600">{u.name ?? '—'}</td>
                      <td className="p-2">
                        <select
                          value={u.role}
                          onChange={(e) => updateUserRole(u.id, e.target.value as AllowedRole)}
                          className="px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="Engineer">Engineer</option>
                          <option value="Reviewer">Reviewer</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </td>
                      <td className="p-2">
                        {u.email !== meData?.user?.email ? (
                          <button
                            type="button"
                            onClick={() => deleteUser(u.id, u.email)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">(you)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {activeTab === 4 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 text-sm mb-3">Capture rules</h2>

          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-2">Enter maximum allowed distance (m). If set, capture is allowed only when the user is within this distance of the nearest existing photo in the subsection. The first photo in a subsection is always allowed. Leave empty or disable for no limit.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={`max-dist-${meData?.maxCaptureDistanceMeters ?? 'none'}`}
                type="number"
                min={1}
                step={1}
                placeholder="40"
                defaultValue={meData?.maxCaptureDistanceMeters ?? ''}
                id="admin-max-capture-distance"
                className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  const el = document.getElementById('admin-max-capture-distance') as HTMLInputElement | null;
                  const raw = el?.value?.trim();
                  const val = raw === '' ? null : Math.floor(Number(raw));
                  if (val !== null && (!Number.isFinite(val) || val <= 0)) {
                    scheduleMessageClear();
                    setMessage('❌ Enter a positive number or leave empty.');
                    return;
                  }
                  try {
                    const res = await fetch('/api/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ maxCaptureDistanceMeters: val }),
                    });
                    if (!res.ok) throw new Error('Failed to update');
                    await queryClient.invalidateQueries({ queryKey: ['me'] });
                    scheduleMessageClear();
                    setMessage(val != null ? `✓ Max distance between photos set to ${val} m.` : '✓ Distance limit disabled.');
                  } catch (err) {
                    setMessage('❌ Failed to update setting.');
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={async () => {
                  const el = document.getElementById('admin-max-capture-distance') as HTMLInputElement | null;
                  if (el) el.value = '';
                  try {
                    const res = await fetch('/api/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ maxCaptureDistanceMeters: null }),
                    });
                    if (!res.ok) throw new Error('Failed to update');
                    await queryClient.invalidateQueries({ queryKey: ['me'] });
                    scheduleMessageClear();
                    setMessage('✓ Distance limit disabled.');
                  } catch (err) {
                    setMessage('❌ Failed to update setting.');
                  }
                }}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 text-sm rounded hover:bg-slate-50"
              >
                Disable
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2">Max GPS accuracy (m): block capture if accuracy is worse than ±X m. Leave empty or disable for no limit.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={`max-acc-${meData?.maxGpsAccuracyMeters ?? 'none'}`}
                type="number"
                min={1}
                step={1}
                placeholder="20"
                defaultValue={meData?.maxGpsAccuracyMeters ?? ''}
                id="admin-max-gps-accuracy"
                className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  const el = document.getElementById('admin-max-gps-accuracy') as HTMLInputElement | null;
                  const raw = el?.value?.trim();
                  const val = raw === '' ? null : Math.floor(Number(raw));
                  if (val !== null && (!Number.isFinite(val) || val <= 0)) {
                    scheduleMessageClear();
                    setMessage('❌ Enter a positive number or leave empty.');
                    return;
                  }
                  try {
                    const res = await fetch('/api/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ maxGpsAccuracyMeters: val }),
                    });
                    if (!res.ok) throw new Error('Failed to update');
                    await queryClient.invalidateQueries({ queryKey: ['me'] });
                    scheduleMessageClear();
                    setMessage(val != null ? `✓ Max GPS accuracy set to ±${val} m.` : '✓ GPS accuracy limit disabled.');
                  } catch (err) {
                    setMessage('❌ Failed to update setting.');
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={async () => {
                  const el = document.getElementById('admin-max-gps-accuracy') as HTMLInputElement | null;
                  if (el) el.value = '';
                  try {
                    const res = await fetch('/api/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ maxGpsAccuracyMeters: null }),
                    });
                    if (!res.ok) throw new Error('Failed to update');
                    await queryClient.invalidateQueries({ queryKey: ['me'] });
                    scheduleMessageClear();
                    setMessage('✓ GPS accuracy limit disabled.');
                  } catch (err) {
                    setMessage('❌ Failed to update setting.');
                  }
                }}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 text-sm rounded hover:bg-slate-50"
              >
                Disable
              </button>
            </div>
          </div>
        </div>
        )}
      </main>
      </>
      )}
    </div>
  );
}
