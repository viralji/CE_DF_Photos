'use client';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

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
  resubmission_of_id?: number | null;
};

type CommentRow = { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string };

type ReviewStatusFilter = 'pending' | 'qc_required' | 'nc' | 'approved';

const REVIEW_ROUTE_KEY = 'route';
const REVIEW_SUBSECTION_KEY = 'subsection';
const REVIEW_STATUS_KEY = 'status';

const VALID_STATUSES: ReviewStatusFilter[] = ['pending', 'qc_required', 'nc', 'approved'];

function parseReviewStatus(s: string | null): ReviewStatusFilter {
  if (s && VALID_STATUSES.includes(s as ReviewStatusFilter)) return s as ReviewStatusFilter;
  return 'pending';
}

type PhotoWithComments = PhotoRow & { comments?: CommentRow[] };

type HistoryEntry = {
  id: number;
  status: string;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  reviewer_email: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  comments: CommentRow[];
};

function ReviewPhotoCard({
  photo,
  isAdmin,
  onApprove,
  onSetActionModal,
  onSetCommentModalPhotoId,
  onDeletePhoto,
  onOpenHistory,
}: {
  photo: PhotoRow;
  isAdmin: boolean;
  onApprove: (id: number) => void;
  onSetActionModal: (x: { photoId: number; action: 'qc_required' | 'nc' }) => void;
  onSetCommentModalPhotoId: (id: number) => void;
  onDeletePhoto: (id: number) => void;
  onOpenHistory: (id: number) => void;
}) {
  const { data: previousPhotoData } = useQuery({
    queryKey: ['photo-detail', photo.resubmission_of_id],
    queryFn: async () => {
      if (photo.resubmission_of_id == null) return null;
      const res = await fetch(`/api/photos/${photo.resubmission_of_id}`);
      if (!res.ok) throw new Error('Failed to fetch previous photo');
      return res.json() as Promise<PhotoWithComments>;
    },
    enabled: photo.resubmission_of_id != null,
  });
  const previousPhoto = previousPhotoData ?? null;
  const isResubmission = previousPhoto != null;

  const singleCard = (
    <>
      <img
        src={`/api/photos/${photo.id}/image`}
        alt=""
        className="w-full h-48 object-cover"
      />
      <div className="p-2 md:p-3 bg-white flex flex-wrap gap-1.5 md:gap-2">
        <Link
          href={`/view-photo/${photo.id}`}
          className="inline-flex items-center justify-center gap-1 p-1.5 md:px-2 md:py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
          title="View full photo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span className="hidden md:inline">View full</span>
        </Link>
        <button onClick={() => onApprove(photo.id)} className="px-2 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">Approve</button>
        <button onClick={() => onSetActionModal({ photoId: photo.id, action: 'qc_required' })} className="px-2 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600">
          <span className="hidden md:inline">QC Required</span>
          <span className="md:hidden">QC</span>
        </button>
        <button onClick={() => onSetActionModal({ photoId: photo.id, action: 'nc' })} className="px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">NC</button>
        <button onClick={() => onSetCommentModalPhotoId(photo.id)} className="p-1.5 bg-slate-500 text-white rounded text-xs font-medium hover:bg-slate-600" title="Comments">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </button>
        {isAdmin && (
          <button onClick={() => onDeletePhoto(photo.id)} className="p-1.5 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300" title="Delete (Admin only)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </>
  );

  if (isResubmission && previousPhoto) {
    return (
      <>
        {/* Mobile: Single photo with compact buttons */}
        <div className="md:hidden relative rounded-lg overflow-hidden border-2 border-slate-200 bg-white shadow-sm">
          <div className="absolute top-2 right-2 z-10">
            <span className={`px-2 py-1 rounded text-xs font-semibold ${
              photo.status === 'approved' ? 'bg-green-600 text-white' :
              photo.status === 'qc_required' ? 'bg-orange-500 text-white' :
              photo.status === 'nc' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
            }`}>
              {photo.status === 'approved' ? 'Approved' : photo.status === 'qc_required' ? 'QC' : photo.status === 'nc' ? 'NC' : 'Pending'}
            </span>
          </div>
          <img
            src={`/api/photos/${photo.id}/image`}
            alt=""
            className="w-full h-48 object-cover"
          />
          <div className="p-2 bg-white">
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => onOpenHistory(photo.id)}
                className="p-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                title="View history"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <Link
                href={`/view-photo/${photo.id}`}
                className="inline-flex items-center justify-center p-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                title="View full photo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </Link>
              <button onClick={() => onApprove(photo.id)} className="px-2 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">Approve</button>
              <button onClick={() => onSetActionModal({ photoId: photo.id, action: 'qc_required' })} className="px-2 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600">QC</button>
              <button onClick={() => onSetActionModal({ photoId: photo.id, action: 'nc' })} className="px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">NC</button>
              <button onClick={() => onSetCommentModalPhotoId(photo.id)} className="p-1.5 bg-slate-500 text-white rounded text-xs font-medium hover:bg-slate-600" title="Comments">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </button>
              {isAdmin && (
                <button onClick={() => onDeletePhoto(photo.id)} className="p-1.5 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300" title="Delete (Admin only)">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Desktop: Side-by-side view */}
        <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border-2 border-slate-200 bg-slate-50/50 shadow-sm overflow-visible p-4">
          <div className="flex flex-col min-h-[280px] bg-white rounded-lg p-3 border border-slate-200 shadow-sm relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Previous attempt</p>
              <button
                onClick={() => onOpenHistory(photo.id)}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-medium"
                title="View complete history"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Full history
              </button>
            </div>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="aspect-[4/3] rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
              <img
                src={`/api/photos/${previousPhoto.id}/image`}
                alt="Previous"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-3 space-y-2 min-h-0 flex-1 overflow-y-auto">
              {(previousPhoto.comments ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No comments</p>
              ) : (
                (previousPhoto.comments ?? []).map((c) => (
                  <div key={c.id} className="text-xs border-l-2 border-slate-200 pl-2 py-0.5">
                    <p className="text-slate-700">{c.comment_text}</p>
                    <p className="text-slate-500">{c.author_name || c.author_email} · {new Date(c.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col min-h-[280px] bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Current (resubmission)</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
              photo.status === 'approved' ? 'bg-green-600 text-white' :
              photo.status === 'qc_required' ? 'bg-orange-500 text-white' :
              photo.status === 'nc' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
            }`}>
              {photo.status === 'approved' ? 'Approved' : photo.status === 'qc_required' ? 'QC Required' : photo.status === 'nc' ? 'NC' : 'Pending'}
            </span>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="aspect-[4/3] rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
              <img
                src={`/api/photos/${photo.id}/image`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-3 p-2 bg-slate-50 rounded-md flex flex-wrap gap-2 flex-shrink-0">
              <Link
                href={`/view-photo/${photo.id}`}
                className="inline-flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                View full
              </Link>
              <button onClick={() => onApprove(photo.id)} className="px-2 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">Approve</button>
              <button onClick={() => onSetActionModal({ photoId: photo.id, action: 'qc_required' })} className="px-2 py-1.5 bg-orange-500 text-white rounded text-xs font-medium hover:bg-orange-600">QC Required</button>
              <button onClick={() => onSetActionModal({ photoId: photo.id, action: 'nc' })} className="px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">NC</button>
              <button onClick={() => onSetCommentModalPhotoId(photo.id)} className="px-2 py-1.5 bg-slate-500 text-white rounded text-xs font-medium hover:bg-slate-600" title="Comments">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </button>
              {isAdmin && (
                <button onClick={() => onDeletePhoto(photo.id)} className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300" title="Delete (Admin only)">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
      </>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border-2 border-slate-200 hover:border-slate-300">
      <div className="absolute top-2 right-2 z-10">
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          photo.status === 'approved' ? 'bg-green-600 text-white' :
          photo.status === 'qc_required' ? 'bg-orange-500 text-white' :
          photo.status === 'nc' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
        }`}>
          {photo.status === 'approved' ? 'Approved' : photo.status === 'qc_required' ? 'QC Required' : photo.status === 'nc' ? 'NC' : 'Pending'}
        </span>
      </div>
      {singleCard}
    </div>
  );
}

function HistoryModal({
  photoId,
  onClose,
}: {
  photoId: number;
  onClose: () => void;
}) {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['photo-history', photoId],
    queryFn: async () => {
      const res = await fetch(`/api/photos/${photoId}/history`);
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json() as Promise<{ history: HistoryEntry[]; count: number }>;
    },
    enabled: photoId != null,
  });

  const history = historyData?.history ?? [];

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'approved': return 'bg-green-600 text-white';
      case 'qc_required': return 'bg-orange-500 text-white';
      case 'nc': return 'bg-red-600 text-white';
      default: return 'bg-amber-500 text-white';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'approved': return 'Approved';
      case 'qc_required': return 'QC Required';
      case 'nc': return 'NC';
      default: return 'Pending';
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-slate-900">Resubmission History ({history.length} {history.length === 1 ? 'attempt' : 'attempts'})</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No history available</p>
          ) : (
            <div className="space-y-6">
              {history.map((entry, index) => {
                const isLatest = index === history.length - 1;
                return (
                  <div key={entry.id} className="relative">
                    {/* Timeline connector */}
                    {index < history.length - 1 && (
                      <div className="absolute left-[15px] top-[60px] w-0.5 h-[calc(100%+1.5rem)] bg-blue-300" />
                    )}
                    
                    <div className="flex gap-4">
                      {/* Timeline dot */}
                      <div className="flex-shrink-0 mt-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isLatest ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-600'
                        }`}>
                          {isLatest ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="text-xs font-bold">{index + 1}</span>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-3">
                        {/* Header with status and time */}
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeClass(entry.status)}`}>
                              {getStatusLabel(entry.status)}
                            </span>
                            {isLatest && (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                                Current
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">
                            {formatRelativeTime(entry.created_at)}
                          </span>
                        </div>

                        {/* Photo */}
                        <div className="relative mb-3 rounded-lg overflow-hidden bg-slate-100 group">
                          <img
                            src={`/api/photos/${entry.id}/image`}
                            alt={`Attempt ${index + 1}`}
                            className="w-full h-48 object-cover"
                          />
                          {/* View full button overlay */}
                          <Link
                            href={`/view-photo/${entry.id}`}
                            className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <span className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                              </svg>
                              View full
                            </span>
                          </Link>
                        </div>

                        {/* Submitted by */}
                        {entry.user_email && (
                          <p className="text-xs text-slate-600 mb-1">
                            <span className="font-medium">Submitted by:</span> {entry.user_name || entry.user_email}
                          </p>
                        )}

                        {/* Reviewed by */}
                        {entry.reviewer_email && (
                          <p className="text-xs text-slate-600 mb-2">
                            <span className="font-medium">Reviewed by:</span> {entry.reviewer_name || entry.reviewer_email}
                            {entry.reviewed_at && ` on ${new Date(entry.reviewed_at).toLocaleDateString()}`}
                          </p>
                        )}

                        {/* Comments */}
                        {entry.comments.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs font-semibold text-slate-700 mb-2">Comments:</p>
                            <div className="space-y-2">
                              {entry.comments.map((comment) => (
                                <div key={comment.id} className="text-xs border-l-2 border-slate-300 pl-2 py-0.5">
                                  <p className="text-slate-700">{comment.comment_text}</p>
                                  <p className="text-slate-500 mt-0.5">
                                    {comment.author_name || comment.author_email} · {formatRelativeTime(comment.created_at)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>('pending');
  const [textFilter, setTextFilter] = useState('');
  const [actionModal, setActionModal] = useState<{ photoId: number; action: 'qc_required' | 'nc' } | null>(null);
  const [commentModalPhotoId, setCommentModalPhotoId] = useState<number | null>(null);
  const [historyModalPhotoId, setHistoryModalPhotoId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [threadCommentText, setThreadCommentText] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Restore detail view from URL when returning (e.g. back from view-photo)
  useEffect(() => {
    const route = searchParams.get(REVIEW_ROUTE_KEY);
    const subsection = searchParams.get(REVIEW_SUBSECTION_KEY);
    const status = searchParams.get(REVIEW_STATUS_KEY);
    if (route && subsection) {
      setSelected(`${route}::${subsection}`);
      setReviewStatusFilter(parseReviewStatus(status));
    } else {
      setSelected(null);
      setReviewStatusFilter('pending');
    }
  }, [searchParams]);

  const updateReviewUrl = useCallback(
    (routeId: string | null, subsectionId: string | null, status: ReviewStatusFilter | null) => {
      if (!routeId || !subsectionId || !status) {
        router.replace(pathname, { scroll: false });
        return;
      }
      const params = new URLSearchParams();
      params.set(REVIEW_ROUTE_KEY, routeId);
      params.set(REVIEW_SUBSECTION_KEY, subsectionId);
      params.set(REVIEW_STATUS_KEY, status);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router]
  );

  const openDetail = useCallback(
    (rowKey: string, status: ReviewStatusFilter) => {
      const [routeId, subsectionId] = rowKey.split('::');
      setSelected(rowKey);
      setReviewStatusFilter(status);
      updateReviewUrl(routeId ?? null, subsectionId ?? null, status);
    },
    [updateReviewUrl]
  );

  const closeDetail = useCallback(() => {
    setSelected(null);
    setReviewStatusFilter('pending');
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['review-summary'],
    queryFn: async () => (await fetch('/api/review/summary')).json(),
    staleTime: 30_000,
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

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await fetch('/api/me')).json(),
    staleTime: 60_000,
  });

  const { data: entitiesData } = useQuery({
    queryKey: ['entities'],
    queryFn: async () => (await fetch('/api/entities')).json(),
    staleTime: 60_000,
    enabled: !!selected,
  });

  const isAdmin = (meData?.role ?? '') === 'Admin';
  const entities = (entitiesData?.entities ?? []) as { id: number; name: string; code: string; display_order: number }[];
  const entityOrder = useMemo(() => entities.map((e) => e.name), [entities]);

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
    setApprovalError(null);
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setApprovalError(typeof d?.error === 'string' ? d.error : 'Delete failed');
      return;
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

  const sortedEntityEntries = useMemo(() => {
    const entries = Object.entries(groupedByEntity);
    if (entityOrder.length === 0) return entries;
    return entries.sort(([nameA], [nameB]) => {
      const iA = entityOrder.indexOf(nameA);
      const iB = entityOrder.indexOf(nameB);
      if (iA === -1 && iB === -1) return nameA.localeCompare(nameB);
      if (iA === -1) return 1;
      if (iB === -1) return -1;
      return iA - iB;
    });
  }, [groupedByEntity, entityOrder]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {!selected ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </Link>
              <h1 className="text-lg font-bold text-slate-900">Review</h1>
            </div>
          ) : (
            <div />
          )}
          {selected && (
            <div className="flex items-center justify-between flex-1 min-w-0">
              <span className="text-sm text-slate-700 truncate">
                <strong className="font-semibold text-slate-900">Showing:</strong>{' '}
                {reviewStatusFilter === 'pending' ? 'Pending' : reviewStatusFilter === 'qc_required' ? 'QC Required' : reviewStatusFilter === 'nc' ? 'NC' : 'Approved'} photos
              </span>
              <button onClick={closeDetail} className="text-sm font-medium text-blue-600 hover:text-blue-700 shrink-0 ml-3">
                Back
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 min-w-0 overflow-x-hidden">
        {!selected ? (
          /* Summary View */
          <div className="space-y-4">
            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-600 text-sm font-medium">Loading review…</p>
              </div>
            ) : (
              <>
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

            {/* Mobile: card list (no horizontal scroll) */}
            <div className="md:hidden space-y-3">
              {summary.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-slate-500 text-sm">
                  No photos to review
                </div>
              ) : (
                summary.map((row, idx) => {
                  const rowKey = `${String(row.route_id)}::${String(row.subsection_id)}`;
                  const qcCount = (row as SummaryRow).qc_required_count ?? 0;
                  const ncCount = (row as SummaryRow).nc_count ?? 0;
                  return (
                    <div key={`${rowKey}-${idx}`} className="bg-white border border-slate-200 rounded-lg p-4">
                      <p className="font-medium text-slate-900 text-sm truncate">{row.route_name || `Route ${row.route_id}`}</p>
                      <p className="text-slate-600 text-xs truncate mb-3">{row.subsection_name || `Sub ${row.subsection_id}`}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.approved_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDetail(rowKey, 'approved')}
                            style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}}
                            className="badge-button inline-flex items-center justify-center shrink-0 rounded-full bg-green-100 text-green-700 font-semibold text-xs leading-none border-0 hover:bg-green-200"
                            title="View approved"
                          >
                            {row.approved_count}
                          </button>
                        ) : (
                          <span style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}} className="inline-flex items-center justify-center shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none">{row.approved_count}</span>
                        )}
                        {row.pending_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDetail(rowKey, 'pending')}
                            style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}}
                            className="inline-flex items-center justify-center shrink-0 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs leading-none border-0 hover:bg-amber-200"
                            title="View pending"
                          >
                            {row.pending_count}
                          </button>
                        ) : (
                          <span style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}} className="inline-flex items-center justify-center shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none">{row.pending_count}</span>
                        )}
                        {qcCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDetail(rowKey, 'qc_required')}
                            style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}}
                            className="badge-button inline-flex items-center justify-center shrink-0 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs leading-none border-0 hover:bg-orange-200"
                            title="View QC Required"
                          >
                            {qcCount}
                          </button>
                        ) : (
                          <span style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}} className="inline-flex items-center justify-center shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none">{qcCount}</span>
                        )}
                        {ncCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDetail(rowKey, 'nc')}
                            style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}}
                            className="badge-button inline-flex items-center justify-center shrink-0 rounded-full bg-red-100 text-red-700 font-semibold text-xs leading-none border-0 hover:bg-red-200"
                            title="View NC"
                          >
                            {ncCount}
                          </button>
                        ) : (
                          <span style={{width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px', padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden'}} className="inline-flex items-center justify-center shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none">{ncCount}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm min-w-0 table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700 w-[20%]">Route</th>
                    <th className="text-left p-3 font-semibold text-slate-700 w-[20%]">Subsection</th>
                    <th className="text-center p-3 font-semibold text-slate-700 w-[15%]">
                      <div className="flex items-center justify-center gap-1">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approved
                      </div>
                    </th>
                    <th className="text-center p-3 font-semibold text-slate-700 w-[15%]">Pending</th>
                    <th className="text-center p-3 font-semibold text-slate-700 w-[15%]">QC Required</th>
                    <th className="text-center p-3 font-semibold text-slate-700 w-[15%]">NC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.map((row, idx) => {
                    const rowKey = `${String(row.route_id)}::${String(row.subsection_id)}`;
                    const qcCount = (row as SummaryRow).qc_required_count ?? 0;
                    const ncCount = (row as SummaryRow).nc_count ?? 0;
                    return (
                      <tr key={`${rowKey}-${idx}`} className="hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-900 truncate" title={row.route_name || `Route ${row.route_id}`}>{row.route_name || `Route ${row.route_id}`}</td>
                        <td className="p-3 text-slate-700 truncate" title={row.subsection_name || `Sub ${row.subsection_id}`}>{row.subsection_name || `Sub ${row.subsection_id}`}</td>
                        <td className="p-3 text-center">
                          {row.approved_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => openDetail(rowKey, 'approved')}
                              className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-green-100 text-green-700 font-semibold text-xs leading-none p-0 border-0 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-400"
                              title="View approved photos"
                            >
                              {row.approved_count}
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none p-0">{row.approved_count}</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {row.pending_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => openDetail(rowKey, 'pending')}
                              className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs leading-none p-0 border-0 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                              title="View pending photos"
                            >
                              {row.pending_count}
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none p-0">{row.pending_count}</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {qcCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => openDetail(rowKey, 'qc_required')}
                              className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs leading-none p-0 border-0 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
                              title="View QC Required photos"
                            >
                              {qcCount}
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none p-0">{qcCount}</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {ncCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => openDetail(rowKey, 'nc')}
                              className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-red-100 text-red-700 font-semibold text-xs leading-none p-0 border-0 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-400"
                              title="View NC photos"
                            >
                              {ncCount}
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 min-w-[2rem] max-w-[2rem] min-h-[2rem] max-h-[2rem] shrink-0 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs leading-none p-0">{ncCount}</span>
                          )}
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
              </>
            )}
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

            {/* Photos by Entity & Checkpoint (entity order matches admin display_order) */}
            {sortedEntityEntries.map(([entity, checkpoints]) => (
              <div key={entity} className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
                <h2 className="text-base font-bold text-slate-900 mb-3">{entity}</h2>
                {Object.entries(checkpoints).map(([checkpoint, photoList]) => (
                  <div key={checkpoint} className="mb-6 last:mb-0">
                    <h3 className="font-semibold text-slate-700 text-sm mb-3">{checkpoint}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {photoList.map((photo) => (
                        <div
                          key={photo.id}
                          className={photo.resubmission_of_id ? 'sm:col-span-2 lg:col-span-3' : ''}
                        >
                          <ReviewPhotoCard
                            photo={photo}
                            isAdmin={isAdmin}
                            onApprove={approve}
                            onSetActionModal={setActionModal}
                            onSetCommentModalPhotoId={setCommentModalPhotoId}
                            onDeletePhoto={deletePhoto}
                            onOpenHistory={setHistoryModalPhotoId}
                          />
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

        {/* History modal — view complete resubmission history */}
        {historyModalPhotoId != null && (
          <HistoryModal
            photoId={historyModalPhotoId}
            onClose={() => setHistoryModalPhotoId(null)}
          />
        )}
      </main>
    </div>
  );
}

function ReviewFallback() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-lg font-bold text-slate-900">Review</h1>
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </main>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<ReviewFallback />}>
      <ReviewPageContent />
    </Suspense>
  );
}
