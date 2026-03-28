'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

type PromptVersion = {
  id: number;
  version: number;
  system_context: string;
  scoring_guide: string;
  is_active: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

type Checkpoint = {
  id: number;
  checkpoint_name: string;
  entity_name?: string;
  entity?: string;
};


async function getMe() {
  const res = await fetch('/api/me');
  if (!res.ok) throw new Error('Failed to fetch me');
  return res.json();
}

async function getVersions(): Promise<{ versions: PromptVersion[] }> {
  const res = await fetch('/api/admin/ai-config');
  if (!res.ok) throw new Error('Failed to load versions');
  return res.json();
}

async function getCheckpoints(): Promise<{ checkpoints: Checkpoint[] }> {
  const res = await fetch('/api/checkpoints');
  if (!res.ok) throw new Error('Failed to load checkpoints');
  return res.json();
}

export default function AiConfigPage() {
  const [activeTab, setActiveTab] = useState(0);
  const queryClient = useQueryClient();

  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ['ai-versions'],
    queryFn: getVersions,
  });
  const { data: checkpointsData } = useQuery({
    queryKey: ['checkpoints'],
    queryFn: getCheckpoints,
  });

  const isAdmin = meData?.role === 'Admin';

  if (!isAdmin) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: '#ef4444' }}>Admin access required.</p>
        <Link href="/admin" style={{ color: '#3b82f6' }}>← Back to Admin</Link>
      </div>
    );
  }

  const versions = versionsData?.versions ?? [];
  const activeVersion = versions.find((v) => v.is_active === 1);
  const checkpoints = checkpointsData?.checkpoints ?? [];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto', fontFamily: 'monospace' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 13 }}>
          ← Admin
        </Link>
        <h1 style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 700 }}>AI Scoring Config</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
          Manage the base prompt, per-checkpoint instructions, and preview compiled prompts.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
        {['Base Prompt', 'Preview Prompt'].map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: activeTab === i ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === i ? 700 : 400,
              color: activeTab === i ? '#3b82f6' : '#374151',
              fontSize: 14,
              fontFamily: 'monospace',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <BasePromptTab
          versions={versions}
          activeVersion={activeVersion}
          versionsLoading={versionsLoading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['ai-versions'] })}
        />
      )}
      {activeTab === 1 && (
        <PreviewPromptTab checkpoints={checkpoints} />
      )}
    </div>
  );
}

// ─── Tab 1: Base Prompt ────────────────────────────────────────────────────────

