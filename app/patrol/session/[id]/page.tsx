'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PatrolPhotoLightbox } from '@/components/patrol/PatrolPhotoLightbox';
import { haversineMeters } from '@/lib/patrol-helpers';

interface PatrolSession {
  id: number;
  route_id: string;
  route_name: string;
  status: string;
  started_at: string;
  total_distance_meters: number;
  photo_count: number;
  flag_count: number;
  photo_interval_meters: number;
}

interface Ping {
  latitude: number;
  longitude: number;
  cumulative_distance: number;
  recorded_at: string;
}

interface PatrolPhoto {
  id: number;
  s3_url: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  created_at: string;
}

type AlertState = 'ok' | 'warn' | 'block';

const PING_INTERVAL_MS = 30_000;
const BLOCK_MULTIPLIER = 1.5;

export default function ActivePatrolPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<PatrolSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cumulativeDistance, setCumulativeDistance] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [alertState, setAlertState] = useState<AlertState>('ok');
  const [distanceSinceLastPhoto, setDistanceSinceLastPhoto] = useState(0);
  const [lastPhotoCoords, setLastPhotoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  /** When true, captured photo is also submitted as a patrol flag (comment required). */
  const [markAsFlag, setMarkAsFlag] = useState(false);
  const [flagDescription, setFlagDescription] = useState('');
  const [flagSeverity, setFlagSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [endingPatrol, setEndingPatrol] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ok' | 'error'>('acquiring');
  const [mapInitialized, setMapInitialized] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<PatrolPhoto[]>([]);
  const [photoToast, setPhotoToast] = useState(false);
  const [photoToastMessage, setPhotoToastMessage] = useState('Photo saved');
  const [lightbox, setLightbox] = useState<{
    imageUrl: string;
    title?: string;
    subtitle?: string;
    openInNewTabHref?: string | null;
  } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const patrollerMarkerRef = useRef<unknown>(null);
  const trailPolylineRef = useRef<unknown>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingsRef = useRef<Ping[]>([]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load session
  useEffect(() => {
    fetch(`/api/patrol/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        const s = data.session as PatrolSession;
        setSession(s);
        setCumulativeDistance(s.total_distance_meters);
        setPhotoCount(s.photo_count);
        setFlagCount(s.flag_count);
        if (s.status !== 'active') setError('This patrol has already ended.');
      })
      .catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false));
  }, [id]);

  // Load existing pings for trail
  useEffect(() => {
    if (!id) return;
    fetch(`/api/patrol/sessions/${id}/ping`)
      .then((r) => r.json())
      .then((data) => { pingsRef.current = data.pings ?? []; })
      .catch(() => {});
  }, [id]);

  // Load last photos for thumbnail strip + distance tracking
  useEffect(() => {
    if (!id) return;
    fetch(`/api/patrol/sessions/${id}/photos`)
      .then((r) => r.json())
      .then((data) => {
        const photos: PatrolPhoto[] = data.photos ?? [];
        setRecentPhotos(photos.slice(-3));
        if (photos.length > 0) {
          const last = photos[photos.length - 1];
          setLastPhotoCoords({ lat: last.latitude, lng: last.longitude });
        }
      })
      .catch(() => {});
  }, [id]);

  // Leaflet map init
  useEffect(() => {
    if (!mapRef.current || mapInitialized) return;
    let destroyed = false;
    import('leaflet').then((L) => {
      if (destroyed || !mapRef.current) return;
      // @ts-expect-error leaflet default icon fix
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({ iconUrl: '/leaflet/marker-icon.png', iconRetinaUrl: '/leaflet/marker-icon-2x.png', shadowUrl: '/leaflet/marker-shadow.png' });
      const map = L.default.map(mapRef.current, { zoomControl: true, attributionControl: false });
      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      mapInstanceRef.current = map;
      setMapInitialized(true);
    });
    return () => { destroyed = true; };
  }, [mapInitialized]);

  const updateMapTrail = useCallback((pings: Ping[], current?: { lat: number; lng: number }) => {
    if (!mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current as ReturnType<typeof L.default.map>;
      const coords = pings.map((p) => [p.latitude, p.longitude] as [number, number]);
      if (current) coords.push([current.lat, current.lng]);
      if (coords.length === 0) return;

      if (trailPolylineRef.current) {
        (trailPolylineRef.current as ReturnType<typeof L.default.polyline>).setLatLngs(coords);
      } else {
        trailPolylineRef.current = L.default.polyline(coords, { color: '#2563eb', weight: 3, opacity: 0.7 }).addTo(map);
      }

      const lastCoord = coords[coords.length - 1];
      if (patrollerMarkerRef.current) {
        (patrollerMarkerRef.current as ReturnType<typeof L.default.marker>).setLatLng(lastCoord);
      } else {
        const icon = L.default.divIcon({ html: '<div style="width:16px;height:16px;background:#2563eb;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>', iconSize: [16, 16], iconAnchor: [8, 8], className: '' });
        patrollerMarkerRef.current = L.default.marker(lastCoord, { icon }).addTo(map);
      }
      map.setView(lastCoord, map.getZoom() < 15 ? 15 : map.getZoom());
    });
  }, []);

  // GPS + ping loop
  useEffect(() => {
    if (!session || session.status !== 'active') return;

    const sendPing = async (lat: number, lng: number, accuracy: number) => {
      try {
        const res = await fetch(`/api/patrol/sessions/${id}/ping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lng, accuracy }),
        });
        if (res.ok) {
          const data = await res.json();
          setCumulativeDistance(data.cumulative_distance);
          pingsRef.current.push({ latitude: lat, longitude: lng, cumulative_distance: data.cumulative_distance, recorded_at: new Date().toISOString() });
          updateMapTrail(pingsRef.current);

          if (lastPhotoCoords) {
            const d = haversineMeters(lastPhotoCoords.lat, lastPhotoCoords.lng, lat, lng);
            setDistanceSinceLastPhoto(d);
            const interval = session.photo_interval_meters;
            if (d >= interval * BLOCK_MULTIPLIER) setAlertState('block');
            else if (d >= interval) setAlertState('warn');
            else setAlertState('ok');
          }
        }
      } catch { /* queue offline */ }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCurrentCoords({ lat: latitude, lng: longitude, accuracy });
        setGpsStatus('ok');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );

    pingIntervalRef.current = setInterval(() => {
      if (currentCoords) sendPing(currentCoords.lat, currentCoords.lng, currentCoords.accuracy);
    }, PING_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id, lastPhotoCoords, updateMapTrail]);

  async function uploadPhoto(file: File) {
    if (!currentCoords) { setError('GPS location not available. Wait for GPS lock.'); return; }
    if (markAsFlag && !flagDescription.trim()) {
      setError('Add a comment when marking this capture as a flag.');
      return;
    }
    setPhotoUploading(true);
    setError('');
    const submitAsFlag = markAsFlag && flagDescription.trim().length > 0;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('latitude', String(currentCoords.lat));
      fd.append('longitude', String(currentCoords.lng));
      fd.append('accuracy', String(currentCoords.accuracy));
      const res = await fetch(`/api/patrol/sessions/${id}/photos`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Upload failed'); return; }
      setPhotoCount((c) => c + 1);
      setLastPhotoCoords({ lat: currentCoords.lat, lng: currentCoords.lng });
      setDistanceSinceLastPhoto(0);
      setAlertState('ok');
      if (data.photo) {
        setRecentPhotos((prev) => [...prev.slice(-2), data.photo as PatrolPhoto]);
      }

      if (submitAsFlag) {
        const flagFd = new FormData();
        flagFd.append('description', flagDescription.trim());
        flagFd.append('severity', flagSeverity);
        flagFd.append('latitude', String(currentCoords.lat));
        flagFd.append('longitude', String(currentCoords.lng));
        flagFd.append('accuracy', String(currentCoords.accuracy));
        flagFd.append('file', file);
        const flagRes = await fetch(`/api/patrol/sessions/${id}/flags`, { method: 'POST', body: flagFd });
        const flagData = await flagRes.json();
        if (!flagRes.ok) {
          setError(flagData.error || 'Photo saved, but flag could not be submitted.');
          return;
        }
        setFlagCount((c) => c + 1);
        setMarkAsFlag(false);
        setFlagDescription('');
        setFlagSeverity('medium');
      }

      setPhotoToastMessage(submitAsFlag ? 'Photo & flag saved' : 'Photo saved');
      setPhotoToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setPhotoToast(false), submitAsFlag ? 3500 : 3000);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function endPatrol() {
    setEndingPatrol(true);
    try {
      const res = await fetch(`/api/patrol/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (res.ok) window.location.href = '/patrol';
    } finally {
      setEndingPatrol(false);
    }
  }

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading patrol session…</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => router.push('/patrol')} className="text-blue-600 underline text-sm">Back to patrols</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-sm font-bold">{session?.route_name ?? session?.route_id}</p>
          <p className="text-xs text-slate-400">
            GPS: {gpsStatus === 'ok' ? `±${currentCoords?.accuracy?.toFixed(0)}m` : gpsStatus === 'acquiring' ? 'Acquiring…' : 'Error'}
          </p>
        </div>
        <button onClick={() => setShowEndConfirm(true)} className="text-xs bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded-lg">
          End Patrol
        </button>
      </header>

      {/* Stats bar */}
      <div className="bg-slate-700 text-white px-4 py-2 flex gap-6 text-sm flex-shrink-0">
        <span className="flex flex-col items-center">
          <span className="font-bold">{(cumulativeDistance / 1000).toFixed(2)}</span>
          <span className="text-xs text-slate-400">km</span>
        </span>
        <span className="flex flex-col items-center">
          <span className="font-bold">{photoCount}</span>
          <span className="text-xs text-slate-400">photos</span>
        </span>
        <span className="flex flex-col items-center">
          <span className="font-bold">{flagCount}</span>
          <span className="text-xs text-slate-400">flags</span>
        </span>
        {lastPhotoCoords && (
          <span className="flex flex-col items-center ml-auto">
            <span className={`font-bold ${alertState === 'block' ? 'text-red-400' : alertState === 'warn' ? 'text-amber-400' : 'text-green-400'}`}>
              {distanceSinceLastPhoto.toFixed(0)}m
            </span>
            <span className="text-xs text-slate-400">since photo</span>
          </span>
        )}
      </div>

      {/* Alert banner */}
      {alertState === 'warn' && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 animate-pulse flex-shrink-0">
          📸 Take a photo now — {distanceSinceLastPhoto.toFixed(0)}m since last
        </div>
      )}
      {alertState === 'block' && (
        <div className="bg-red-600 text-white text-center text-sm font-semibold py-2 flex-shrink-0">
          ⛔ {distanceSinceLastPhoto.toFixed(0)}m without a photo — take one now!
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 text-xs text-center py-1.5 flex-shrink-0">{error}</div>
      )}

      {/* Map */}
      <div className="relative flex-1 z-0">
        <div ref={mapRef} className="absolute inset-0" />

        {/* Success toast */}
        {photoToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
            <span>✓</span> {photoToastMessage}
          </div>
        )}

        {/* Thumbnail strip */}
        {recentPhotos.length > 0 && (
          <div className="absolute bottom-3 left-3 z-[500] flex gap-1.5">
            {recentPhotos.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  const timeStr = new Date(p.created_at).toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const acc = p.accuracy != null ? ` · GPS ±${Number(p.accuracy).toFixed(0)}m` : '';
                  setLightbox({
                    imageUrl: `/api/patrol/photos/${p.id}/image`,
                    title: session?.route_name ?? session?.route_id ?? 'Patrol photo',
                    subtitle: `${timeStr}${acc}`,
                    openInNewTabHref: `/api/patrol/photos/${p.id}/image`,
                  });
                }}
                className="w-14 h-14 rounded-lg overflow-hidden border-2 border-white shadow-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/patrol/photos/${p.id}/image`} alt="patrol photo" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Capture + optional flag (same flow as checkpoint-style capture) */}
      <div className="bg-slate-800 px-2 py-2 sm:px-3 flex flex-col gap-2 flex-shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-h-[42vh] sm:max-h-none overflow-y-auto">
        <div className="flex rounded-lg border border-slate-600 p-0.5 bg-slate-900/60 shrink-0" role="group" aria-label="Flag mode">
          <button
            type="button"
            onClick={() => { setMarkAsFlag(false); setFlagDescription(''); setError(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              !markAsFlag ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            No flag
          </button>
          <button
            type="button"
            onClick={() => setMarkAsFlag(true)}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              markAsFlag ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Flag
          </button>
        </div>
        {markAsFlag && (
          <div className="space-y-2 shrink-0">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Severity</p>
              <div className="flex gap-1.5">
                {(['low', 'medium', 'high'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFlagSeverity(s)}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold border ${
                      flagSeverity === s
                        ? s === 'high'
                          ? 'bg-red-600 border-red-500 text-white'
                          : s === 'medium'
                          ? 'bg-orange-500 border-orange-400 text-white'
                          : 'bg-amber-500 border-amber-400 text-white'
                        : 'border-slate-600 text-slate-300 hover:bg-slate-700/80'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="patrol-flag-comment" className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                Comment <span className="text-red-400">*</span>
              </label>
              <textarea
                id="patrol-flag-comment"
                value={flagDescription}
                onChange={(e) => { setFlagDescription(e.target.value); if (error) setError(''); }}
                placeholder="Describe the issue…"
                rows={2}
                className="w-full px-2 py-1.5 text-xs text-white bg-slate-900/80 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none placeholder:text-slate-500"
              />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (markAsFlag && !flagDescription.trim()) {
              setError('Comment is required when Flag is on.');
              return;
            }
            setError('');
            setShowCamera(true);
          }}
          disabled={photoUploading || gpsStatus !== 'ok' || (markAsFlag && !flagDescription.trim())}
          aria-label={photoUploading ? 'Uploading photo' : 'Take photo'}
          className={`flex w-full items-center justify-center gap-2 min-h-10 py-2 px-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors ${
            alertState === 'block'
              ? 'bg-red-600 text-white animate-pulse'
              : alertState === 'warn'
              ? 'bg-amber-500 text-white'
              : markAsFlag
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{photoUploading ? 'Uploading…' : markAsFlag ? 'Take photo (flag)' : 'Take Photo'}</span>
        </button>
      </div>

      {/* Live camera modal */}
      {showCamera && (
        <PatrolCameraModal
          gpsAccuracy={currentCoords?.accuracy ?? null}
          onCapture={(file) => { setShowCamera(false); uploadPhoto(file); }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* End patrol confirm */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50">
          <div className="bg-white w-full rounded-t-2xl p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">End Patrol?</h2>
            <p className="text-sm text-slate-500 mb-4">
              {(cumulativeDistance / 1000).toFixed(2)} km · {photoCount} photos · {flagCount} flags
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowEndConfirm(false)} className="flex-1 border border-slate-300 text-slate-700 py-2.5 rounded-lg font-medium">
                Cancel
              </button>
              <button onClick={endPatrol} disabled={endingPatrol} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-semibold disabled:opacity-60">
                {endingPatrol ? 'Ending…' : 'End Patrol'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <PatrolPhotoLightbox
          imageUrl={lightbox.imageUrl}
          title={lightbox.title}
          subtitle={lightbox.subtitle}
          openInNewTabHref={lightbox.openInNewTabHref}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ─── Live Camera Modal ──────────────────────────────────────────────────────

function PatrolCameraModal({
  gpsAccuracy,
  onCapture,
  onClose,
}: {
  gpsAccuracy: number | null;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'choice' | 'live'>('choice');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    setCameraError('');
    setCameraReady(false);
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setCameraReady(true);
          };
        }
      })
      .catch((err) => {
        if (!active) return;
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access and try again.'
            : 'Could not open camera: ' + err.message
        );
      });
    return () => {
      active = false;
      stopStream();
    };
  }, [mode, stopStream]);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  function captureFromLive() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady || capturing) return;
    setCapturing(true);
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) return;
        stopStream();
        const file = new File([blob], `patrol-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      },
      'image/jpeg',
      0.92
    );
  }

  function backToChoice() {
    stopStream();
    setCameraError('');
    setCapturing(false);
    setMode('choice');
  }

  function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onCapture(f);
  }

  if (mode === 'live') {
    return (
      <div className="fixed inset-0 z-[600] flex flex-col bg-black">
        <button
          type="button"
          onClick={backToChoice}
          className="absolute top-4 left-4 z-10 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white text-xl"
          aria-label="Back"
        >
          ✕
        </button>
        {gpsAccuracy !== null && (
          <div className="absolute top-4 right-4 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            GPS ±{gpsAccuracy.toFixed(0)}m
          </div>
        )}
        {cameraError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-white text-sm mb-4">{cameraError}</p>
            <button type="button" onClick={backToChoice} className="text-blue-400 underline text-sm">
              Back
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-w-full max-h-full object-contain bg-black rounded-lg"
                style={{ maxHeight: '70vh' }}
              />
            </div>
            <div className="flex-shrink-0 p-4 bg-black/80 flex flex-col gap-2">
              <button
                type="button"
                onClick={captureFromLive}
                disabled={!cameraReady || capturing}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {capturing ? 'Saving…' : 'Capture photo'}
              </button>
              <button
                type="button"
                onClick={backToChoice}
                className="w-full py-2 border border-slate-400 text-white rounded-lg hover:bg-white/10"
              >
                Back
              </button>
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1"
          aria-label="Close"
        >
          <span className="text-xl leading-none">×</span>
        </button>
        <h3 className="font-semibold text-slate-800 mb-3 pr-8">Add photo</h3>
        {gpsAccuracy !== null && (
          <p className="text-xs text-slate-500 mb-3">GPS ±{gpsAccuracy.toFixed(0)} m</p>
        )}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onGalleryChange}
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMode('live')}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Take photo (camera)
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="w-full px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
          >
            Choose from gallery
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
