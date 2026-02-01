'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { PhotoImage } from '@/components/PhotoImage';

type Comment = { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string };

async function getPhoto(id: string) {
  const res = await fetch(`/api/photos/${id}`);
  if (!res.ok) throw new Error('Failed to fetch photo');
  return res.json();
}

export default function ViewPhotoPage() {
  const params = useParams();
  const id = params?.id as string;
  const queryClient = useQueryClient();
  const { data: photo, isLoading, error } = useQuery({
    queryKey: ['photo', id],
    queryFn: () => getPhoto(id),
    enabled: !!id,
  });
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !commentText.trim()) return;
    setCommentError('');
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/photos/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCommentError(typeof data?.error === 'string' ? data.error : 'Failed to add comment');
        return;
      }
      setCommentText('');
      await queryClient.invalidateQueries({ queryKey: ['photo', id] });
    } finally {
      setCommentSubmitting(false);
    }
  }

  if (isLoading || !photo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">{isLoading ? 'Loading…' : 'Photo not found.'}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-600">Error loading photo.</p>
      </div>
    );
  }

  const comments = (photo.comments ?? []) as Comment[];
  const statusLabel = photo.status === 'qc_required' ? 'QC Required' : photo.status === 'nc' ? 'NC' : photo.status;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-700 text-sm mb-4 inline-block">← Dashboard</Link>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <PhotoImage photoId={photo.id} alt={photo.filename || ''} className="w-full h-auto block" />
          <div className="p-3 border-t border-slate-100 space-y-2">
            <p className="text-slate-600"><strong>{photo.checkpoint_name}</strong> · {photo.entity} · {photo.execution_stage} · <span className="capitalize">{String(statusLabel)}</span></p>
            {comments.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Comment history</h4>
                <ul className="space-y-2">
                  {comments.map((c) => (
                    <li key={c.id} className="text-sm border-l-2 border-slate-200 pl-3 py-1">
                      <p className="text-slate-700">{c.comment_text}</p>
                      <p className="text-xs text-slate-500 mt-1">{c.author_name || c.author_email} · {new Date(c.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={handleAddComment} className="mt-4 pt-3 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Add comment</h4>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2}
              />
              {commentError && <p className="text-red-600 text-sm mt-1">{commentError}</p>}
              <button
                type="submit"
                disabled={!commentText.trim() || commentSubmitting}
                className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {commentSubmitting ? 'Sending…' : 'Add comment'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
