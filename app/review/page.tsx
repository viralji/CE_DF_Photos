'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

type SummaryRow = {
  route_id: string;
  subsection_id: string;
  route_name?: string;
  subsection_name?: string;
  approved_count: number;
  pending_count: number;
  qc_required_count: number;
  nc_count: number;
};

type PhotoRow = {
  id: number;
  checkpoint_name?: string;
  entity?: string;
  execution_stage?: string;
  status?: string;
};

type CommentRow = { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string };

type ReviewStatusFilter = 'pending' | 'qc_required' | 'nc';

export default function ReviewPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>('pending');
  const [textFilter, setTextFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionModal, setActionModal] = useState<{ photoId: number; action: 'qc_required' | 'nc' } | null>(null);
  const [bulkActionModal, setBulkActionModal] = useState<{ action: 'qc_required' | 'nc' } | null>(null);
  const [commentModalPhotoId, setCommentModalPhotoId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [bulkCommentText, setBulkCommentText] = useState('');
  const [threadCommentText, setThreadCommentText] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: summaryData } = useQuery({
    queryKey: ['review-summary'],
    queryFn: async () => (await fetch('/api/review/summary')).json(),
  });

  const [routeId, subsectionId] = selected ? selected.split('::') : [null, null];

  const { data: photosData } = useQuery({
    queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter],
    queryFn: async () =>
      (
        await fetch(
          `/api/photos?routeId=${routeId}&subsectionId=${subsectionId}&status=${reviewStatusFilter}&limit=500`
        )
      ).json(),
    enabled: routeId != null && subsectionId != null,
  });

  const { data: commentsData, refetch: refetchComments } = useQuery({
    queryKey: ['photo-comments', commentModalPhotoId],
    queryFn: async () => {
      if (commentModalPhotoId == null) return { comments: [] };
      const res = await fetch(`/api/photos/${commentModalPhotoId}/comments`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    },
    enabled: commentModalPhotoId != null,
  });

  const threadComments = (commentsData?.comments ?? []) as CommentRow[];

  const rawSummary = (summaryData?.summary ?? []) as SummaryRow[];
  const summary = textFilter.trim()
    ? rawSummary.filter(
        (row) =>
          (row.route_name ?? '').toLowerCase().includes(textFilter.toLowerCase()) ||
          (row.subsection_name ?? '').toLowerCase().includes(textFilter.toLowerCase())
      )
    : rawSummary;

  const photos = (photosData?.photos ?? []) as PhotoRow[];

  async function approve(id: number, comment?: string) {
    setApprovalError(null);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: id, action: 'approve', comment: comment || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApprovalError(typeof data?.error === 'string' ? data.error : 'Approval failed');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
  }

  async function setQcRequired(id: number, comment: string) {
    if (!comment.trim()) return;
    setApprovalError(null);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: id, action: 'qc_required', comment: comment.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApprovalError(typeof data?.error === 'string' ? data.error : 'Action failed');
      return;
    }
    setActionModal(null);
    setCommentText('');
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
  }

  async function setNc(id: number, comment: string) {
    if (!comment.trim()) return;
    setApprovalError(null);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: id, action: 'nc', comment: comment.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApprovalError(typeof data?.error === 'string' ? data.error : 'Action failed');
      return;
    }
    setActionModal(null);
    setCommentText('');
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
  }

  async function bulkSetQcRequired(comment: string) {
    if (!comment.trim() || selectedIds.size === 0) return;
    setApprovalError(null);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: [...selectedIds], action: 'qc_required', comment: comment.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApprovalError(typeof data?.error === 'string' ? data.error : 'Bulk action failed');
      return;
    }
    setBulkActionModal(null);
    setBulkCommentText('');
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
  }

  async function bulkSetNc(comment: string) {
    if (!comment.trim() || selectedIds.size === 0) return;
    setApprovalError(null);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: [...selectedIds], action: 'nc', comment: comment.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApprovalError(typeof data?.error === 'string' ? data.error : 'Bulk action failed');
      return;
    }
    setBulkActionModal(null);
    setBulkCommentText('');
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
  }

  async function addComment(photoId: number, text: string): Promise<boolean> {
    if (!text.trim()) return false;
    const res = await fetch(`/api/photos/${photoId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });
    if (!res.ok) return false;
    queryClient.invalidateQueries({ queryKey: ['photo-detail', photoId] });
    refetchComments();
    return true;
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
    setApprovalError(null);
    for (const id of selectedIds) {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: id, action: 'approve' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setApprovalError(typeof data?.error === 'string' ? data.error : 'Bulk approve failed');
        return;
      }
    }
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
  }

  async function bulkApproveWithComment(comment?: string) {
    if (selectedIds.size === 0) return;
    setApprovalError(null);
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: [...selectedIds], action: 'approve', comment: comment?.trim() || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApprovalError(typeof data?.error === 'string' ? data.error : 'Bulk approve failed');
      return;
    }
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['review-summary'] });
    queryClient.invalidateQueries({ queryKey: ['review-photos', routeId, subsectionId, reviewStatusFilter] });
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

  const groupedByEntity = useMemo(() => {
    const map: Record<string, Record<string, PhotoRow[]>> = {};
    photos.forEach((p) => {
      const entity = p.entity || 'Other';
      const cp = p.checkpoint_name || 'Other';
      if (!map[entity]) map[entity] = {};
      if (!map[entity][cp]) map[entity][cp] = [];
      map[entity][cp].push(p);
    });
    return map;
  }, [photos]);

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
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Showing: <strong>{reviewStatusFilter === 'pending' ? 'Pending' : reviewStatusFilter === 'qc_required' ? 'QC Required' : 'NC'}</strong> photos
              </span>
              <button onClick={() => { setSelected(null); setSelectedIds(new Set()); }} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Back to Summary
              </button>
            </div>
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
                      <th className="text-center p-3 font-semibold text-slate-700">QC Required</th>
                      <th className="text-center p-3 font-semibold text-slate-700">NC</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.map((row, idx) => {
                      const rowKey = `${String(row.route_id)}::${String(row.subsection_id)}`;
                      const qcCount = (row as SummaryRow).qc_required_count ?? 0;
                      const ncCount = (row as SummaryRow).nc_count ?? 0;
                      const hasReviewable = row.pending_count > 0 || qcCount > 0 || ncCount > 0;
                      return (
                        <tr key={`${rowKey}-${idx}`} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{row.route_name || `Route ${row.route_id}`}</td>
                          <td className="p-3 text-slate-700">{row.subsection_name || `Sub ${row.subsection_id}`}</td>
                          <td className="p-3 text-center">
                            <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-green-100 text-green-700 font-semibold text-xs">{row.approved_count}</span>
                          </td>
                          <td className="p-3 text-center">
                            {row.pending_count > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected(rowKey);
                                  setReviewStatusFilter('pending');
                                  setSelectedIds(new Set());
                                }}
                                className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                title="View pending photos"
                              >
                                {row.pending_count}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs">{row.pending_count}</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {qcCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected(rowKey);
                                  setReviewStatusFilter('qc_required');
                                  setSelectedIds(new Set());
                                }}
                                className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
                                title="View QC Required photos"
                              >
                                {qcCount}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs">{qcCount}</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {ncCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected(rowKey);
                                  setReviewStatusFilter('nc');
                                  setSelectedIds(new Set());
                                }}
                                className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-red-100 text-red-700 font-semibold text-xs hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-400"
                                title="View NC photos"
                              >
                                {ncCount}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs">{ncCount}</span>
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
                        <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
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
            {approvalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-red-700 text-sm">{approvalError}</span>
                <button type="button" onClick={() => setApprovalError(null)} className="text-red-500 hover:text-red-700 p-1" aria-label="Dismiss">×</button>
              </div>
            )}
            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="bg-blue-600 text-white rounded-lg p-4 flex items-center justify-between mb-4">
                <span className="font-semibold">{selectedIds.size} photo(s) selected</span>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={bulkApprove} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors">
                    Approve All
                  </button>
                  <button onClick={() => setBulkActionModal({ action: 'qc_required' })} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-colors">
                    QC Required
                  </button>
                  <button onClick={() => setBulkActionModal({ action: 'nc' })} className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors">
                    NC
                  </button>
                  <button onClick={bulkDelete} className="px-4 py-2 bg-slate-700 hover:bg-slate-800 rounded-lg font-medium transition-colors">
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
                              photo.status === 'approved' ? 'bg-green-600 text-white' :
                              photo.status === 'qc_required' ? 'bg-orange-500 text-white' :
                              photo.status === 'nc' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                            }`}>
                              {photo.status === 'approved' ? 'Approved' : photo.status === 'qc_required' ? 'QC Required' : photo.status === 'nc' ? 'NC' : 'Pending'}
                            </span>
                          </div>

                          {/* Image */}
                          <img
                            src={`/api/photos/${photo.id}/image`}
                            alt=""
                            className="w-full h-48 object-cover"
                          />

                          {/* Actions */}
                          <div className="p-3 bg-white flex flex-wrap gap-2">
                            <button onClick={() => approve(photo.id)} className="px-2 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">Approve</button>
                            <button onClick={() => setActionModal({ photoId: photo.id, action: 'qc_required' })} className="px-2 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600">QC Required</button>
                            <button onClick={() => setActionModal({ photoId: photo.id, action: 'nc' })} className="px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">NC</button>
                            <button onClick={() => setCommentModalPhotoId(photo.id)} className="px-2 py-1.5 bg-slate-500 text-white rounded text-xs font-medium hover:bg-slate-600" title="Comments">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            </button>
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

        {/* Single-photo QC Required / NC modal — comment required */}
        {actionModal != null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => { setActionModal(null); setCommentText(''); setApprovalError(null); }}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
              {approvalError && <p className="text-red-600 text-sm mb-2">{approvalError}</p>}
              <h3 className="font-semibold text-slate-900 mb-2">
                {actionModal.action === 'qc_required' ? 'QC Required' : 'NC'} — Comment required
              </h3>
              <p className="text-sm text-slate-600 mb-3">Add a comment for the capturer. This will be saved with the photo.</p>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Enter comment..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setActionModal(null); setCommentText(''); }}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (actionModal.action === 'qc_required') setQcRequired(actionModal.photoId, commentText);
                    else setNc(actionModal.photoId, commentText);
                  }}
                  disabled={!commentText.trim()}
                  className={`px-3 py-1.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${actionModal.action === 'qc_required' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk QC Required / NC modal — shared comment required */}
        {bulkActionModal != null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => { setBulkActionModal(null); setBulkCommentText(''); setApprovalError(null); }}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
              {approvalError && <p className="text-red-600 text-sm mb-2">{approvalError}</p>}
              <h3 className="font-semibold text-slate-900 mb-2">
                {bulkActionModal.action === 'qc_required' ? 'QC Required' : 'NC'} — Comment required
              </h3>
              <p className="text-sm text-slate-600 mb-3">Add one comment to apply to all {selectedIds.size} selected photo(s).</p>
              <textarea
                value={bulkCommentText}
                onChange={(e) => setBulkCommentText(e.target.value)}
                placeholder="Enter comment..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setBulkActionModal(null); setBulkCommentText(''); }}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (bulkActionModal.action === 'qc_required') bulkSetQcRequired(bulkCommentText);
                    else bulkSetNc(bulkCommentText);
                  }}
                  disabled={!bulkCommentText.trim() || selectedIds.size === 0}
                  className={`px-3 py-1.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${bulkActionModal.action === 'qc_required' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Comment thread modal — view all comments and add a comment */}
        {commentModalPhotoId != null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => { setCommentModalPhotoId(null); setThreadCommentText(''); }}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                <h3 className="font-semibold text-slate-900">Comments</h3>
                <button
                  type="button"
                  onClick={() => { setCommentModalPhotoId(null); setThreadCommentText(''); }}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {threadComments.length === 0 ? (
                  <p className="text-slate-500 text-sm">No comments yet.</p>
                ) : (
                  threadComments.map((c) => (
                    <div key={c.id} className="text-sm border-l-2 border-slate-200 pl-3 py-1">
                      <p className="text-slate-700">{c.comment_text}</p>
                      <p className="text-xs text-slate-500 mt-1">{c.author_name || c.author_email} · {new Date(c.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-slate-200 flex-shrink-0">
                <textarea
                  value={threadCommentText}
                  onChange={(e) => setThreadCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await addComment(commentModalPhotoId, threadCommentText);
                      if (ok) setThreadCommentText('');
                    }}
                    disabled={!threadCommentText.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
