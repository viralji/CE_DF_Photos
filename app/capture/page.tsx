'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CameraCapture } from '@/components/camera/CameraCapture';
import { loadLastCaptureLocation, saveLastCaptureLocation } from '@/lib/capture-session';

const STAGE_MAP: Record<string, string> = { Before: 'B', Ongoing: 'O', After: 'A' };

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

async function getMe() {
  const res = await fetch('/api/me');
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

async function getComments(photoId: number) {
  const res = await fetch(`/api/photos/${photoId}/comments`);
  if (!res.ok) throw new Error('Failed to fetch comments');
  return res.json();
}

type RequiredRow = { checkpointId: number; checkpointName: string; entity: string; stage: string; photoTypeNumber: number };

export default function CapturePage() {
  const [routeId, setRouteId] = useState<string | ''>('');
  const [subsectionId, setSubsectionId] = useState<string | ''>('');
  const [message, setMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [cameraForRow, setCameraForRow] = useState<RequiredRow | null>(null);
  const [extraSlotsByKey, setExtraSlotsByKey] = useState<Record<string, number>>({});
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{
    id: number;
    imageUrl: string;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracy?: number | null;
    createdAt?: string | null;
  } | null>(null);
  const [commentModalPhotoId, setCommentModalPhotoId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [resubmitPhotoId, setResubmitPhotoId] = useState<number | null>(null);
  const [resubmitCommentModal, setResubmitCommentModal] = useState<{ photoId: number; row: RequiredRow } | null>(null);
  const [resubmitCommentInput, setResubmitCommentInput] = useState('');
  const [resubmitCommentToSend, setResubmitCommentToSend] = useState('');
  const [lastCaptureLocation, setLastCaptureLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showDistanceExceededPopup, setShowDistanceExceededPopup] = useState(false);
  const [distanceExceededValue, setDistanceExceededValue] = useState<number | null>(null);
  const [showAccuracyExceededPopup, setShowAccuracyExceededPopup] = useState(false);
  const [accuracyExceededValue, setAccuracyExceededValue] = useState<number | null>(null);

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const captureDistanceCheckEnabled = (meData?.captureDistanceCheckEnabled ?? true) as boolean;
  const maxGpsAccuracyMeters = (meData?.maxGpsAccuracyMeters ?? null) as number | null;
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
  const { data: commentsData, refetch: refetchComments } = useQuery({
    queryKey: ['photo-comments', commentModalPhotoId],
    queryFn: () => getComments(commentModalPhotoId!),
    enabled: !!commentModalPhotoId,
  });
  const comments = (commentsData?.comments ?? []) as { id: number; author_email: string; author_name: string | null; created_at: string; comment_text: string }[];

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
    execution_stage?: string | null;
    photo_type?: number;
  }[];

  const requiredRows = useMemo(() => {
    const rows: RequiredRow[] = [];
    checkpoints.forEach((c) => {
      const stage = (c.execution_stage === 'Before' || c.execution_stage === 'Ongoing' || c.execution_stage === 'After') ? c.execution_stage : 'Ongoing';
      const photoSlots = Math.max(1, c.photo_type ?? 1);
      for (let i = 1; i <= photoSlots; i++) {
        rows.push({ checkpointId: c.id, checkpointName: c.checkpoint_name, entity: c.entity ?? '', stage, photoTypeNumber: i });
      }
    });
    return rows;
  }, [checkpoints]);

  const maxPhotoTypeByKey = useMemo(() => {
    const map = new Map<string, number>();
    photos.forEach((p) => {
      const stageDisplay = p.execution_stage === 'B' ? 'Before' : p.execution_stage === 'O' ? 'Ongoing' : p.execution_stage === 'A' ? 'After' : 'Ongoing';
      const key = `${p.checkpoint_id}-${stageDisplay}`;
      const current = map.get(key) ?? 0;
      map.set(key, Math.max(current, p.photo_type_number));
    });
    return map;
  }, [photos]);

  const allRows = useMemo(() => {
    const extra: RequiredRow[] = [];
    checkpoints.forEach((c) => {
      const stage = (c.execution_stage === 'Before' || c.execution_stage === 'Ongoing' || c.execution_stage === 'After') ? c.execution_stage : 'Ongoing';
      const key = `${c.id}-${stage}`;
      const N = Math.max(1, c.photo_type ?? 1);
      const maxFromPhotos = maxPhotoTypeByKey.get(key) ?? 0;
      const existingExtra = Math.max(0, maxFromPhotos - N);
      const emptyExtra = extraSlotsByKey[key] ?? 0;
      const extraCount = Math.max(existingExtra, emptyExtra);
      for (let i = 1; i <= extraCount; i++) {
        extra.push({ checkpointId: c.id, checkpointName: c.checkpoint_name, entity: c.entity ?? '', stage, photoTypeNumber: N + i });
      }
    });
    const combined = [...requiredRows, ...extra];
    const entityOrder = [...new Set(requiredRows.map((r) => r.entity))];
    combined.sort((a, b) => {
      const ai = entityOrder.indexOf(a.entity);
      const bi = entityOrder.indexOf(b.entity);
      if (ai !== bi) return ai - bi;
      if (a.checkpointId !== b.checkpointId) return a.checkpointId - b.checkpointId;
      return a.photoTypeNumber - b.photoTypeNumber;
    });
    return combined;
  }, [requiredRows, checkpoints, maxPhotoTypeByKey, extraSlotsByKey]);

  const rowsByEntity = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, RequiredRow[]> = {};
    allRows.forEach((row) => {
      const e = row.entity || 'Other';
      if (!map[e]) {
        map[e] = [];
        order.push(e);
      }
      map[e].push(row);
    });
    return order.map((entity) => [entity, map[entity]] as [string, RequiredRow[]]);
  }, [allRows]);

  // Session = until logout. Restore last capture from localStorage so 40 m applies across refreshes/navigations.
  useEffect(() => {
    const stored = loadLastCaptureLocation();
    if (stored) setLastCaptureLocation(stored);
  }, []);

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

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current != null) clearTimeout(messageTimeoutRef.current);
    };
  }, []);

  function getRowKey(row: RequiredRow) {
    return `${row.checkpointId}-${row.stage}-${row.photoTypeNumber}`;
  }

  function openCamera(row: RequiredRow, forResubmitPhotoId: number | null = null) {
    setResubmitPhotoId(forResubmitPhotoId ?? null);
    setCameraForRow(row);
  }

  async function handleCaptureComplete(file: File, geo: { latitude: number; longitude: number; accuracy?: number } | null) {
    if (!cameraForRow || !routeId || !subsectionId) return;
    const row = cameraForRow;
    const existingPhotoId = resubmitPhotoId;
    const commentToSend = resubmitCommentToSend.trim();
    setCameraForRow(null);
    setResubmitPhotoId(null);
    setResubmitCommentToSend('');
    setUploadError('');
    setIsUploading(true);
    setMessage(existingPhotoId ? 'Resubmitting photo...' : 'Processing and uploading photo...');
    await new Promise((r) => setTimeout(r, 200));
    const startTime = Date.now();
    try {
      if (existingPhotoId) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('comment', commentToSend);
        if (geo) {
          formData.append('latitude', String(geo.latitude));
          formData.append('longitude', String(geo.longitude));
          if (geo.accuracy != null) formData.append('locationAccuracy', String(geo.accuracy));
        }
        const res = await fetch(`/api/photos/${existingPhotoId}/resubmit`, { method: 'POST', body: formData });
        const text = await res.text();
        let data: { error?: string } = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: 'Resubmit failed' }; }
        if (!res.ok) {
          setUploadError(typeof data?.error === 'string' ? data.error : 'Resubmit failed');
          setMessage('');
          return;
        }
        setMessage('Photo resubmitted successfully!');
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileSize', String(file.size));
        formData.append('fileLastModified', String(file.lastModified));
        formData.append('routeId', routeId);
        formData.append('subsectionId', subsectionId);
        formData.append('checkpointId', String(row.checkpointId));
        formData.append('executionStage', STAGE_MAP[row.stage] || 'O');
        formData.append('photoTypeNumber', String(row.photoTypeNumber));
        formData.append('photoCategory', row.entity || '');
        if (geo) {
          formData.append('latitude', String(geo.latitude));
          formData.append('longitude', String(geo.longitude));
          if (geo.accuracy != null) formData.append('locationAccuracy', String(geo.accuracy));
        }
        const res = await fetch('/api/photos/upload', { method: 'POST', body: formData });
        const text = await res.text();
        let data: { error?: string } = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: 'Upload failed' }; }
        if (!res.ok) {
          setUploadError(typeof data?.error === 'string' ? data.error : 'Upload failed');
          setMessage('');
          return;
        }
        setMessage('Photo uploaded successfully!');
        let loc: { latitude: number; longitude: number } | null = geo
          ? { latitude: geo.latitude, longitude: geo.longitude }
          : null;
        if (!loc && typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 8000,
              });
            });
            loc = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
          } catch {
            // ignore
          }
        }
        if (loc) {
          setLastCaptureLocation(loc);
          saveLastCaptureLocation(loc);
        }
      }
      const elapsed = Date.now() - startTime;
      const minWait = Math.max(0, 1500 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, minWait));
      if (messageTimeoutRef.current != null) clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = setTimeout(() => { setMessage(''); messageTimeoutRef.current = null; }, 3000);
      refetchPhotos();
    } catch (error: unknown) {
      setUploadError((error as Error).message);
      setMessage('');
    } finally {
      setIsUploading(false);
    }
  }

  function findPhotoForRow(row: RequiredRow) {
    return photos.find(
      (p) =>
        p.checkpoint_id === row.checkpointId &&
        p.execution_stage === STAGE_MAP[row.stage] &&
        p.photo_type_number === row.photoTypeNumber
    );
  }

  async function handleAddComment() {
    if (!commentModalPhotoId || !commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/photos/${commentModalPhotoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(typeof data?.error === 'string' ? data.error : 'Failed to add comment');
        return;
      }
      setCommentText('');
      refetchComments();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setCommentSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {isUploading && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" aria-live="polite">
          <div className="bg-white rounded-xl shadow-2xl px-6 py-5 flex items-center gap-4 min-w-[240px]">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
            <span className="font-medium text-slate-800">Processing and uploading photo…</span>
          </div>
        </div>
      )}
      {showDistanceExceededPopup && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40"
          aria-live="polite"
          role="dialog"
          aria-labelledby="distance-exceeded-title"
          aria-describedby="distance-exceeded-desc"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 border border-slate-200">
            <h2 id="distance-exceeded-title" className="font-semibold text-slate-900 text-base mb-2">
              Distance too far
            </h2>
            <p id="distance-exceeded-desc" className="text-sm text-slate-600 mb-4">
              {distanceExceededValue != null
                ? `You are about ${Math.round(distanceExceededValue)} m from your last capture. Distance must be 40 m or less to take a photo. Contact Admin to enable an exception.`
                : 'You are more than 40 m from your last capture. You cannot take a photo. Contact Admin to enable exception.'}
            </p>
            <button
              type="button"
              onClick={() => { setShowDistanceExceededPopup(false); setDistanceExceededValue(null); }}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showAccuracyExceededPopup && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40"
          aria-live="polite"
          role="dialog"
          aria-labelledby="accuracy-exceeded-title"
          aria-describedby="accuracy-exceeded-desc"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 border border-slate-200">
            <h2 id="accuracy-exceeded-title" className="font-semibold text-slate-900 text-base mb-2">
              GPS accuracy too low
            </h2>
            <p id="accuracy-exceeded-desc" className="text-sm text-slate-600 mb-4">
              {accuracyExceededValue != null && Number.isFinite(accuracyExceededValue)
                ? `GPS accuracy ±${Math.round(accuracyExceededValue)} m is worse than the allowed ±${maxGpsAccuracyMeters ?? '?'} m. Move to open sky or enable high-accuracy GPS and try again.`
                : `GPS accuracy is unknown. The allowed accuracy is ±${maxGpsAccuracyMeters ?? '?'} m. Move to open sky or enable high-accuracy GPS and try again.`}
            </p>
            <button
              type="button"
              onClick={() => { setShowAccuracyExceededPopup(false); setAccuracyExceededValue(null); }}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
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

        {uploadError && (
          <div
            className="fixed top-4 left-4 right-4 z-[9999] bg-red-600 text-white px-4 py-3 rounded-lg text-sm flex items-center gap-2 shadow-lg"
            role="alert"
            key={uploadError}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium flex-1 min-w-0">{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError('')}
              className="p-1.5 rounded hover:bg-white/20 transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {message && (
          <div className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm flex items-center gap-2 relative z-[110]">
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
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

        {hasSelection && allRows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-3 py-1 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-lg">
              <h2 className="font-semibold text-slate-800 text-xs">Required Photos</h2>
              <span className="text-slate-500 text-xs">{photos.length} / {allRows.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {rowsByEntity.map(([entityName, rows]) => {
                const byCheckpointKey = new Map<string, RequiredRow[]>();
                const keyOrder: string[] = [];
                rows.forEach((row) => {
                  const key = `${row.checkpointId}-${row.stage}`;
                  if (!byCheckpointKey.has(key)) {
                    byCheckpointKey.set(key, []);
                    keyOrder.push(key);
                  }
                  byCheckpointKey.get(key)!.push(row);
                });
                return (
                <div key={entityName} className="relative">
                  <div className="sticky top-14 z-20 px-3 py-1 leading-tight bg-blue-50 border-b border-blue-100 text-blue-800 font-semibold text-xs uppercase tracking-wide">
                    {entityName}
                  </div>
                  <div className="pt-0.5">
                  {keyOrder.map((groupKey) => (
                    <div key={groupKey} className="relative">
                  {(byCheckpointKey.get(groupKey) ?? []).map((row, idx) => {
                    const groupRows = byCheckpointKey.get(groupKey) ?? [];
                    const isLastInGroup = idx === groupRows.length - 1;
                    const photo = findPhotoForRow(row);
                    const hasPhoto = !!photo;
                    const needsAttention = photo?.status === 'qc_required' || photo?.status === 'nc';
                    const statusLabel = photo?.status === 'qc_required' ? 'QC Required' : photo?.status === 'nc' ? 'NC' : null;
                    return (
                      <div
                        key={getRowKey(row)}
                        className={`flex items-center gap-3 pl-3 pr-4 py-2 min-h-0 border-l-2 transition-colors ${
                          hasPhoto && !needsAttention
                            ? 'bg-green-50 border-l-green-400'
                            : needsAttention
                            ? 'bg-amber-50 border-l-amber-400'
                            : 'bg-white border-l-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                          hasPhoto && !needsAttention ? 'bg-green-500' : needsAttention ? 'bg-amber-500' : 'bg-slate-300'
                        }`}>
                          {hasPhoto && !needsAttention ? (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : needsAttention ? (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 text-sm truncate">{row.checkpointName}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            row.stage === 'Before' ? 'bg-blue-100 text-blue-700' :
                            row.stage === 'Ongoing' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {row.stage}
                            {row.photoTypeNumber > 1 ? ` #${row.photoTypeNumber}` : ''}
                          </span>
                          {statusLabel && <span className="text-amber-700 text-[10px] font-medium">{statusLabel}</span>}
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
                          {needsAttention && (
                            <button
                              onClick={() => setCommentModalPhotoId(photo.id)}
                              className="inline-flex items-center gap-1 p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                              title="View reviewer feedback before retake"
                            >
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              <span className="text-xs font-medium hidden sm:inline">View feedback</span>
                            </button>
                          )}
                          <button
                            onClick={() => (needsAttention ? setResubmitCommentModal({ photoId: photo.id, row }) : openCamera(row, null))}
                            disabled={locationStatus !== 'granted' || (hasPhoto && !needsAttention)}
                            title={hasPhoto && !needsAttention ? 'Done' : needsAttention ? 'Retake' : 'Capture'}
                            className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md transition-colors ${
                              hasPhoto && !needsAttention
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : needsAttention
                                ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                          {isLastInGroup && (
                            <button
                              type="button"
                              onClick={() => setExtraSlotsByKey((prev) => ({ ...prev, [groupKey]: (prev[groupKey] ?? 0) + 1 }))}
                              className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Add another photo for this checkpoint"
                              aria-label="Add photo"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                  ))}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {hasSelection && allRows.length === 0 && (
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
          onCancel={() => {
            setCameraForRow(null);
            setResubmitPhotoId(null);
            setResubmitCommentToSend('');
          }}
          disabled={locationStatus !== 'granted'}
          lastCaptureLocation={lastCaptureLocation}
          maxDistanceMeters={40}
          distanceCheckEnabled={captureDistanceCheckEnabled}
          onDistanceExceeded={(dist) => {
            setDistanceExceededValue(dist);
            setShowDistanceExceededPopup(true);
          }}
          maxAccuracyMeters={maxGpsAccuracyMeters}
          onAccuracyExceeded={(acc) => {
            setAccuracyExceededValue(Number.isFinite(acc) ? acc : null);
            setShowAccuracyExceededPopup(true);
          }}
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

      {/* Comment modal for QC Required / NC photos */}
      {commentModalPhotoId != null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => { setCommentModalPhotoId(null); setCommentText(''); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Comments</h3>
              <button
                type="button"
                onClick={() => { setCommentModalPhotoId(null); setCommentText(''); }}
                className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {comments.length === 0 ? (
                <p className="text-slate-500 text-sm">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="text-sm border-l-2 border-slate-200 pl-3 py-1">
                    <p className="text-slate-700">{c.comment_text}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.author_name || c.author_email} · {new Date(c.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-200">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={2}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => { setCommentModalPhotoId(null); setCommentText(''); }}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || commentSubmitting}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commentSubmitting ? 'Sending…' : 'Add comment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comment required before resubmitting (QC/NC retake) */}
      {resubmitCommentModal != null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => { setResubmitCommentModal(null); setResubmitCommentInput(''); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-2">Comment required before resubmitting</h3>
            <p className="text-sm text-slate-600 mb-3">Add a comment for the reviewer before taking a new photo.</p>
            <textarea
              value={resubmitCommentInput}
              onChange={(e) => setResubmitCommentInput(e.target.value)}
              placeholder="Enter comment..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setResubmitCommentModal(null); setResubmitCommentInput(''); }}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmed = resubmitCommentInput.trim();
                  if (!trimmed) return;
                  setResubmitCommentToSend(trimmed);
                  setResubmitPhotoId(resubmitCommentModal.photoId);
                  setCameraForRow(resubmitCommentModal.row);
                  setResubmitCommentModal(null);
                  setResubmitCommentInput('');
                }}
                disabled={!resubmitCommentInput.trim()}
                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