function BasePromptTab({
  versions,
  activeVersion,
  versionsLoading,
  onRefresh,
}: {
  versions: PromptVersion[];
  activeVersion: PromptVersion | undefined;
  versionsLoading: boolean;
  onRefresh: () => void;
}) {
  const [systemContext, setSystemContext] = useState('');
  const [scoringGuide, setScoringGuide] = useState('');
  const [notes, setNotes] = useState('');
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [activating, setActivating] = useState<number | null>(null);

  useEffect(() => {
    if (activeVersion) {
      setSystemContext(activeVersion.system_context);
      setScoringGuide(activeVersion.scoring_guide);
    }
  }, [activeVersion]);

  async function handleSave() {
    if (!systemContext.trim() || !scoringGuide.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_context: systemContext, scoring_guide: scoringGuide, notes, activate }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setMsg(`Saved as v${data.version}${data.is_active ? ' — now active' : ''}`);
      setNotes('');
      onRefresh();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: number) {
    setActivating(id);
    try {
      const res = await fetch(`/api/admin/ai-config/${id}`, { method: 'PUT' });
      if (!res.ok) throw new Error((await res.json()).error);
      onRefresh();
    } catch (e) {
      alert(`Failed to activate: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActivating(null);
    }
  }

  function handleLoadVersion(v: PromptVersion) {
    setSystemContext(v.system_context);
    setScoringGuide(v.scoring_guide);
    setNotes(`Based on v${v.version}`);
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>
          System Context
          <span style={{ color: '#6b7280', fontWeight: 400 }}> — who is the AI, what is it doing</span>
        </label>
        <textarea
          value={systemContext}
          onChange={(e) => setSystemContext(e.target.value)}
          rows={4}
          style={textareaStyle}
          placeholder="You are a QC inspector..."
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>
          Scoring Guide
          <span style={{ color: '#6b7280', fontWeight: 400 }}> — rubric injected at end of every prompt</span>
        </label>
        <textarea
          value={scoringGuide}
          onChange={(e) => setScoringGuide(e.target.value)}
          rows={8}
          style={textareaStyle}
          placeholder="Scoring guide:&#10;- 90-100: Excellent..."
        />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
            placeholder="What changed in this version?"
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', paddingBottom: 6 }}>
          <input
            type="checkbox"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
          />
          Make active immediately
        </label>
        <button
          onClick={handleSave}
          disabled={saving || !systemContext.trim() || !scoringGuide.trim()}
          style={btnStyle(saving)}
        >
          {saving ? 'Saving…' : 'Save New Version'}
        </button>
      </div>
      {msg && <p style={{ fontSize: 13, color: msg.startsWith('Error') ? '#ef4444' : '#16a34a', margin: '4px 0' }}>{msg}</p>}

      {/* Version history */}
      <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 32, marginBottom: 10 }}>Version History</h3>
      {versionsLoading ? (
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
      ) : versions.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: 13 }}>No versions saved yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Ver', 'Status', 'Notes', 'By', 'Date', ''].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #e5e7eb', background: v.is_active ? '#f0fdf4' : 'white' }}>
                <td style={tdStyle}>v{v.version}</td>
                <td style={tdStyle}>
                  {v.is_active ? (
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>● Active</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.notes ?? <span style={{ color: '#9ca3af' }}>—</span>}
                </td>
                <td style={tdStyle}>{v.created_by ?? '—'}</td>
                <td style={tdStyle}>{new Date(v.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td style={{ ...tdStyle, display: 'flex', gap: 8 }}>
                  <button onClick={() => handleLoadVersion(v)} style={smallBtnStyle}>Load</button>
                  {!v.is_active && (
                    <button
                      onClick={() => handleActivate(v.id)}
                      disabled={activating === v.id}
                      style={{ ...smallBtnStyle, color: '#16a34a', borderColor: '#16a34a' }}
                    >
                      {activating === v.id ? '…' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Tab 2: Checkpoint Instructions ───────────────────────────────────────────

// ─── Tab 2: Preview Prompt ─────────────────────────────────────────────────────

function PreviewPromptTab({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePreview() {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    setPrompt('');
    try {
      const res = await fetch(`/api/admin/ai-config/preview?checkpointId=${selectedId}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Group checkpoints by entity
  const grouped: Record<string, Checkpoint[]> = {};
  for (const cp of checkpoints) {
    const entity = cp.entity_name ?? cp.entity ?? 'Other';
    if (!grouped[entity]) grouped[entity] = [];
    grouped[entity].push(cp);
  }

  const charCount = prompt.length;
  const approxTokens = Math.round(charCount / 4);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        See the exact prompt that will be sent to Gemini for any checkpoint. Includes the active base prompt,
        checkpoint-specific instructions (if set), and reviewer history stats.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Select Checkpoint</label>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(parseInt(e.target.value, 10) || '');
              setPrompt('');
              setError('');
            }}
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">— choose a checkpoint —</option>
            {Object.entries(grouped).map(([entity, cps]) => (
              <optgroup key={entity} label={entity}>
                {cps.map((cp) => (
                  <option key={cp.id} value={cp.id}>{cp.checkpoint_name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          onClick={handlePreview}
          disabled={!selectedId || loading}
          style={{ ...btnStyle(!selectedId || loading), paddingBottom: 8, paddingTop: 8 }}
        >
          {loading ? 'Building…' : 'Preview Prompt'}
        </button>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

      {prompt && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {charCount} chars · ~{approxTokens} tokens (text only, excludes image)
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(prompt)}
              style={{ ...smallBtnStyle, fontSize: 11 }}
            >
              Copy
            </button>
          </div>
          <pre
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 16,
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 520,
              overflowY: 'auto',
              fontFamily: 'monospace',
            }}
          >
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: '#374151',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'monospace',
  lineHeight: 1.5,
  resize: 'vertical',
  boxSizing: 'border-box',
};

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'monospace',
};

function btnStyle(disabled: boolean | undefined): React.CSSProperties {
  return {
    padding: '8px 18px',
    background: disabled ? '#d1d5db' : '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  };
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontWeight: 600,
  fontSize: 12,
  color: '#6b7280',
  borderBottom: '1px solid #e5e7eb',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  verticalAlign: 'middle',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: 'white',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'monospace',
};
