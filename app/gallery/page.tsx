'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { PhotoImage } from '@/components/PhotoImage';

async function getRoutes() {
  const res = await fetch('/api/routes');
  if (!res.ok) throw new Error('Failed to fetch routes');
  return res.json();
}

async function getSubsections(routeId: string) {
  const res = await fetch(`/api/subsections?route_id=${routeId}`);
  if (!res.ok) throw new Error('Failed to fetch subsections');
  return res.json();
}

async function getPhotos(routeId: string, subsectionId: string) {
  const params = new URLSearchParams({ routeId, subsectionId, limit: '500' });
  const res = await fetch(`/api/photos?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch photos');
  return res.json();
}

async function getCheckpoints() {
  const res = await fetch('/api/checkpoints');
  if (!res.ok) throw new Error('Failed to fetch checkpoints');
  return res.json();
}

export default function GalleryPage() {
  const [routeId, setRouteId] = useState<string | ''>('');
  const [subsectionId, setSubsectionId] = useState<string | ''>('');

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: subsectionsData } = useQuery({
    queryKey: ['subsections', routeId],
    queryFn: () => getSubsections(routeId),
    enabled: !!routeId,
  });
  const { data: photosData } = useQuery({
    queryKey: ['photos', routeId, subsectionId],
    queryFn: () => getPhotos(routeId, subsectionId),
    enabled: !!routeId && !!subsectionId,
  });
  const { data: checkpointsData } = useQuery({ queryKey: ['checkpoints'], queryFn: getCheckpoints });

  const routes = (routesData?.routes ?? []) as { route_id: string; route_name?: string }[];
  const subsections = (subsectionsData?.subsections ?? []) as { subsection_id: string; subsection_name?: string }[];
  const photos = (photosData?.photos ?? []) as {
    id: number;
    entity?: string;
    checkpoint_name?: string;
    execution_stage?: string;
    status?: string;
  }[];

  const groupedByEntity = useMemo(() => {
    const map: Record<string, Record<string, typeof photos>> = {};
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
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-800 p-1 -ml-1 rounded"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-base font-bold text-slate-900">Gallery</h1>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-3 space-y-3">
        {/* Compact filters */}
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">Route</label>
              <SearchableSelect
                options={routes.map((r) => ({ value: String(r.route_id), label: r.route_name || `Route ${r.route_id}` }))}
                value={routeId}
                onChange={(v) => { setRouteId(String(v ?? '')); setSubsectionId(''); }}
                placeholder="Select route..."
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">Subsection</label>
              <SearchableSelect
                options={subsections.map((s) => ({ value: String(s.subsection_id), label: s.subsection_name || `Sub ${s.subsection_id}` }))}
                value={subsectionId}
                onChange={(v) => setSubsectionId(String(v ?? ''))}
                placeholder="Subsection..."
                disabled={!routeId}
              />
            </div>
            {routeId && subsectionId && photos.length > 0 && (
              <span className="text-xs text-slate-500 pb-2">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {routeId && subsectionId && (
          <div className="space-y-3">
            {Object.keys(groupedByEntity).length > 0 ? (
              Object.entries(groupedByEntity).map(([entity, checkpoints]) => (
                <div key={entity} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-blue-800 font-semibold text-xs uppercase tracking-wide">
                    {entity}
                  </div>
                  <div className="p-2 sm:p-3 space-y-3">
                    {Object.entries(checkpoints).map(([checkpoint, photoList]) => (
                      <div key={checkpoint}>
                        <p className="text-xs font-medium text-slate-600 mb-1.5 px-0.5">{checkpoint}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2">
                          {photoList.map((photo) => (
                            <Link
                              key={photo.id}
                              href={`/view-photo/${photo.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative aspect-square rounded-md overflow-hidden bg-slate-100 hover:ring-2 hover:ring-blue-400 transition-all"
                            >
                              <PhotoImage
                                photoId={photo.id}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              <span className={`absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[10px] font-medium text-white ${
                                photo.execution_stage === 'B' ? 'bg-blue-500' :
                                photo.execution_stage === 'O' ? 'bg-amber-500' : 'bg-green-600'
                              }`}>
                                {photo.execution_stage === 'B' ? 'B' : photo.execution_stage === 'O' ? 'O' : 'A'}
                              </span>
                              {photo.status === 'approved' && (
                                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                </span>
                              )}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg py-8 text-center">
                <p className="text-slate-500 text-sm">No photos for this route & subsection.</p>
              </div>
            )}
          </div>
        )}

        {(!routeId || !subsectionId) && (
          <div className="bg-white border border-slate-200 rounded-lg py-8 text-center">
            <p className="text-slate-500 text-sm">Select route and subsection above to browse photos.</p>
          </div>
        )}
      </main>
    </div>
  );
}
