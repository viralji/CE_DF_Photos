'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PhotoImage } from '@/components/PhotoImage';

async function getPhoto(id: string) {
  const res = await fetch(`/api/photos/${id}`);
  if (!res.ok) throw new Error('Failed to fetch photo');
  return res.json();
}

export default function ViewPhotoPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: photo, isLoading, error } = useQuery({
    queryKey: ['photo', id],
    queryFn: () => getPhoto(id),
    enabled: !!id,
  });

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

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-700 text-sm mb-4 inline-block">← Dashboard</Link>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <PhotoImage photoId={photo.id} alt={photo.filename || ''} className="w-full h-auto block" />
          <p className="p-3 text-slate-600 border-t border-slate-100"><strong>{photo.checkpoint_name}</strong> · {photo.entity} · {photo.execution_stage} · {photo.status}</p>
        </div>
      </div>
    </div>
  );
}
