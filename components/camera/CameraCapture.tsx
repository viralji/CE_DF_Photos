'use client';

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';

export type GeoCoords = { latitude: number; longitude: number; accuracy?: number } | null;

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

const EARTH_RADIUS_METERS = 6.371e6;

function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dlat = toRad(b.latitude - a.latitude);
  const dlon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(s));
}

function minDistanceMeters(
  position: { latitude: number; longitude: number },
  referenceLocations: { latitude: number; longitude: number }[]
): number {
  if (referenceLocations.length === 0) return 0;
  let min = distanceMeters(position, referenceLocations[0]);
  for (let i = 1; i < referenceLocations.length; i++) {
    const d = distanceMeters(position, referenceLocations[i]);
    if (d < min) min = d;
  }
  return min;
}

type Props = {
  onCapture: (file: File, geo: GeoCoords) => void;
  onCancel: () => void;
  disabled?: boolean;
  referenceLocations?: { latitude: number; longitude: number }[];
  maxDistanceMeters?: number;
  distanceCheckEnabled?: boolean;
  onDistanceExceeded?: (distanceMeters: number) => void;
  maxAccuracyMeters?: number | null;
  onAccuracyExceeded?: (accuracyMeters: number) => void;
};

export function CameraCapture({
  onCapture,
  onCancel,
  disabled,
  referenceLocations = [],
  maxDistanceMeters = 40,
  distanceCheckEnabled = false,
  onDistanceExceeded,
  maxAccuracyMeters = null,
  onAccuracyExceeded,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const bestPositionRef = useRef<{ latitude: number; longitude: number; accuracy?: number; at: number } | null>(null);
  const latestPositionRef = useRef<{ latitude: number; longitude: number; at: number } | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'choice' | 'live'>('choice');
  const [capturing, setCapturing] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'getting' | 'ready' | 'poor'>('idle');
  const [displayDistanceMeters, setDisplayDistanceMeters] = useState<number | null>(null);

  const getGeo = useCallback((): Promise<GeoCoords> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
          }),
        () => resolve(null),
        GEO_OPTIONS
      );
    });
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  useEffect(() => {
    if (mode !== 'live' || !navigator.geolocation) return;
    bestPositionRef.current = null;
    setGeoStatus('getting');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const accuracy = pos.coords.accuracy ?? Infinity;
        latestPositionRef.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          at: now,
        };
        const prev = bestPositionRef.current;
        if (prev == null || (prev.accuracy != null && accuracy < prev.accuracy)) {
          bestPositionRef.current = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            at: now,
          };
          setGeoStatus(accuracy <= 50 ? 'ready' : 'poor');
        }
      },
      () => setGeoStatus('poor'),
      GEO_OPTIONS
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      bestPositionRef.current = null;
      latestPositionRef.current = null;
      setGeoStatus('idle');
      setDisplayDistanceMeters(null);
    };
  }, [mode]);

  // Throttled min-distance display: update at most every 1.5s when there are reference locations
  useEffect(() => {
    if (mode !== 'live' || !referenceLocations?.length) return;
    setDisplayDistanceMeters(null);
    const interval = setInterval(() => {
      const latest = latestPositionRef.current;
      if (!latest || Date.now() - latest.at > 10000) return;
      const d = Math.round(minDistanceMeters(latest, referenceLocations));
      setDisplayDistanceMeters((prev) => (prev === d ? prev : d));
    }, 1500);
    return () => clearInterval(interval);
  }, [mode, referenceLocations]);

  useLayoutEffect(() => {
    if (mode !== 'live' || !streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = streamRef.current;
    video.play().catch((err) => {
      setError('Could not start camera. Allow camera access and try again.');
    });
  }, [mode]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) {
        setError('Please select an image file.');
        return;
      }
      setError('');
      const geo = await getGeo();
      if (distanceCheckEnabled && referenceLocations.length > 0 && geo && onDistanceExceeded) {
        const minDist = minDistanceMeters(geo, referenceLocations);
        if (minDist > maxDistanceMeters) {
          onDistanceExceeded(minDist);
          return;
        }
      }
      onCapture(file, geo);
    },
    [getGeo, onCapture, distanceCheckEnabled, referenceLocations, maxDistanceMeters, onDistanceExceeded]
  );

  const startLiveCamera = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera not supported. Use "Choose from gallery" or try another browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('live');
    } catch (err) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        setMode('live');
      } catch (e) {
        setError('Could not access camera. Use "Choose from gallery" or allow camera permission.');
      }
    }
  }, []);

  const captureFromLive = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || capturing) return;
    setCapturing(true);
    try {
      let geo: GeoCoords = null;
      const best = bestPositionRef.current;
      const ageMs = best ? Date.now() - best.at : Infinity;
      if (best && ageMs < 5000) {
        geo = { latitude: best.latitude, longitude: best.longitude, accuracy: best.accuracy };
      } else {
        if (navigator.geolocation) {
          geo = await getGeo();
        }
      }

      if (distanceCheckEnabled && referenceLocations.length > 0 && onDistanceExceeded) {
        const latest = latestPositionRef.current;
        const useLatest = latest && Date.now() - latest.at < 5000;
        const checkPos = useLatest
          ? { latitude: latest.latitude, longitude: latest.longitude }
          : geo;
        if (checkPos) {
          const minDist = minDistanceMeters(checkPos, referenceLocations);
          if (minDist > maxDistanceMeters) {
            onDistanceExceeded(minDist);
            setCapturing(false);
            return;
          }
        }
      }

      if (maxAccuracyMeters != null && onAccuracyExceeded) {
        const accuracy = geo?.accuracy;
        if (accuracy == null || accuracy > maxAccuracyMeters) {
          if (accuracy != null) onAccuracyExceeded(accuracy);
          else onAccuracyExceeded(Infinity);
          setCapturing(false);
          return;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Could not capture image.');
        setCapturing(false);
        return;
      }
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) {
        setError('Could not create image.');
        setCapturing(false);
        return;
      }
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopStream();
      setMode('choice');
      onCapture(file, geo);
    } catch (e) {
      setError('Capture failed.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, getGeo, onCapture, stopStream, distanceCheckEnabled, referenceLocations, maxDistanceMeters, onDistanceExceeded, maxAccuracyMeters, onAccuracyExceeded]);

  const handleCameraClick = useCallback(() => {
    setError('');
    startLiveCamera();
  }, [startLiveCamera]);

  const handleGalleryClick = useCallback(() => {
    setError('');
    galleryInputRef.current?.click();
  }, []);

  const backToChoice = useCallback(() => {
    stopStream();
    setMode('choice');
    setError('');
  }, [stopStream]);

  if (mode === 'live') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-black">
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain bg-black rounded-lg"
            style={{ maxHeight: '70vh' }}
          />
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
        <div className="flex-shrink-0 p-4 bg-black/80 flex flex-col gap-2">
          {bestPositionRef.current?.accuracy != null && (
            <p className={`text-xs text-center ${geoStatus === 'ready' ? 'text-green-400' : 'text-amber-400'}`}>
              GPS ±{Math.round(bestPositionRef.current.accuracy)} m
              {referenceLocations.length > 0 && displayDistanceMeters != null && (
                <span className="block mt-0.5">{displayDistanceMeters < 1000 ? `${displayDistanceMeters} m` : `${(displayDistanceMeters / 1000).toFixed(1)} km`} from nearest existing photo</span>
              )}
              {geoStatus === 'poor' && ' — move to open sky for better accuracy'}
            </p>
          )}
          {geoStatus === 'getting' && bestPositionRef.current?.accuracy == null && (
            <p className="text-xs text-slate-400 text-center">Getting location…</p>
          )}
          <button
            type="button"
            onClick={captureFromLive}
            disabled={capturing}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {capturing ? 'Capturing…' : 'Capture photo'}
          </button>
          <button
            type="button"
            onClick={backToChoice}
            className="w-full py-2 border border-slate-400 text-white rounded-lg hover:bg-white/10"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Add photo</h3>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleCameraClick}
            disabled={disabled}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Take photo (camera)
          </button>
          <button
            type="button"
            onClick={handleGalleryClick}
            disabled={disabled}
            className="w-full px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            Choose from gallery
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
