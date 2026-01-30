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

async function getGeocode(lat: number, lon: number): Promise<{ place: string | null; state: string | null }> {
  const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
  if (!res.ok) return { place: null, state: null };
  return res.json();
}

function formatIST(date: string): string {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

export default function ViewPhotoPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: photo, isLoading, error } = useQuery({
    queryKey: ['photo', id],
    queryFn: () => getPhoto(id),
    enabled: !!id,
  });
  const lat = photo?.latitude;
  const lng = photo?.longitude;
  const hasCoords = lat != null && lng != null;
  const { data: geocode, isLoading: geocodeLoading } = useQuery({
    queryKey: ['geocode', lat, lng],
    queryFn: () => getGeocode(lat as number, lng as number),
    enabled: !!photo && hasCoords,
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

  const accuracy = photo.location_accuracy;
  const createdAt = photo.created_at;
  const placeState = geocode && (geocode.place || geocode.state)
    ? [geocode.place, geocode.state].filter(Boolean).join(', ')
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-700 text-sm mb-4 inline-block">← Dashboard</Link>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="relative">
            <PhotoImage photoId={photo.id} alt={photo.filename || ''} className="w-full h-auto block" />
            {hasCoords && (
              <div key="geo-overlay" className="absolute bottom-3 left-3 w-max max-w-[min(260px,80%)] bg-black/40 backdrop-blur-sm text-white text-xs px-2.5 py-2 rounded-lg shadow font-mono">
                <p>{lat!.toFixed(5)}° {lat! >= 0 ? 'N' : 'S'}, {lng!.toFixed(5)}° {lng! >= 0 ? 'E' : 'W'}</p>
                {accuracy != null && <p>±{Math.round(accuracy)} m</p>}
                {geocodeLoading && <p className="text-white/80">Loading place…</p>}
                {!geocodeLoading && placeState && <p>{placeState}</p>}
                {createdAt && <p>{formatIST(createdAt)} IST</p>}
              </div>
            )}
          </div>
          <p className="p-3 text-slate-600 border-t border-slate-100"><strong>{photo.checkpoint_name}</strong> · {photo.entity} · {photo.execution_stage} · {photo.status}</p>
        </div>
      </div>
    </div>
  );
}
