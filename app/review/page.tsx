'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

type SummaryRow = {
  route_id: string;
  subsection_id: string;
  route_name?: string;
  subsection_name?: string;
  approved_count: number;
  pending_count: number;
  rejected_count: number;
};

type PhotoRow = {
  id: number;
  checkpoint_name?: string;
  entity?: string;
  execution_stage?: string;
  status?: string;
};

export default function ReviewPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [textFilter, setTextFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: summaryData } = useQuery({
    queryKey: ['review-summary'],
    queryFn: async () => (await fetch('/api/review/summary')).json(),
  });

  const [routeId, subsectionId] = selected ? selected.split('::') : [null, null];

  const { data: photosData } = useQuery({
    queryKey: ['review-photos', routeId, subsectionId],
    queryFn: async () =>
      (
        await fetch(
          `/api/photos?routeId=${routeId}&subsectionId=${subsectionId}&status=pending,rejected&limit=500`
        )
      ).json(),
    enabled: routeId != null && subsectionId != null,
  });

  const rawSummary = (summaryData?.summary ?? []) as SummaryRow[];
  const summary = textFilter.trim()
    ? rawSummary.filter(
        (row) =>
          (row.route_name ?? '').toLowerCase().includes(textFilter.toLowerCase()) ||
          (row.subsection_name ?? '').toLowerCase().includes(textFilter.toLowerCase())
      )
    : rawSummary;

  const photos = (photosData?.photos ?? []) as PhotoRow[];

  async function approve(id: number) {
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: id, action: 'approve' }),
    });
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId] });
  }

  async function reject(id: number) {
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: id, action: 'reject' }),
    });
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId] });
  }

  async function deletePhoto(id: number) {
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Delete failed');
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId] });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === photos.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(photos.map((p) => p.id)));
  }

  async function bulkApprove() {
    for (const id of selectedIds) {
      await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: id, action: 'approve' }),
      });
    }
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId] });
  }

  async function bulkReject() {
    for (const id of selectedIds) {
      await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: id, action: 'reject' }),
      });
    }
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId] });
  }

  async function bulkDelete() {
    for (const id of selectedIds) {
      const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId] });
  }

  const groupedByEntity = (() => {
    const map: Record<string, Record<string, PhotoRow[]>> = {};
    photos.forEach((p) => {
      const entity = p.entity || 'Other';
      const cp = p.checkpoint_name || 'Other';
      if (!map[entity]) map[entity] = {};
      if (!map[entity][cp]) map[entity][cp] = [];
      map[entity][cp].push(p);
    });
    return map;
  })();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <h1 className="text-lg font-bold text-slate-900">Review</h1>
          </div>
          {selected && (
            <button onClick={() => { setSelected(null); setSelectedIds(new Set()); }} className="text-sm font-medium text-blue-600 hover:text-blue-700">
              Back to Summary
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 overflow-x-auto">
        {!selected ? (
          /* Summary View */
          <div className="space-y-4">
            {/* Search */}
            <div className="bg-white rounded-xl shadow-soft p-4">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                  placeholder="Search routes or subsections..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-3 font-semibold text-slate-700">Route</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Subsection</th>
                      <th className="text-center p-3 font-semibold text-slate-700">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Approved
                        </div>
                      </th>
                      <th className="text-center p-3 sm:p-4 font-semibold text-secondary-700">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Pending
                        </div>
                      </th>
                      <th className="text-center p-3 sm:p-4 font-semibold text-secondary-700">
                        <div className="flex items-center justify-center gap-1">
                          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Rejected
                        </div>
                      </th>
                      <th className="text-center p-3 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.map((row, idx) => {
                      const rowKey = `${String(row.route_id)}::${String(row.subsection_id)}`;
                      const hasReviewable = row.pending_count > 0 || row.rejected_count > 0;
                      return (
                        <tr key={`${rowKey}-${idx}`} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{row.route_name || `Route ${row.route_id}`}</td>
                          <td className="p-3 text-slate-700">{row.subsection_name || `Sub ${row.subsection_id}`}</td>
                          <td className="p-3 text-center">
                            <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">{row.approved_count}</span>
                          </td>
                          <td className="p-3 text-center">
                            {hasReviewable ? (
                              <button
                                type="button"
                                onClick={() => setSelected(rowKey)}
                                className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-red-100 text-red-700 font-semibold text-xs hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-400"
                                title="Review pending / rejected"
                              >
                                {row.pending_count}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">{row.pending_count}</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {hasReviewable ? (
                              <button
                                type="button"
                                onClick={() => setSelected(rowKey)}
                                className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                title="Review rejected"
                              >
                                {row.rejected_count}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">{row.rejected_count}</span>
                            )}
                          </td>
                          <td className="p-3 text-center" aria-hidden="true">
                            {hasReviewable ? (
                              <span className="text-slate-400 text-xs">Click number to review</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {summary.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                          No photos to review
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Detail View */
          <div className="space-y-4">
            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="bg-blue-600 text-white rounded-lg p-4 flex items-center justify-between mb-4">
                <span className="font-semibold">{selectedIds.size} photo(s) selected</span>
                <div className="flex gap-2">
                  <button onClick={bulkApprove} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors">
                    Approve All
                  </button>
                  <button onClick={bulkReject} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors">
                    Reject All
                  </button>
                  <button onClick={bulkDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* Select All */}
            {photos.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedIds.size === photos.length && photos.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="font-medium text-slate-700">Select all</span>
                </label>
              </div>
            )}

            {/* Photos by Entity & Checkpoint */}
            {Object.entries(groupedByEntity).map(([entity, checkpoints]) => (
              <div key={entity} className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
                <h2 className="text-base font-bold text-slate-900 mb-3">{entity}</h2>
                {Object.entries(checkpoints).map(([checkpoint, photoList]) => (
                  <div key={checkpoint} className="mb-4 last:mb-0">
                    <h3 className="font-semibold text-slate-700 text-sm mb-2">{checkpoint}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {photoList.map((photo) => (
                        <div
                          key={photo.id}
                          className={`relative rounded-lg overflow-hidden border-2 ${
                            selectedIds.has(photo.id) ? 'border-blue-500' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className="absolute top-2 left-2 z-10">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(photo.id)}
                              onChange={() => toggleSelect(photo.id)}
                              className="w-4 h-4 rounded border-white bg-white/90 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </div>
                          
                          {/* Status Badge */}
                          <div className="absolute top-2 right-2 z-10">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              photo.status === 'rejected' ? 'bg-danger-500 text-white' : 'bg-accent-500 text-white'
                            }`}>
                              {photo.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </span>
                          </div>

                          {/* Image */}
                          <img
                            src={`/api/photos/${photo.id}/image`}
                            alt=""
                            className="w-full h-48 object-cover"
                          />

                          {/* Actions */}
                          <div className="p-3 bg-white flex gap-2">
                            <button onClick={() => approve(photo.id)} className="flex-1 px-2 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">Approve</button>
                            <button onClick={() => reject(photo.id)} className="flex-1 px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">Reject</button>
                            <button onClick={() => deletePhoto(photo.id)} className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {photos.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
                <p className="text-slate-600 text-sm font-medium">No photos to review</p>
                <p className="text-xs text-slate-500 mt-1">All photos have been processed</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
