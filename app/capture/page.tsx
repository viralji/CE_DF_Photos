'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CameraCapture } from '@/components/camera/CameraCapture';
import { uniqueCheckpointCodes, uniqueEntityCodes } from '@/lib/photo-filename';

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

type RequiredRow = { checkpointId: number; checkpointName: string; entity: string; stage: string; photoTypeNumber: number };

export default function CapturePage() {
  const [routeId, setRouteId] = useState<string | ''>('');
  const [subsectionId, setSubsectionId] = useState<string | ''>('');
  const [entity, setEntity] = useState<string | ''>('');
  const [message, setMessage] = useState('');
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [cameraForRow, setCameraForRow] = useState<RequiredRow | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{
    id: number;
    imageUrl: string;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracy?: number | null;
    createdAt?: string | null;
  } | null>(null);

  const queryClient = useQueryClient();
  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: subsectionsData } = useQuery({
    queryKey: ['subsections', routeId],
    queryFn: () => getSubsections(routeId),
    enabled: !!routeId,
  });
  const hasSelection = !!routeId && !!subsectionId;
  const { data: photosData, refetch: refetchPhotos } = useQuery({
    queryKey: ['photos', routeId, subsectionId],
    queryFn: () => getPhotos(routeId, subsectionId),
    enabled: hasSelection,
  });
  const { data: checkpointsData } = useQuery({ queryKey: ['checkpoints'], queryFn: getCheckpoints });

  const routes = (routesData?.routes ?? []) as { route_id: string; route_name?: string }[];
  const subsections = (subsectionsData?.subsections ?? []) as { subsection_id: string; subsection_name?: string }[];
  const photos = (photosData?.photos ?? []) as {
    id: number;
    checkpoint_id: number;
    execution_stage: string;
    photo_type_number: number;
    photo_category?: string;
    status?: string;
    latitude?: number | null;
    longitude?: number | null;
    location_accuracy?: number | null;
    created_at?: string | null;
  }[];
  const checkpoints = (checkpointsData?.checkpoints ?? []) as {
    id: number;
    entity: string;
    checkpoint_name: string;
    execution_before: number;
    execution_ongoing: number;
    execution_after: number;
    photo_type?: number;
  }[];

  const checkpointCodeMap = useMemo(() => uniqueCheckpointCodes(checkpoints.map((c) => ({ id: c.id, checkpoint_name: c.checkpoint_name }))), [checkpoints]);
  const entityCodeMap = useMemo(() => uniqueEntityCodes(checkpoints.map((c) => ({ entity: c.entity || '' }))), [checkpoints]);

  const requiredRows: RequiredRow[] = [];
  checkpoints.forEach((c) => {
    const stages = [
      ...(c.execution_before ? ['Before'] : []),
      ...(c.execution_ongoing ? ['Ongoing'] : []),
      ...(c.execution_after ? ['After'] : []),
    ];
    const photoSlots = Math.max(1, c.photo_type ?? 1);
    stages.forEach((stage) => {
      for (let i = 1; i <= photoSlots; i++) {
        requiredRows.push({ checkpointId: c.id, checkpointName: c.checkpoint_name, entity: c.entity ?? '', stage, photoTypeNumber: i });
      }
    });
  });

  const rowsByEntity = (() => {
    const map: Record<string, RequiredRow[]> = {};
    requiredRows.forEach((row) => {
      const e = row.entity || 'Other';
      if (!map[e]) map[e] = [];
      map[e].push(row);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  })();

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setLocationStatus('granted'),
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true }
    );
  }, []);

  function getRowKey(row: RequiredRow) {
    return `${row.checkpointId}-${row.stage}-${row.photoTypeNumber}`;
  }

  function openCamera(row: RequiredRow) {
    setCameraForRow(row);
  }

  async function handleCaptureComplete(file: File, geo: { latitude: number; longitude: number; accuracy?: number } | null) {
    if (!cameraForRow || !routeId || !subsectionId) return;
    const stageMap: Record<string, string> = { Before: 'B', Ongoing: 'O', After: 'A' };
    const formData = new FormData();
    formData.append('file', file);
    formData.append('routeId', routeId);
    formData.append('subsectionId', subsectionId);
    formData.append('checkpointId', String(cameraForRow.checkpointId));
    formData.append('executionStage', stageMap[cameraForRow.stage] || 'O');
    formData.append('photoTypeNumber', String(cameraForRow.photoTypeNumber));
    formData.append('photoCategory', cameraForRow.entity || '');
    if (geo) {
      formData.append('latitude', String(geo.latitude));
      formData.append('longitude', String(geo.longitude));
      if (geo.accuracy != null) formData.append('locationAccuracy', String(geo.accuracy));
    }
    try {
      const res = await fetch('/api/photos/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error || 'Upload failed'}`);
        return;
      }
      setMessage('Photo uploaded successfully!');
      setTimeout(() => setMessage(''), 3000);
      refetchPhotos();
    } catch (error: unknown) {
      setMessage(`Error uploading: ${(error as Error).message}`);
    } finally {
      setCameraForRow(null);
    }
  }

  function findPhotoForRow(row: RequiredRow) {
    const stageMap: Record<string, string> = { Before: 'B', Ongoing: 'O', After: 'A' };
    return photos.find(
      (p) =>
        p.checkpoint_id === row.checkpointId &&
        p.execution_stage === stageMap[row.stage] &&
        p.photo_type_number === row.photoTypeNumber
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between min-h-[44px]">
          <div className="flex items-center gap-2 min-h-0">
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-10 h-10 -ml-2 text-slate-600 hover:text-slate-800 touch-manipulation"
              aria-label="Back to dashboard"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </Link>
            <h1 className="text-lg font-bold text-slate-900 leading-none py-2">Capture</h1>
          </div>
          {locationStatus === 'granted' && (
            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded">GPS Active</span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 space-y-4">
        {/* Location Alert */}
        {locationStatus === 'denied' && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <h3 className="font-semibold text-red-900 text-sm mb-1">Location Required</h3>
            <p className="text-sm text-red-700">Enable location services to capture geo-tagged photos.</p>
          </div>
        )}

        {message && (
          <div className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{message}</span>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Route</label>
              <SearchableSelect
                options={routes.map((r) => ({ value: String(r.route_id), label: r.route_name || `Route ${r.route_id}` }))}
                value={routeId}
                onChange={(v) => { setRouteId(String(v ?? '')); setSubsectionId(''); }}
                placeholder="Select route..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Subsection</label>
              <SearchableSelect
                options={subsections.map((s) => ({ value: String(s.subsection_id), label: s.subsection_name || `Sub ${s.subsection_id}` }))}
                value={subsectionId}
                onChange={(v) => setSubsectionId(String(v ?? ''))}
                placeholder="Select subsection..."
                disabled={!routeId}
              />
            </div>
          </div>
        </div>

        {hasSelection && requiredRows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-3 py-1 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-lg">
              <h2 className="font-semibold text-slate-800 text-xs">Required Photos</h2>
              <span className="text-slate-500 text-xs">{photos.length} / {requiredRows.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {rowsByEntity.map(([entityName, rows]) => (
                <div key={entityName} className="relative">
                  <div className="sticky top-14 z-20 px-3 py-1 leading-tight bg-blue-50 border-b border-blue-100 text-blue-800 font-semibold text-xs uppercase tracking-wide flex items-center gap-2">
                    <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded">{entityCodeMap.get(entityName || 'Other') ?? '—'}</span>
                    {entityName}
                  </div>
                  <div className="pt-0.5">
                  {rows.map((row) => {
                    const photo = findPhotoForRow(row);
                    const hasPhoto = !!photo;
                    const isRejected = photo?.status === 'rejected';
                    return (
                      <div
                        key={getRowKey(row)}
                        className={`flex items-center gap-3 pl-3 pr-4 py-2 min-h-0 border-l-2 transition-colors ${
                          hasPhoto && !isRejected
                            ? 'bg-green-50 border-l-green-400'
                            : isRejected
                            ? 'bg-red-50 border-l-red-400'
                            : 'bg-white border-l-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                          hasPhoto && !isRejected ? 'bg-green-500' : isRejected ? 'bg-red-500' : 'bg-slate-300'
                        }`}>
                          {hasPhoto && !isRejected ? (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : isRejected ? (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-slate-500 text-xs shrink-0">{checkpointCodeMap.get(row.checkpointId) ?? '—'}</span>
                          <span className="font-medium text-slate-900 text-sm truncate">{row.checkpointName}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            row.stage === 'Before' ? 'bg-blue-100 text-blue-700' :
                            row.stage === 'Ongoing' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {row.stage}
                            {row.photoTypeNumber > 1 ? ` #${row.photoTypeNumber}` : ''}
                          </span>
                          {isRejected && <span className="text-red-600 text-[10px] font-medium">Rejected</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasPhoto && (
                            <button
                              onClick={() => setViewingPhoto({ id: photo.id, imageUrl: `/api/photos/${photo.id}/image`, latitude: photo.latitude, longitude: photo.longitude, locationAccuracy: photo.location_accuracy, createdAt: photo.created_at })}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="View photo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => openCamera(row)}
                            disabled={locationStatus !== 'granted' || (hasPhoto && !isRejected)}
                            title={hasPhoto && !isRejected ? 'Done' : isRejected ? 'Retake' : 'Capture'}
                            className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md transition-colors ${
                              hasPhoto && !isRejected
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : isRejected
                                ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasSelection && requiredRows.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-slate-600 text-sm">No photo checkpoints configured. Add checkpoints in Admin.</p>
          </div>
        )}
      </main>

      {/* Camera Modal */}
      {cameraForRow && (
        <CameraCapture
          onCapture={handleCaptureComplete}
          onCancel={() => setCameraForRow(null)}
          disabled={locationStatus !== 'granted'}
        />
      )}

      {/* Photo View Modal */}
      {viewingPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewingPhoto(null)}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={viewingPhoto.imageUrl} alt="" className="max-h-[85vh] rounded-lg shadow-lg" />
            <div className="absolute top-4 right-4 flex gap-2">
              <Link
                href={`/view-photo/${viewingPhoto.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 text-sm font-medium rounded"
              >
                View Full Size
              </Link>
              <button
                onClick={() => setViewingPhoto(null)}
                className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 text-sm font-medium rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
